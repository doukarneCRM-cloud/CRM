import type { MessageLogStatus, WhatsAppSessionStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import * as evolution from './evolutionClient';

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

// Per-session in-memory cache of the QR returned by /instance/create — v2
// delivers it there and /instance/connect often returns empty until a new
// QR is needed, so we hand it back on the first poll.
const pendingQrByInstance = new Map<string, { base64?: string; code?: string; pairingCode?: string }>();

export async function createSession(userId: string | null) {
  // One-session-per-user rule — hit the unique index on userId.
  if (userId) {
    const existing = await prisma.whatsAppSession.findUnique({ where: { userId } });
    if (existing) return existing;
  }
  const instanceName = instanceNameFor(userId);
  const created = await evolution.createInstance(instanceName);
  console.log('[EVOLUTION create response]', instanceName, JSON.stringify(created));
  if (created.qrcode?.base64 || created.qrcode?.code) {
    pendingQrByInstance.set(instanceName, {
      base64: created.qrcode.base64,
      code: created.qrcode.code,
      pairingCode: created.qrcode.pairingCode,
    });
  }
  return prisma.whatsAppSession.create({
    data: {
      userId,
      instanceName,
      status: 'connecting',
    },
  });
}

export async function getSessionQr(id: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { id } });
  if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Session not found' };

  let result: evolution.ConnectInstanceResponse;
  try {
    result = await evolution.connectInstance(session.instanceName);
    console.log('[EVOLUTION connect response]', session.instanceName, JSON.stringify(result));
  } catch (err) {
    // If the instance doesn't exist on Evolution (stale row from a failed
    // previous create), recreate it transparently.
    if (err instanceof evolution.EvolutionError && (err.status === 404 || err.status === 400)) {
      const created = await evolution.createInstance(session.instanceName);
      if (created.qrcode?.base64 || created.qrcode?.code) {
        pendingQrByInstance.set(session.instanceName, {
          base64: created.qrcode.base64,
          code: created.qrcode.code,
          pairingCode: created.qrcode.pairingCode,
        });
      }
      result = await evolution.connectInstance(session.instanceName).catch(() => ({}));
    } else {
      throw err;
    }
  }

  // Normalize v2 shapes: QR can live at the top level or under `qrcode`.
  const base64 = result.base64 ?? result.qrcode?.base64 ?? null;
  const code = result.code ?? result.qrcode?.code ?? null;
  const pairingCode = result.pairingCode ?? result.qrcode?.pairingCode ?? null;
  const state = result.state ?? result.instance?.state ?? null;

  // Fall back to the cached QR from the create call if the connect call
  // came back empty (common on the very first poll in v2).
  const cached = pendingQrByInstance.get(session.instanceName);
  const finalBase64 = base64 ?? cached?.base64 ?? null;
  const finalPairing = pairingCode ?? code ?? cached?.pairingCode ?? cached?.code ?? null;

  // Once paired (state=open), clear the cached QR and mark the row connected.
  if (state === 'open' || state === 'connected') {
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
    state: state ?? 'connecting',
  };
}

export async function disconnectSession(id: string) {
  const session = await prisma.whatsAppSession.findUnique({ where: { id } });
  if (!session) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Session not found' };
  try {
    await evolution.logoutInstance(session.instanceName);
  } catch {
    // Logout can fail if the device is already offline — we still mark disconnected.
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
    await evolution.deleteInstance(session.instanceName);
  } catch {
    // Instance may already be gone on Evolution side — proceed with row delete.
  }
  await prisma.whatsAppSession.delete({ where: { id } });
  return { ok: true };
}

// ── Webhook ingestion ─────────────────────────────────────────────────────
// Evolution posts events like:
//   { event: 'connection.update', instance: 'user_abc', data: { state: 'open', wuid: '212...' } }
//   { event: 'messages.update', instance: 'user_abc', data: { keyId: '...', status: 'DELIVERY_ACK' } }
// Keep this tolerant — payload shape differs slightly across Evolution versions.
interface WebhookPayload {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
}

export async function ingestWebhook(payload: WebhookPayload) {
  const event = payload.event ?? '';
  const instanceName = payload.instance;
  if (!instanceName) return;

  if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
    const data = payload.data ?? {};
    const state = String(data.state ?? '');
    const wuid = typeof data.wuid === 'string' ? data.wuid : undefined;
    let status: WhatsAppSessionStatus = 'disconnected';
    if (state === 'open') status = 'connected';
    else if (state === 'connecting') status = 'connecting';
    else if (state === 'close') status = 'disconnected';

    await prisma.whatsAppSession.updateMany({
      where: { instanceName },
      data: {
        status,
        lastHeartbeat: new Date(),
        ...(status === 'connected' ? { connectedAt: new Date() } : {}),
        ...(wuid ? { phoneNumber: wuid.split('@')[0] } : {}),
      },
    });
    return;
  }

  if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
    const data = payload.data ?? {};
    const keyId = typeof data.keyId === 'string' ? data.keyId : undefined;
    const status = String(data.status ?? '').toUpperCase();
    if (!keyId) return;
    let mapped: MessageLogStatus | null = null;
    if (status === 'SERVER_ACK' || status === 'SENT') mapped = 'sent';
    else if (status === 'DELIVERY_ACK' || status === 'DELIVERED') mapped = 'delivered';
    else if (status === 'READ') mapped = 'delivered';
    if (!mapped) return;
    await prisma.messageLog.updateMany({
      where: { providerId: keyId },
      data: { status: mapped },
    });
  }
}
