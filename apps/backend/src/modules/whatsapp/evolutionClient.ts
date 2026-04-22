// Thin wrapper around Evolution API (self-hosted WhatsApp REST gateway).
// All outbound calls go through here so the rest of the app never knows the
// exact Evolution endpoint shapes. If we swap gateway (e.g. Baileys direct)
// we only touch this file.

const BASE_URL = process.env.EVOLUTION_API_URL ?? '';
const API_KEY = process.env.EVOLUTION_API_KEY ?? '';
const WEBHOOK_URL = process.env.EVOLUTION_WEBHOOK_URL ?? '';

function headers() {
  return {
    'Content-Type': 'application/json',
    apikey: API_KEY,
  };
}

export class EvolutionError extends Error {
  constructor(public status: number, message: string, public body: unknown) {
    super(message);
    this.name = 'EvolutionError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE_URL) {
    throw new Error('EVOLUTION_API_URL is not configured');
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message =
      typeof parsed === 'object' && parsed && 'message' in parsed
        ? String((parsed as { message: unknown }).message)
        : `Evolution API ${res.status}`;
    throw new EvolutionError(res.status, message, parsed);
  }
  return parsed as T;
}

// ── Instance lifecycle ────────────────────────────────────────────────────
// Evolution v2 responds with { instance, hash, qrcode: { base64, code, pairingCode, count } }
// so we grab the QR from the create response too — the connect endpoint doesn't
// always regenerate a QR on the first call.
interface CreateInstanceResponse {
  instance: { instanceName: string; status: string };
  hash?: string;
  qrcode?: { base64?: string; code?: string; pairingCode?: string; count?: number };
}

export async function createInstance(instanceName: string): Promise<CreateInstanceResponse> {
  const body: Record<string, unknown> = {
    instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  };
  if (WEBHOOK_URL) {
    // byEvents:false — Evolution posts every event to the same URL. With true
    // it would append /connection-update, /messages-update, etc. which our
    // single /webhook route doesn't handle.
    body.webhook = {
      url: WEBHOOK_URL,
      byEvents: false,
      events: ['QRCODE_UPDATED', 'CONNECTION_UPDATE', 'MESSAGES_UPDATE', 'MESSAGES_UPSERT'],
    };
  }
  return request<CreateInstanceResponse>('POST', '/instance/create', body);
}

// v2 may return either a flat { base64, code, pairingCode } or a nested shape.
// Keep the type loose and normalize in the service layer.
export interface ConnectInstanceResponse {
  base64?: string;
  code?: string;
  pairingCode?: string;
  count?: number;
  state?: string;
  qrcode?: { base64?: string; code?: string; pairingCode?: string };
  instance?: { state?: string };
}

export async function connectInstance(instanceName: string): Promise<ConnectInstanceResponse> {
  return request<ConnectInstanceResponse>(
    'GET',
    `/instance/connect/${encodeURIComponent(instanceName)}`,
  );
}

export async function fetchInstanceState(instanceName: string) {
  return request<{ instance: { state: string } }>(
    'GET',
    `/instance/connectionState/${encodeURIComponent(instanceName)}`,
  );
}

export async function logoutInstance(instanceName: string) {
  return request<unknown>('DELETE', `/instance/logout/${encodeURIComponent(instanceName)}`);
}

export async function deleteInstance(instanceName: string) {
  return request<unknown>('DELETE', `/instance/delete/${encodeURIComponent(instanceName)}`);
}

// ── Messaging ─────────────────────────────────────────────────────────────
// E.164 phone → WhatsApp JID — Evolution accepts either, but stripping the
// leading + keeps the payload consistent across carriers.
function toJid(phone: string): string {
  return phone.replace(/^\+/, '');
}

export async function sendText(instanceName: string, phone: string, text: string) {
  return request<{ key?: { id: string }; messageId?: string }>(
    'POST',
    `/message/sendText/${encodeURIComponent(instanceName)}`,
    {
      number: toJid(phone),
      text,
    },
  );
}

// Fetch + decrypt a media attachment Evolution received. Called from the
// inbound webhook pipeline — Evolution stores the encrypted blob referenced
// by messageId; this endpoint decrypts it and returns base64 so we can
// persist it into our own storage (R2 / local uploads).
export interface MediaDownloadResponse {
  base64?: string;
  mediaType?: string;
  mimetype?: string;
  fileName?: string;
}

export async function getBase64FromMediaMessage(
  instanceName: string,
  messageKey: { id: string; remoteJid?: string; fromMe?: boolean },
): Promise<MediaDownloadResponse> {
  return request<MediaDownloadResponse>(
    'POST',
    `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
    { message: { key: messageKey }, convertToMp4: false },
  );
}
