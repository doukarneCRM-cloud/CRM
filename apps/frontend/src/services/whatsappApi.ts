import { api } from './api';

export type WhatsAppSessionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WhatsAppSession {
  id: string;
  userId: string | null;
  instanceName: string;
  status: WhatsAppSessionStatus;
  phoneNumber: string | null;
  lastHeartbeat: string | null;
  connectedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; phone: string | null } | null;
}

export interface QrResponse {
  qrBase64: string | null;
  pairingCode: string | null;
  state: string;
}

export const whatsappApi = {
  list: () =>
    api.get<{ data: WhatsAppSession[] }>('/whatsapp/sessions').then((r) => r.data.data),
  create: (userId: string | null) =>
    api.post<WhatsAppSession>('/whatsapp/sessions', { userId }).then((r) => r.data),
  getQr: (id: string) =>
    api.get<QrResponse>(`/whatsapp/sessions/${id}/qr`).then((r) => r.data),
  disconnect: (id: string) =>
    api.post<{ ok: true }>(`/whatsapp/sessions/${id}/disconnect`).then((r) => r.data),
  remove: (id: string) =>
    api.delete<{ ok: true }>(`/whatsapp/sessions/${id}`).then((r) => r.data),
};
