import {
  NotImplementedError,
  type WhatsAppProvider,
  type CreateInstanceResult,
  type ConnectResult,
  type SendTextResult,
  type NormalizedEvent,
} from './types';

// Placeholder for the official Meta WhatsApp Cloud API. When we flip
// WHATSAPP_PROVIDER=meta we'll need:
//   - META_WABA_ID, META_PHONE_NUMBER_ID, META_ACCESS_TOKEN, META_APP_SECRET
//   - approved message templates registered in Meta Business Manager
//   - a public webhook URL verified with a challenge token
// Until then every method throws NotImplemented so accidental use fails loud.

export const metaProvider: WhatsAppProvider = {
  name: 'meta',

  async createInstance(_instanceName: string): Promise<CreateInstanceResult> {
    throw new NotImplementedError('meta', 'createInstance');
  },
  async connect(_instanceName: string): Promise<ConnectResult> {
    throw new NotImplementedError('meta', 'connect');
  },
  async disconnect(_instanceName: string): Promise<void> {
    throw new NotImplementedError('meta', 'disconnect');
  },
  async deleteInstance(_instanceName: string): Promise<void> {
    throw new NotImplementedError('meta', 'deleteInstance');
  },
  async sendText(_instanceName: string, _phone: string, _body: string): Promise<SendTextResult> {
    throw new NotImplementedError('meta', 'sendText');
  },
  parseWebhook(_raw: unknown): NormalizedEvent {
    return { type: 'ignored' };
  },
};
