// Provider-agnostic interface for the WhatsApp gateway. Today we ship with
// Evolution (self-hosted Baileys) behind this; the Meta Cloud API stub is
// ready to swap in once the official templates are approved and the number
// is registered. Business logic never imports a concrete provider — it goes
// through `getProvider()` in ./index.ts.

export interface CreateInstanceResult {
  instanceName: string;
  qrBase64?: string;
  qrCode?: string;
  pairingCode?: string;
}

export interface ConnectResult {
  qrBase64?: string | null;
  pairingCode?: string | null;
  state: 'connecting' | 'connected' | 'disconnected' | string;
}

export interface SendTextResult {
  providerId?: string | null;
}

// Normalized webhook event — callers never see raw Evolution/Meta payloads.
// Providers parse their own shapes and emit one of these.
export type NormalizedEvent =
  | { type: 'session_connected'; instance: string; phoneNumber?: string }
  | { type: 'session_disconnected'; instance: string }
  | { type: 'qr_updated'; instance: string; qrBase64?: string; pairingCode?: string }
  | {
      type: 'outbound_status';
      instance: string;
      providerId: string;
      status: 'sent' | 'delivered' | 'read' | 'failed';
    }
  | {
      type: 'inbound_message';
      instance: string;
      fromPhone: string;
      body: string;
      mediaUrl?: string;
      providerId: string;
      timestamp: Date;
    }
  | { type: 'ignored' };

export interface WhatsAppProvider {
  readonly name: 'evolution' | 'meta';

  createInstance(instanceName: string): Promise<CreateInstanceResult>;
  connect(instanceName: string): Promise<ConnectResult>;
  disconnect(instanceName: string): Promise<void>;
  deleteInstance(instanceName: string): Promise<void>;

  sendText(instanceName: string, phone: string, body: string): Promise<SendTextResult>;

  parseWebhook(payload: unknown): NormalizedEvent;
}

export class NotImplementedError extends Error {
  constructor(provider: string, feature: string) {
    super(`${provider} provider: ${feature} is not implemented yet`);
  }
}
