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

    if (event === 'qrcode.updated' || event === 'QRCODE_UPDATED') {
      const data = payload.data ?? {};
      // Evolution v2 emits either a flat `qrcode` shape or the top-level
      // fields. Accept both.
      const qrcode = (data.qrcode ?? data) as {
        base64?: string;
        code?: string;
        pairingCode?: string;
      };
      return {
        type: 'qr_updated',
        instance,
        qrBase64: qrcode.base64,
        pairingCode: qrcode.pairingCode ?? qrcode.code,
      };
    }

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
        imageMessage?: { caption?: string; url?: string; mimetype?: string };
        audioMessage?: { url?: string; mimetype?: string; seconds?: number; ptt?: boolean };
        videoMessage?: { caption?: string; url?: string; mimetype?: string; seconds?: number };
        stickerMessage?: { url?: string; mimetype?: string };
        documentMessage?: {
          url?: string;
          mimetype?: string;
          fileName?: string;
          title?: string;
        };
      };
      // Figure out media type + extract body + mimetype + fileName from the
      // shape Baileys emits. Keep order: image/video captions become body,
      // audio/sticker have no body, document falls back to file name.
      let mediaType: 'image' | 'audio' | 'video' | 'sticker' | 'document' | undefined;
      let mediaMime: string | undefined;
      let mediaFileName: string | undefined;
      let mediaUrl: string | undefined;
      let body = '';
      if (message.imageMessage) {
        mediaType = 'image';
        mediaMime = stripCodec(message.imageMessage.mimetype) ?? 'image/jpeg';
        mediaUrl = message.imageMessage.url;
        body = message.imageMessage.caption ?? '';
      } else if (message.stickerMessage) {
        mediaType = 'sticker';
        mediaMime = stripCodec(message.stickerMessage.mimetype) ?? 'image/webp';
        mediaUrl = message.stickerMessage.url;
      } else if (message.audioMessage) {
        mediaType = 'audio';
        mediaMime = stripCodec(message.audioMessage.mimetype) ?? 'audio/ogg';
        mediaUrl = message.audioMessage.url;
      } else if (message.videoMessage) {
        mediaType = 'video';
        mediaMime = stripCodec(message.videoMessage.mimetype) ?? 'video/mp4';
        mediaUrl = message.videoMessage.url;
        body = message.videoMessage.caption ?? '';
      } else if (message.documentMessage) {
        mediaType = 'document';
        mediaMime = stripCodec(message.documentMessage.mimetype) ?? 'application/octet-stream';
        mediaUrl = message.documentMessage.url;
        mediaFileName =
          message.documentMessage.fileName ?? message.documentMessage.title ?? 'document';
        body = mediaFileName;
      } else {
        body = message.conversation ?? message.extendedTextMessage?.text ?? '';
      }
      const fromJid = key.remoteJid ?? '';
      const fromPhone = fromJid.split('@')[0];
      const providerId = key.id ?? '';
      if (!fromPhone || !providerId) return { type: 'ignored' };
      // Skip empty events (plain pings/receipts Baileys sometimes surfaces).
      if (!body && !mediaType) return { type: 'ignored' };
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
        mediaType,
        mediaMime,
        mediaFileName,
        messageKey: { id: providerId, remoteJid: fromJid, fromMe: false },
        providerId,
        timestamp: ts,
      };
    }

    return { type: 'ignored' };
  },
};

// WhatsApp mimetypes sometimes carry codec params (e.g. "audio/ogg; codecs=opus")
// which break a naive mime→extension lookup. Keep only the primary type.
function stripCodec(m: string | undefined): string | undefined {
  if (!m) return undefined;
  return m.split(';')[0].trim();
}
