import * as client from '../evolutionClient';
import type {
  WhatsAppProvider,
  CreateInstanceResult,
  ConnectResult,
  SendTextResult,
  NormalizedEvent,
} from './types';

// Thin adapter around the existing evolutionClient so the rest of the app can
// depend on the provider interface instead of the Evolution REST shape.

export const evolutionProvider: WhatsAppProvider = {
  name: 'evolution',

  async createInstance(instanceName: string): Promise<CreateInstanceResult> {
    const created = await client.createInstance(instanceName);
    return {
      instanceName,
      qrBase64: created.qrcode?.base64,
      qrCode: created.qrcode?.code,
      pairingCode: created.qrcode?.pairingCode,
    };
  },

  async connect(instanceName: string): Promise<ConnectResult> {
    const result = await client.connectInstance(instanceName);
    const base64 = result.base64 ?? result.qrcode?.base64 ?? null;
    const code = result.code ?? result.qrcode?.code ?? null;
    const pairingCode = result.pairingCode ?? result.qrcode?.pairingCode ?? null;
    const rawState = result.state ?? result.instance?.state ?? 'connecting';
    let state: ConnectResult['state'] = rawState;
    if (rawState === 'open') state = 'connected';
    else if (rawState === 'close') state = 'disconnected';
    return {
      qrBase64: base64,
      pairingCode: pairingCode ?? code,
      state,
    };
  },

  async disconnect(instanceName: string): Promise<void> {
    await client.logoutInstance(instanceName);
  },

  async deleteInstance(instanceName: string): Promise<void> {
    await client.deleteInstance(instanceName);
  },

  async sendText(instanceName: string, phone: string, body: string): Promise<SendTextResult> {
    const sent = await client.sendText(instanceName, phone, body);
    return { providerId: sent.key?.id ?? sent.messageId ?? null };
  },

  parseWebhook(raw: unknown): NormalizedEvent {
    const payload = (raw ?? {}) as {
      event?: string;
      instance?: string;
      data?: Record<string, unknown>;
    };
    const event = payload.event ?? '';
    const instance = payload.instance;
    if (!instance) return { type: 'ignored' };

    if (event === 'connection.update' || event === 'CONNECTION_UPDATE') {
      const data = payload.data ?? {};
      const state = String(data.state ?? '');
      const wuid = typeof data.wuid === 'string' ? data.wuid : undefined;
      const phoneNumber = wuid ? wuid.split('@')[0] : undefined;
      if (state === 'open') return { type: 'session_connected', instance, phoneNumber };
      if (state === 'close') return { type: 'session_disconnected', instance };
      return { type: 'ignored' };
    }

    if (event === 'messages.update' || event === 'MESSAGES_UPDATE') {
      const data = payload.data ?? {};
      const keyId = typeof data.keyId === 'string' ? data.keyId : undefined;
      const rawStatus = String(data.status ?? '').toUpperCase();
      if (!keyId) return { type: 'ignored' };
      let status: 'sent' | 'delivered' | 'read' | 'failed' | null = null;
      if (rawStatus === 'SERVER_ACK' || rawStatus === 'SENT') status = 'sent';
      else if (rawStatus === 'DELIVERY_ACK' || rawStatus === 'DELIVERED') status = 'delivered';
      else if (rawStatus === 'READ') status = 'read';
      else if (rawStatus === 'ERROR' || rawStatus === 'FAILED') status = 'failed';
      if (!status) return { type: 'ignored' };
      return { type: 'outbound_status', instance, providerId: keyId, status };
    }

    if (event === 'messages.upsert' || event === 'MESSAGES_UPSERT') {
      const data = payload.data ?? {};
      const key = (data.key ?? {}) as { id?: string; remoteJid?: string; fromMe?: boolean };
      if (key.fromMe) return { type: 'ignored' };
      const message = (data.message ?? {}) as {
        conversation?: string;
        extendedTextMessage?: { text?: string };
        imageMessage?: { caption?: string; url?: string };
      };
      const body =
        message.conversation ??
        message.extendedTextMessage?.text ??
        message.imageMessage?.caption ??
        '';
      const mediaUrl = message.imageMessage?.url;
      const fromJid = key.remoteJid ?? '';
      const fromPhone = fromJid.split('@')[0];
      const providerId = key.id ?? '';
      if (!fromPhone || !providerId) return { type: 'ignored' };
      const rawTs = (data as { messageTimestamp?: number | string }).messageTimestamp;
      const ts =
        typeof rawTs === 'number'
          ? new Date(rawTs * 1000)
          : typeof rawTs === 'string'
            ? new Date(Number(rawTs) * 1000)
            : new Date();
      return {
        type: 'inbound_message',
        instance,
        fromPhone,
        body,
        mediaUrl,
        providerId,
        timestamp: ts,
      };
    }

    return { type: 'ignored' };
  },
};
