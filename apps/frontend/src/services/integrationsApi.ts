import { api } from './api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface Store {
  id: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  isConnected: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  fieldMapping: Record<string, string> | null;
  webhookId?: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { products: number; orders: number };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
}

export interface ImportLog {
  id: string;
  storeId: string;
  type: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  imported: number;
  skipped: number;
  errors: number;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface YoucanProductPreview {
  id: string;
  name: string;
  price: number;
  thumbnail: string | null;
  variants_count: number;
  inventory: number;
  already_imported: boolean;
}

export interface Pagination {
  total: number;
  count: number;
  per_page: number;
  current_page: number;
  total_pages: number;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const integrationsApi = {
  // Stores
  listStores: () =>
    api.get<{ data: Store[] }>('/integrations/stores').then((r) => r.data.data),

  getStore: (id: string) =>
    api.get<Store>(`/integrations/stores/${id}`).then((r) => r.data),

  createStore: (payload: { name: string }) =>
    api.post<Store>('/integrations/stores', payload).then((r) => r.data),

  updateStore: (id: string, payload: Record<string, unknown>) =>
    api.patch<Store>(`/integrations/stores/${id}`, payload).then((r) => r.data),

  deleteStore: (id: string) =>
    api.delete(`/integrations/stores/${id}`),

  toggleStore: (id: string) =>
    api.post<Store>(`/integrations/stores/${id}/toggle`).then((r) => r.data),

  // OAuth
  getOAuthUrl: (id: string) =>
    api.get<{ url: string; state: string }>(`/integrations/stores/${id}/oauth/authorize`).then((r) => r.data),

  completeOAuth: (id: string, code: string, state: string) =>
    api.post(`/integrations/stores/${id}/oauth/callback`, { code, state }).then((r) => r.data),

  // Field mapping
  detectCheckoutFields: (id: string) =>
    api.get<{ fields: Array<{ path: string; label: string; sample: string }> }>(
      `/integrations/stores/${id}/checkout-fields`,
    ).then((r) => r.data.fields),

  updateFieldMapping: (id: string, mapping: Record<string, string>) =>
    api.put(`/integrations/stores/${id}/field-mapping`, mapping).then((r) => r.data),

  // Products
  previewYoucanProducts: (id: string, page = 1, search?: string) =>
    api.get<{ products: YoucanProductPreview[]; pagination: Pagination }>(
      `/integrations/stores/${id}/youcan/products`,
      { params: { page, ...(search ? { search } : {}) } },
    ).then((r) => r.data),

  importProducts: (id: string, productIds?: string[]) =>
    api.post<ImportResult>(`/integrations/stores/${id}/import/products`, { productIds }).then((r) => r.data),

  reconcilePlaceholders: (id: string) =>
    api.post<{ reconciled: number; skipped: number; errors: number; details: string[] }>(
      `/integrations/stores/${id}/reconcile-placeholders`,
    ).then((r) => r.data),

  // Orders
  importOrders: (id: string, count?: number) =>
    api.post<ImportResult>(`/integrations/stores/${id}/import/orders`, { count }).then((r) => r.data),

  // One-shot repair: re-fetch every imported YouCan order across every store
  // and patch its CRM `createdAt` to the original placement timestamp from
  // YouCan. Fixes historical rows whose dates were collapsed to import time.
  backfillCreatedAt: () =>
    api
      .post<BackfillResult>('/integrations/youcan/backfill-created-at')
      .then((r) => r.data),

  // Logs
  getLogs: (id: string, page = 1, pageSize = 50) =>
    api.get<{ data: ImportLog[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
      `/integrations/stores/${id}/logs`,
      { params: { page, pageSize } },
    ).then((r) => r.data),
};

export interface BackfillResult {
  scanned: number;
  updated: number;
  unchanged: number;
  failed: number;
  perStore: Array<{
    storeId: string;
    storeName: string;
    scanned: number;
    updated: number;
    unchanged: number;
    failed: number;
  }>;
}
