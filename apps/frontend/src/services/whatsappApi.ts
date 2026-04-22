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

export type WhatsAppThreadStatus = 'open' | 'closed' | 'snoozed';
export type WhatsAppMessageDirection = 'in' | 'out';

export interface InboxThread {
  id: string;
  customerId: string | null;
  customerPhone: string;
  assignedAgentId: string | null;
  status: WhatsAppThreadStatus;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
  customer?: {
    id: string;
    fullName: string;
    phoneDisplay: string | null;
    city: string | null;
    whatsappOptOut: boolean;
  } | null;
  assignedAgent?: { id: string; name: string } | null;
  messages?: Array<{ body: string; direction: WhatsAppMessageDirection; createdAt: string }>;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: WhatsAppMessageDirection;
  body: string;
  mediaUrl: string | null;
  fromPhone: string;
  toPhone: string;
  providerId: string | null;
  messageLogId: string | null;
  authorUserId: string | null;
  readAt: string | null;
  createdAt: string;
  author?: { id: string; name: string } | null;
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

  inbox: {
    listThreads: (params: { scope?: 'mine' | 'all'; status?: WhatsAppThreadStatus } = {}) =>
      api
        .get<{ data: InboxThread[] }>('/whatsapp/inbox/threads', { params })
        .then((r) => r.data.data),
    listMessages: (threadId: string) =>
      api
        .get<{ data: InboxMessage[] }>(`/whatsapp/inbox/threads/${threadId}/messages`)
        .then((r) => r.data.data),
    markRead: (threadId: string) =>
      api.post<{ ok: true }>(`/whatsapp/inbox/threads/${threadId}/read`).then((r) => r.data),
    reply: (threadId: string, body: string) =>
      api
        .post<{ logId: string }>(`/whatsapp/inbox/threads/${threadId}/reply`, { body })
        .then((r) => r.data),
    updateThread: (threadId: string, patch: { status?: WhatsAppThreadStatus; assignedAgentId?: string | null }) =>
      api.patch<InboxThread>(`/whatsapp/inbox/threads/${threadId}`, patch).then((r) => r.data),
  },
};
