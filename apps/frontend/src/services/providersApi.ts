import { api } from './api';

// Public shape of a shipping provider (Coliix, etc.). The raw API key is never
// returned — we get a masked hint instead so the UI can confirm a key is set.
export interface ShippingProvider {
  id: string;
  name: string;
  apiBaseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  webhookSecret: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

export interface ExportResult {
  orderId: string;
  reference: string;
  ok: boolean;
  tracking?: string;
  error?: string;
}

export interface BulkExportResponse {
  results: ExportResult[];
  summary: { total: number; ok: number; failed: number };
}

export const providersApi = {
  list: () =>
    api.get<{ data: ShippingProvider[] }>('/integrations/providers').then((r) => r.data.data),

  get: (name: string) =>
    api.get<ShippingProvider>(`/integrations/providers/${name}`).then((r) => r.data),

  update: (
    name: string,
    payload: { apiBaseUrl?: string; apiKey?: string | null; isActive?: boolean },
  ) =>
    api.patch<ShippingProvider>(`/integrations/providers/${name}`, payload).then((r) => r.data),

  rotateSecret: (name: string) =>
    api.post<ShippingProvider>(`/integrations/providers/${name}/rotate-secret`).then((r) => r.data),

  test: (name: string) =>
    api.post<TestResult>(`/integrations/providers/${name}/test`).then((r) => r.data),
};

// One row of the refresh-all / track-now diagnostic. Mirrors backend
// `TrackNowResult` so the UI can show the raw Coliix state, what we mapped
// it to, whether the order was actually updated, and any per-order error.
export interface TrackNowResult {
  ok: boolean;
  orderId: string;
  reference: string;
  tracking: string;
  prevStatus: string;
  coliix: { currentState: string; events: Array<{ state: string; date?: string; message?: string; driverNote?: string }> } | null;
  mapped: string | null;
  changed: boolean;
  newStatus?: string;
  reason?: string;
  error?: string;
}

export interface RefreshAllResult {
  total: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: TrackNowResult[];
}

export const coliixApi = {
  exportOne: (orderId: string) =>
    api.post<ExportResult>(`/integrations/coliix/export/${orderId}`).then((r) => r.data),

  exportBulk: (orderIds: string[]) =>
    api.post<BulkExportResponse>('/integrations/coliix/export', { orderIds }).then((r) => r.data),

  // Force a fresh tracking pull for every in-flight order. Useful when
  // webhooks have been silent or to verify the state-mapping rules.
  refreshAll: () =>
    api.post<RefreshAllResult>('/integrations/coliix/refresh-all').then((r) => r.data),
};
