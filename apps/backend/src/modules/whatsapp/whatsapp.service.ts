import type { MessageLogStatus, WhatsAppSessionStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { getProvider } from './provider';
import { EvolutionError } from './evolutionClient';

const provider = getProvider();

// Evolution instance names must be stable + unique. Tie them to user id (or
// "system" when no user) so deleting a user naturally drops their instance.
function instanceNameFor(userId: string | null): string {
  return userId ? `user_${userId}` : `system_${Date.now()}`;
}

export async function listSessions() {
  return prisma.whatsAppSession.findMany({
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, name: true, phone: true } } },
  });
}

// Per-session in-memory cache of the QR returned by the provider's create
// call — Evolution v2 returns it there and /connect often comes back empty
// until a new QR is needed, so we hand it back on the first poll.
const pendingQrByInstance = new Map<string, { base64?: string; pairingCode?: string }>();

export async function createSession(userId: string | null) {
  if (userId) {
    const existing = await prisma.whatsAppSession.findUnique({ where: { userId } });
    if (existing) return existing;
  }
  const instanceName = instanceNameFor(userId);
  const created = await provider.createInstance(instanceName);
  if (created.qrBase64 || created.qrCode) {
    pendingQrByInstance.set(instanceName, {
      base64: created.qrBase64,
      pairingCode: created.pairingCode ?? created.qrCode,
    });
  }
  return prisma.whatsAppSession.create({
    data: { userId, instanceName, status: 'connecting' },
  });
}

export async function getSessionQr(id: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { id } });
  if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Session not found' };

  let connected;
  try {
    connected = await provider.connect(session.instanceName);
  } catch (err) {
    // Stale row whose instance was purged on the Evolution side — recreate.
    if (err instanceof EvolutionError && (err.status === 404 || err.status === 400)) {
      const created = await provider.createInstance(session.instanceName);
      if (created.qrBase64 || created.qrCode) {
        pendingQrByInstance.set(session.instanceName, {
          base64: created.qrBase64,
          pairingCode: created.pairingCode ?? created.qrCode,
        });
      }
      connected = await provider.connect(session.instanceName).catch(() => ({
        state: 'connecting' as const,
        qrBase64: null,
        pairingCode: null,
      }));
    } else {
      throw err;
    }
  }

  const cached = pendingQrByInstance.get(session.instanceName);
  const finalBase64 = connected.qrBase64 ?? cached?.base64 ?? null;
  const finalPairing = connected.pairingCode ?? cached?.pairingCode ?? null;

  if (connected.state === 'connected') {
    pendingQrByInstance.delete(session.instanceName);
    if (session.status !== 'connected') {
      await prisma.whatsAppSession.update({
        where: { id },
        data: { status: 'connected', connectedAt: new Date() },
      });
    }
  } else if (session.status === 'disconnected') {
    await prisma.whatsAppSession.update({ where: { id }, data: { status: 'connecting' } });
  }

  return {
    qrBase64: finalBase64,
    pairingCode: finalPairing,
    state: connected.state,
  };
}

export async function disconnectSession(id: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { id } });
  if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Session not found' };
  try {
    await provider.disconnect(session.instanceName);
  } catch {
    // Logout can fail if the device is already offline — proceed anyway.
  }
  await prisma.whatsAppSession.update({
    where: { id },
    data: { status: 'disconnected', phoneNumber: null, connectedAt: null },
  });
  return { ok: true };
}

export async function deleteSession(id: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { id } });
  if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Session not found' };
  try {
    await provider.deleteInstance(session.instanceName);
  } catch {
    // Instance may already be gone on the provider — proceed with row delete.
  }
  await prisma.whatsAppSession.delete({ where: { id } });
  return { ok: true };
}

// ─── Webhook ingestion ─────────────────────────────────────────────────────
// All webhook payloads go through provider.parseWebhook() → normalized event.
// One handler drives both Evolution and (future) Meta Cloud payloads.
export async function ingestWebhook(payload: unknown) {
  const event = provider.parseWebhook(payload);
  if (event.type === 'ignored') return;

  if (event.type === 'session_connected') {
    await prisma.whatsAppSession.updateMany({
      where: { instanceName: event.instance },
      data: {
        status: 'connected' as WhatsAppSessionStatus,
        lastHeartbeat: new Date(),
        connectedAt: new Date(),
        ...(event.phoneNumber ? { phoneNumber: event.phoneNumber } : {}),
      },
    });
    return;
  }

  if (event.type === 'session_disconnected') {
    await prisma.whatsAppSession.updateMany({
      where: { instanceName: event.instance },
      data: {
        status: 'disconnected' as WhatsAppSessionStatus,
        lastHeartbeat: new Date(),
      },
    });
    return;
  }

  if (event.type === 'outbound_status') {
    let mapped: MessageLogStatus | null = null;
    if (event.status === 'sent') mapped = 'sent';
    else if (event.status === 'delivered' || event.status === 'read') mapped = 'delivered';
    else if (event.status === 'failed') mapped = 'failed';
    if (!mapped) return;
    await prisma.messageLog.updateMany({
      where: { providerId: event.providerId },
      data: { status: mapped },
    });
    return;
  }

  if (event.type === 'inbound_message') {
    // Inbound handling is owned by the inbox module — dynamic import keeps
    // this file independent of the inbox schema and avoids a require cycle.
    const { handleInboundMessage } = await import('./inbox.service');
    await handleInboundMessage(event);
    return;
  }
}
