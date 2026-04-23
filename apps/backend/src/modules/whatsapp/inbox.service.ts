import { Readable } from 'node:stream';
import type { WhatsAppThreadStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { emitToUser, emitToRoom } from '../../shared/socket';
import { uploadFile } from '../../shared/storage';
import { getBase64FromMediaMessage } from './evolutionClient';
import { getProvider, type NormalizedEvent, type OutboundMediaKind } from './provider';
import { getSystemSessionId } from '../automation/automation.service';
import { recordSend } from '../../shared/rateLimit';

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

  // If the message carries media, fetch + decrypt via Evolution and persist
  // into our own storage so the frontend has a stable public URL. Failure
  // here degrades to "media missing" — we still record the text/caption.
  let persistedMediaUrl: string | null = null;
  let persistedMediaMime: string | null = null;
  if (event.mediaType && event.messageKey) {
    try {
      const dl = await getBase64FromMediaMessage(event.instance, event.messageKey);
      if (dl.base64) {
        const mime = dl.mimetype ?? event.mediaMime ?? 'application/octet-stream';
        const buf = Buffer.from(dl.base64, 'base64');
        const result = await uploadFile({
          folder: `whatsapp/${event.mediaType}`,
          mimeType: mime.split(';')[0].trim(),
          stream: Readable.from(buf),
        });
        persistedMediaUrl = result.url;
        persistedMediaMime = mime;
      }
    } catch (err) {
      console.error('[whatsapp] media download failed', err);
    }
  }

  const message = await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'in',
      body: event.body,
      mediaUrl: persistedMediaUrl ?? event.mediaUrl ?? null,
      mediaType: event.mediaType ?? null,
      mediaMime: persistedMediaMime ?? event.mediaMime ?? null,
      fromPhone: fromPhoneNormalized,
      toPhone: session?.phoneNumber ?? '',
      providerId: event.providerId,
    },
  });

  await broadcastMessage(thread.id, message.id);
}

// Reload thread + message with include relations and fan out. Used by both
// inbound ingestion and outbound (manual reply / dispatcher). Keeps the
// socket payload shape identical so the UI can apply the same merge logic.
export async function broadcastMessage(threadId: string, messageId: string) {
  const [thread, message] = await Promise.all([
    prisma.whatsAppThread.findUnique({
      where: { id: threadId },
      include: threadInclude,
    }),
    prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      include: { author: { select: { id: true, name: true } } },
    }),
  ]);
  if (!thread || !message) return;
  const payload = { thread, message };
  if (thread.assignedAgentId) emitToUser(thread.assignedAgentId, 'whatsapp:message', payload);
  emitToRoom('whatsapp:monitor', 'whatsapp:message', payload);
  // Backward-compat: older clients only listen to whatsapp:inbound.
  if (message.direction === 'in') {
    if (thread.assignedAgentId) emitToUser(thread.assignedAgentId, 'whatsapp:inbound', payload);
    emitToRoom('whatsapp:monitor', 'whatsapp:inbound', payload);
  }
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
const threadInclude = {
  customer: { select: { id: true, fullName: true, phoneDisplay: true, city: true, whatsappOptOut: true } },
  assignedAgent: { select: { id: true, name: true } },
  messages: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { body: true, direction: true, createdAt: true, mediaType: true },
  },
} as const;

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
    include: threadInclude,
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
  const outMsg = await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'out',
      body: params.body,
      fromPhone: '',
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

  await broadcastMessage(thread.id, outMsg.id);

  return { logId: log.id };
}

// ─── Manual agent media reply ───────────────────────────────────────────
// Media is sent synchronously (not through the queue) so the agent sees
// immediate success/failure and the bubble renders with the stored URL
// right away. We still upload a copy to our storage so the thread has a
// stable URL even if WhatsApp cycles its CDN references.
export async function sendMediaReply(params: {
  threadId: string;
  authorUserId: string;
  fileBuffer: Buffer;
  fileMime: string;
  fileName: string;
  caption?: string;
  // 'ptt' = push-to-talk (voice note). Distinct from a regular audio file
  // attachment — renders as the playable mic bubble on the phone.
  asVoiceNote?: boolean;
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

  // Resolve the sending session: agent's own first, fall back to system.
  const agentSession = await prisma.whatsAppSession.findUnique({
    where: { userId: params.authorUserId },
  });
  let session = agentSession && agentSession.status === 'connected' ? agentSession : null;
  if (!session) {
    const systemId = await getSystemSessionId();
    if (systemId) {
      const sys = await prisma.whatsAppSession.findUnique({ where: { id: systemId } });
      if (sys && sys.status === 'connected') session = sys;
    }
  }
  if (!session) {
    throw { statusCode: 400, code: 'NO_SESSION', message: 'No connected WhatsApp session' };
  }

  // Map mime → media kind. Anything we don't recognize is sent as document
  // so the recipient still gets the file.
  const kind = kindFromMime(params.fileMime, params.asVoiceNote);
  const cleanMime = params.fileMime.split(';')[0].trim();

  // Archive the outbound media so our UI can render it forever (WhatsApp
  // CDN URLs rotate). Upload first — if this fails we don't want to send.
  const uploaded = await uploadFile({
    folder: `whatsapp/out/${kind}`,
    mimeType: cleanMime,
    stream: Readable.from(params.fileBuffer),
  });

  // Send through the provider. sendMedia picks the right Evolution endpoint
  // (sendMedia vs sendWhatsAppAudio) based on kind + voiceNote.
  const provider = getProvider();
  const sent = await provider.sendMedia(session.instanceName, recipient, {
    kind,
    buffer: params.fileBuffer,
    mimeType: cleanMime,
    fileName: params.fileName,
    caption: kind === 'image' || kind === 'video' ? params.caption ?? '' : undefined,
    voiceNote: kind === 'audio' ? params.asVoiceNote !== false : undefined,
  });

  // Record-send updates the rate-limit counter so the Overview tab reflects
  // manual media sends too.
  await recordSend(session.id);

  // Audit trail entry in MessageLog. Marked sent immediately since the send
  // just succeeded — retry isn't meaningful for manual media.
  const log = await prisma.messageLog.create({
    data: {
      trigger: 'confirmation_confirmed',
      recipientPhone: recipient,
      body: params.caption ?? `[${kind}]`,
      status: 'sent',
      agentId: params.authorUserId,
      providerId: sent.providerId ?? undefined,
      sentAt: new Date(),
      dedupeKey: `manual-media:${params.threadId}:${Date.now()}`,
    },
  });

  const outMsg = await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'out',
      body: params.caption ?? '',
      mediaUrl: uploaded.url,
      mediaType: kind === 'audio' && params.asVoiceNote !== false ? 'audio' : kind,
      mediaMime: cleanMime,
      fromPhone: session.phoneNumber ?? '',
      toPhone: recipient,
      providerId: sent.providerId ?? undefined,
      messageLogId: log.id,
      authorUserId: params.authorUserId,
    },
  });

  await prisma.whatsAppThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: new Date() },
  });

  await broadcastMessage(thread.id, outMsg.id);

  return { logId: log.id, messageId: outMsg.id, mediaUrl: uploaded.url };
}

function kindFromMime(mime: string, voiceNoteHint?: boolean): OutboundMediaKind {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  // WhatsApp voice-note hint takes precedence when the browser reports e.g.
  // "application/octet-stream" (some Safari recordings do this).
  if (voiceNoteHint) return 'audio';
  return 'document';
}
