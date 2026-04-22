import type { WhatsAppThreadStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { emitToUser, emitToRoom } from '../../shared/socket';
import type { NormalizedEvent } from './provider';

type InboundEvent = Extract<NormalizedEvent, { type: 'inbound_message' }>;

const OPT_OUT_REGEX = /^(stop|unsubscribe|arr[eê]t|توقف|لا\s?ارسل|kfi)$/i;

// ─── Inbound ingestion ─────────────────────────────────────────────────
export async function handleInboundMessage(event: InboundEvent): Promise<void> {
  const session = await prisma.whatsAppSession.findUnique({
    where: { instanceName: event.instance },
  });
  const assignedAgentId = session?.userId ?? null;
  const fromPhoneNormalized = normalizePhone(event.fromPhone);

  // Lookup customer by phone. Evolution reports the raw JID without "+",
  // so we check both the normalized and raw forms.
  const customer =
    (await prisma.customer.findFirst({
      where: { OR: [{ phone: fromPhoneNormalized }, { phone: event.fromPhone }] },
    })) ?? null;

  // Opt-out keyword match: mark the customer and queue a one-shot confirmation
  // so the sender sees feedback and doesn't keep retrying.
  const optingOut = OPT_OUT_REGEX.test(event.body.trim()) && customer && !customer.whatsappOptOut;
  if (optingOut) {
    await prisma.customer.update({
      where: { id: customer!.id },
      data: { whatsappOptOut: true, whatsappOptOutAt: new Date() },
    });
    await queueOptOutAck(fromPhoneNormalized, assignedAgentId);
  }

  const thread = await upsertThread({
    customerPhone: fromPhoneNormalized,
    customerId: customer?.id ?? null,
    assignedAgentId,
    increment: true,
  });

  const message = await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'in',
      body: event.body,
      mediaUrl: event.mediaUrl ?? null,
      fromPhone: fromPhoneNormalized,
      toPhone: session?.phoneNumber ?? '',
      providerId: event.providerId,
    },
  });

  if (assignedAgentId) emitToUser(assignedAgentId, 'whatsapp:inbound', { thread, message });
  emitToRoom('whatsapp:monitor', 'whatsapp:inbound', { thread, message });
}

const OPT_OUT_ACK = 'Safi, ma ghadi n3awdouch nsifto lik ay message. Choukran.';

async function queueOptOutAck(toPhone: string, agentId: string | null): Promise<void> {
  const log = await prisma.messageLog.create({
    data: {
      trigger: 'confirmation_confirmed', // placeholder — dedupeKey uniqueness is what matters
      recipientPhone: toPhone,
      body: OPT_OUT_ACK,
      status: 'queued',
      agentId,
      dedupeKey: `optout-ack:${toPhone}:${Date.now()}`,
    },
  });
  await whatsappQueue.add({ messageLogId: log.id });
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  return digits.startsWith('+') ? digits : `+${digits}`;
}

async function upsertThread(params: {
  customerPhone: string;
  customerId: string | null;
  assignedAgentId: string | null;
  increment?: boolean;
}) {
  const existing = await prisma.whatsAppThread.findUnique({
    where: {
      customerPhone_assignedAgentId: {
        customerPhone: params.customerPhone,
        assignedAgentId: params.assignedAgentId ?? '',
      },
    },
  });
  if (existing) {
    return prisma.whatsAppThread.update({
      where: { id: existing.id },
      data: {
        lastMessageAt: new Date(),
        ...(params.increment ? { unreadCount: { increment: 1 } } : {}),
        ...(params.customerId && !existing.customerId ? { customerId: params.customerId } : {}),
      },
    });
  }
  return prisma.whatsAppThread.create({
    data: {
      customerPhone: params.customerPhone,
      customerId: params.customerId,
      assignedAgentId: params.assignedAgentId,
      unreadCount: params.increment ? 1 : 0,
      lastMessageAt: new Date(),
    },
  });
}

// ─── Reads ─────────────────────────────────────────────────────────────
export async function listThreads(params: {
  agentId?: string;
  status?: WhatsAppThreadStatus;
  limit?: number;
}) {
  return prisma.whatsAppThread.findMany({
    where: {
      ...(params.agentId ? { assignedAgentId: params.agentId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { lastMessageAt: 'desc' },
    take: Math.min(params.limit ?? 100, 200),
    include: {
      customer: { select: { id: true, fullName: true, phoneDisplay: true, city: true, whatsappOptOut: true } },
      assignedAgent: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { body: true, direction: true, createdAt: true },
      },
    },
  });
}

export async function listMessages(threadId: string, limit = 100) {
  return prisma.whatsAppMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 500),
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function markThreadRead(threadId: string) {
  await prisma.whatsAppThread.update({
    where: { id: threadId },
    data: { unreadCount: 0 },
  });
  await prisma.whatsAppMessage.updateMany({
    where: { threadId, direction: 'in', readAt: null },
    data: { readAt: new Date() },
  });
}

export async function updateThread(
  threadId: string,
  patch: { status?: WhatsAppThreadStatus; assignedAgentId?: string | null },
) {
  return prisma.whatsAppThread.update({
    where: { id: threadId },
    data: patch,
  });
}

// ─── Manual agent reply ─────────────────────────────────────────────────
// Goes through the same whatsappQueue as automation sends so rate-limit,
// logging, and DLQ apply uniformly.
export async function sendReply(params: {
  threadId: string;
  body: string;
  authorUserId: string;
}) {
  const thread = await prisma.whatsAppThread.findUnique({
    where: { id: params.threadId },
    include: { customer: { select: { whatsappOptOut: true, phone: true } } },
  });
  if (!thread) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Thread not found' };
  if (thread.customer?.whatsappOptOut) {
    throw { statusCode: 400, code: 'OPTED_OUT', message: 'Customer has opted out of WhatsApp' };
  }

  const recipient = thread.customer?.phone ?? thread.customerPhone;

  const log = await prisma.messageLog.create({
    data: {
      trigger: 'confirmation_confirmed', // trigger column is NOT NULL — use a placeholder; dedupeKey keeps it unique
      recipientPhone: recipient,
      body: params.body,
      status: 'queued',
      agentId: params.authorUserId,
      dedupeKey: `manual:${params.threadId}:${Date.now()}`,
    },
  });

  // Attach an outgoing message record tied to this log so the UI shows it
  // optimistically before Evolution ack's it.
  await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'out',
      body: params.body,
      fromPhone: thread.customerPhone,
      toPhone: recipient,
      messageLogId: log.id,
      authorUserId: params.authorUserId,
    },
  });

  await whatsappQueue.add({ messageLogId: log.id });
  await prisma.whatsAppThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  return { logId: log.id };
}
