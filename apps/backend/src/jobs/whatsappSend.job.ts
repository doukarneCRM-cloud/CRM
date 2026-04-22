import { whatsappQueue, type WhatsAppSendJobData } from '../shared/queue';
import { prisma } from '../shared/prisma';
import * as evolution from '../modules/whatsapp/evolutionClient';
import { getSystemSessionId } from '../modules/automation/automation.service';

// Worker for the whatsapp:send queue. One job = one message. Resolves the
// sender session at send-time (not enqueue-time) so a session that reconnects
// between enqueue and process can still be used.
whatsappQueue.process(async (job) => {
  const { messageLogId } = job.data as WhatsAppSendJobData;

  const log = await prisma.messageLog.findUnique({ where: { id: messageLogId } });
  if (!log) return { skipped: 'log missing' };
  if (log.status === 'sent' || log.status === 'delivered') {
    return { skipped: 'already sent' };
  }

  await prisma.messageLog.update({
    where: { id: messageLogId },
    data: { status: 'sending' },
  });

  // ── Resolve sending instance ──────────────────────────────────────────
  // 1. Prefer the agent's own connected session for client-facing triggers.
  // 2. Fall back to the configured system session (commissions always go here).
  let instanceName: string | null = null;
  const isCommissionTrigger = log.trigger === 'commission_paid';

  if (!isCommissionTrigger && log.agentId) {
    const agentSession = await prisma.whatsAppSession.findUnique({
      where: { userId: log.agentId },
    });
    if (agentSession && agentSession.status === 'connected') {
      instanceName = agentSession.instanceName;
    }
  }

  if (!instanceName) {
    const systemId = await getSystemSessionId();
    if (systemId) {
      const systemSession = await prisma.whatsAppSession.findUnique({ where: { id: systemId } });
      if (systemSession && systemSession.status === 'connected') {
        instanceName = systemSession.instanceName;
      }
    }
  }

  if (!instanceName) {
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: { status: 'failed', error: 'No connected WhatsApp session available' },
    });
    return { skipped: 'no session' };
  }

  try {
    const sent = await evolution.sendText(instanceName, log.recipientPhone, log.body);
    const providerId = sent.key?.id ?? sent.messageId ?? null;
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: {
        status: 'sent',
        providerId: providerId ?? undefined,
        sentAt: new Date(),
      },
    });
    return { sent: true, providerId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown send error';
    await prisma.messageLog.update({
      where: { id: messageLogId },
      data: { status: 'failed', error: message.slice(0, 500) },
    });
    throw err; // let Bull retry per the queue's backoff policy
  }
});

whatsappQueue.on('failed', (job, err) => {
  console.error(`[whatsappSend] Job ${job.id} failed:`, err.message);
});
