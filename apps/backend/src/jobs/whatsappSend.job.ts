import { whatsappQueue, type WhatsAppSendJobData } from '../shared/queue';
import { prisma } from '../shared/prisma';
import { getProvider } from '../modules/whatsapp/provider';
import { getSystemSessionId } from '../modules/automation/automation.service';
import { checkRateLimit, recordSend } from '../shared/rateLimit';
import { emitToAll, emitToRoom } from '../shared/socket';

const provider = getProvider();

// ─── Worker ──────────────────────────────────────────────────────────────
// One job = one message. Resolves the sender session at send-time so a
// reconnect between enqueue and process still dispatches. Rate-limits per
// session; stalls a job back onto the queue with a delay rather than burning
// a retry when over cap. Records delivery progress + rate-limit snapshots to
// the socket room so the admin Overview tab lights up live.
whatsappQueue.process(async (job) => {
  const { messageLogId } = job.data as WhatsAppSendJobData;

  const log = await prisma.messageLog.findUnique({ where: { id: messageLogId } });
  if (!log) return { skipped: 'log missing' };
  if (log.status === 'sent' || log.status === 'delivered') {
    return { skipped: 'already sent' };
  }

  await prisma.messageLog.update({
    where: { id: messageLogId },
    data: { status: 'sending', attempts: { increment: 1 } },
  });
  emitToRoom('whatsapp:monitor', 'message_log:updated', { id: messageLogId, status: 'sending' });

  // ── Resolve sending session ──────────────────────────────────────────
  const isCommissionTrigger = log.trigger === 'commission_paid';
  let sendingSessionId: string | null = null;
  let instanceName: string | null = null;
  let sessionCreatedAt: Date | null = null;

  if (!isCommissionTrigger && log.agentId) {
    const agentSession = await prisma.whatsAppSession.findUnique({
      where: { userId: log.agentId },
    });
    if (agentSession && agentSession.status === 'connected') {
      sendingSessionId = agentSession.id;
      instanceName = agentSession.instanceName;
      sessionCreatedAt = agentSession.createdAt;
    }
  }

  if (!instanceName) {
    const systemId = await getSystemSessionId();
    if (systemId) {
      const systemSession = await prisma.whatsAppSession.findUnique({ where: { id: systemId } });
      if (systemSession && systemSession.status === 'connected') {
        sendingSessionId = systemSession.id;
        instanceName = systemSession.instanceName;
        sessionCreatedAt = systemSession.createdAt;
      }
    }
  }

  if (!instanceName || !sendingSessionId || !sessionCreatedAt) {
    await failLog(messageLogId, 'No connected WhatsApp session available');
    return { skipped: 'no session' };
  }

  // ── Rate limit gate ──────────────────────────────────────────────────
  const decision = await checkRateLimit(sendingSessionId, sessionCreatedAt);
  if (!decision.allowed) {
    // Put the message back in the queue with a delay and revert its status
    // so the Overview tab doesn't show it stuck in "sending".
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: { status: 'queued' },
    });
    emitToAll('whatsapp:rate_limited', {
      sessionId: sendingSessionId,
      reason: decision.reason,
      hourlyUsed: decision.hourlyUsed,
      hourlyLimit: decision.hourlyLimit,
      dailyUsed: decision.dailyUsed,
      dailyLimit: decision.dailyLimit,
    });
    await whatsappQueue.add(
      { messageLogId },
      { delay: decision.retryAfterMs ?? 60_000, attempts: 3 },
    );
    return { deferred: true, reason: decision.reason };
  }

  try {
    const sent = await provider.sendText(instanceName, log.recipientPhone, log.body);
    const providerId = sent.providerId ?? null;
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: {
        status: 'sent',
        providerId: providerId ?? undefined,
        sentAt: new Date(),
      },
    });
    await recordSend(sendingSessionId);

    // Mirror the send into the inbox thread so manual replies and
    // automation-driven messages appear inline. Only when the message
    // targets a known customer (by phone) — no thread for commission agents.
    if (!isCommissionTrigger) await mirrorToInboxThread(messageLogId, log.recipientPhone, log.body, providerId, log.agentId);

    emitToRoom('whatsapp:monitor', 'message_log:updated', {
      id: messageLogId,
      status: 'sent',
      providerId,
    });
    return { sent: true, providerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown send error';
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: { status: 'failed', error: message.slice(0, 500) },
    });
    emitToRoom('whatsapp:monitor', 'message_log:updated', {
      id: messageLogId,
      status: 'failed',
      error: message.slice(0, 200),
    });
    throw err; // let Bull retry per the queue's backoff policy
  }
});

async function failLog(id: string, reason: string) {
  await prisma.messageLog.update({
    where: { id },
    data: { status: 'failed', error: reason },
  });
  emitToRoom('whatsapp:monitor', 'message_log:updated', { id, status: 'failed', error: reason });
}

async function mirrorToInboxThread(
  messageLogId: string,
  recipientPhone: string,
  body: string,
  providerId: string | null,
  agentId: string | null,
) {
  // Skip if we already attached a WhatsAppMessage when enqueueing (manual reply path).
  const existing = await prisma.whatsAppMessage.findFirst({ where: { messageLogId } });
  if (existing) {
    if (providerId && !existing.providerId) {
      await prisma.whatsAppMessage.update({
        where: { id: existing.id },
        data: { providerId },
      });
    }
    return;
  }

  const customer = await prisma.customer.findFirst({ where: { phone: recipientPhone } });
  if (!customer) return;

  const thread = await prisma.whatsAppThread.upsert({
    where: {
      customerPhone_assignedAgentId: {
        customerPhone: recipientPhone,
        assignedAgentId: agentId ?? '',
      },
    },
    update: { lastMessageAt: new Date() },
    create: {
      customerPhone: recipientPhone,
      customerId: customer.id,
      assignedAgentId: agentId,
      lastMessageAt: new Date(),
    },
  });

  await prisma.whatsAppMessage.create({
    data: {
      threadId: thread.id,
      direction: 'out',
      body,
      fromPhone: '',
      toPhone: recipientPhone,
      providerId: providerId ?? undefined,
      messageLogId,
    },
  });
}

// ─── DLQ on final failure ────────────────────────────────────────────────
// Bull retries up to `attempts` (3 by default); after that it fires 'failed'
// with a promoted prop we can inspect. Flip the log into 'dead' so the
// Overview tab shows a requeue control.
whatsappQueue.on('failed', async (job, err) => {
  console.error(`[whatsappSend] Job ${job.id} failed:`, err.message);
  const { messageLogId } = job.data as WhatsAppSendJobData;
  if (job.attemptsMade >= (job.opts.attempts ?? 3)) {
    try {
      await prisma.messageLog.update({
        where: { id: messageLogId },
        data: { status: 'dead' },
      });
      emitToRoom('whatsapp:monitor', 'message_log:updated', {
        id: messageLogId,
        status: 'dead',
      });
    } catch {
      /* log may have been deleted; ignore */
    }
  }
});
