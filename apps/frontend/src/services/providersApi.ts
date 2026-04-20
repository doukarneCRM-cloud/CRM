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

export const coliixApi = {
  exportOne: (orderId: string) =>
    api.post<ExportResult>(`/integrations/coliix/export/${orderId}`).then((r) => r.data),

  exportBulk: (orderIds: string[]) =>
    api.post<BulkExportResponse>('/integrations/coliix/export', { orderIds }).then((r) => r.data),
};
