import { api } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export type BroadcastKind = 'POPUP' | 'BAR';

export interface Broadcast {
  id: string;
  kind: BroadcastKind;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  isActive: boolean;
  createdById: string;
  createdAt: string;
  deactivatedAt: string | null;
}

export interface BroadcastListRow extends Broadcast {
  createdBy: { id: string; name: string; avatarUrl: string | null };
  recipientCount: number;
  ackedCount: number;
  clickedCount: number;
  totalClicks: number;
}

export interface BroadcastRecipient {
  id: string;
  broadcastId: string;
  userId: string;
  deliveredAt: string | null;
  ackedAt: string | null;
  clickedAt: string | null;
  clickCount: number;
  user: { id: string; name: string; avatarUrl: string | null };
}

export interface BroadcastDetail extends Broadcast {
  createdBy: { id: string; name: string; avatarUrl: string | null };
  recipients: BroadcastRecipient[];
}

export interface ActiveBroadcastFeed {
  popups: Broadcast[];
  bars: Broadcast[];
}

// ─── API ────────────────────────────────────────────────────────────────────

export const broadcastsApi = {
  list: () =>
    api.get<{ data: BroadcastListRow[] }>('/broadcasts').then((r) => r.data.data),

  get: (id: string) =>
    api.get<BroadcastDetail>(`/broadcasts/${id}`).then((r) => r.data),

  // Always multipart — even when there's no image, the backend route enforces
  // multipart/form-data so the parser path stays consistent.
  create: (formData: FormData) =>
    api
      .post<BroadcastListRow>('/broadcasts', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  deactivate: (id: string) =>
    api.patch<Broadcast>(`/broadcasts/${id}/deactivate`).then((r) => r.data),

  remove: (id: string) =>
    api.delete<{ ok: true }>(`/broadcasts/${id}`).then((r) => r.data),

  listActiveForMe: () =>
    api.get<ActiveBroadcastFeed>('/broadcasts/active/me').then((r) => r.data),

  ack: (id: string) =>
    api.post<{ ok: true }>(`/broadcasts/${id}/ack`).then((r) => r.data),

  click: (id: string) =>
    api.post<{ ok: true }>(`/broadcasts/${id}/click`).then((r) => r.data),
};
