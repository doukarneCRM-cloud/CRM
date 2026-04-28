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
  errorStatus?: number;
  errorPayload?: unknown;
}

export interface RefreshAllResult {
  total: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: TrackNowResult[];
}

export interface ColiixWebhookRejection {
  createdAt: string;
  statusCode: number;
  secretMatched: boolean;
  tracking: string | null;
  rawState: string | null;
  reason: string | null;
  ip: string | null;
}

export interface ColiixWebhookHealth {
  lastWebhookAt: string | null;
  count1h: number;
  count24h: number;
  lastPollerAt: string | null;
  recentRejections: ColiixWebhookRejection[];
}

export const coliixApi = {
  exportOne: (orderId: string) =>
    api.post<ExportResult>(`/integrations/coliix/export/${orderId}`).then((r) => r.data),

  exportBulk: (orderIds: string[]) =>
    api.post<BulkExportResponse>('/integrations/coliix/export', { orderIds }).then((r) => r.data),

  // Force a fresh tracking pull for every in-flight order. Useful when
  // webhooks have been silent or to verify the state-mapping rules.
  // Override the default 15s axios timeout — the backend polls Coliix
  // sequentially, so a few dozen in-flight orders × ~1s round-trip easily
  // outruns the global timeout. 3 minutes lets a ~150-order sweep finish.
  refreshAll: () =>
    api
      .post<RefreshAllResult>(
        '/integrations/coliix/refresh-all',
        undefined,
        { timeout: 180_000 },
      )
      .then((r) => r.data),

  // Re-apply the local Coliix → ShippingStatus mapping to every order
  // that has a stored coliixRawState. No outbound API calls; corrects
  // historical mismappings (e.g. orders previously bucketed wrongly
  // when "Confirmer par le livreur" was mapping to delivered).
  remapStatuses: () =>
    api
      .post<{
        scanned: number;
        changed: number;
        unchanged: number;
        unmapped: number;
        rows: Array<{
          orderId: string;
          reference: string;
          rawState: string;
          prevStatus: string;
          newStatus: string | null;
          changed: boolean;
        }>;
      }>('/integrations/coliix/remap-statuses', undefined, { timeout: 120_000 })
      .then((r) => r.data),

  // "Is Coliix actually calling us?" health snapshot.
  webhookHealth: () =>
    api.get<ColiixWebhookHealth>('/integrations/coliix/webhook-health').then((r) => r.data),

  // Distinct coliixRawState values present on orders, with counts. Used
  // to populate the shipping-status filter chip with Coliix's actual
  // wordings instead of our internal ShippingStatus enum.
  states: () =>
    api
      .get<{ states: Array<{ value: string; count: number }> }>(
        '/integrations/coliix/states',
      )
      .then((r) => r.data.states),
};
