import { api } from './api';

// ─── Account (hub) ──────────────────────────────────────────────────────────

export interface CarrierAccount {
  id: string;
  hubLabel: string;
  apiBaseUrl: string;
  apiKeyMask: string | null;
  hasApiKey: boolean;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string;
}

export interface UpdateAccountInput {
  hubLabel?: string;
  apiBaseUrl?: string;
  apiKey?: string | null;
  isActive?: boolean;
}

export interface TestResult {
  ok: boolean;
  reason?: string;
  // Set on "malformed" outcomes — first ~300 chars of what Coliix
  // actually returned so the operator can spot HTML pages, wrong URLs,
  // or schema differences without digging through server logs.
  rawSample?: string;
}

// ─── Health snapshot ────────────────────────────────────────────────────────

export interface AccountHealth {
  accountId: string;
  hubLabel: string;
  isActive: boolean;
  lastWebhookAt: string | null;
  lastPollAt: string | null;
  errorCount24h: number;
  lastHealthAt: string | null;
  lastError: string | null;
}

// ─── Cities & fees ──────────────────────────────────────────────────────────

export interface CarrierCity {
  id: string;
  accountId: string;
  ville: string;
  zone: string | null;
  deliveryPrice: number | null;
  refreshedAt: string;
}

export interface CitiesPage {
  data: CarrierCity[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ImportCitiesSummary {
  accountId: string;
  imported: number;
  unchanged: number;
  removed: number;
  totalLines: number;
  skipped: Array<{ lineNo: number; raw: string; reason: string }>;
}

// ─── Shipments ──────────────────────────────────────────────────────────────

export interface ShipmentDraft {
  accountId: string;
  orderId: string;
  reference: string;
  customer: {
    fullName: string;
    phone: string;
    phoneDisplay: string;
    city: string;
    address: string | null;
  };
  goodsLabel: string;
  goodsQty: number;
  cod: number;
  shippingInstruction: string | null;
  cityKnown: boolean;
  cityFee: number | null;
  existingShipment: { id: string; trackingCode: string; state: string } | null;
}

export interface ShipmentTimelineEvent {
  id: string;
  source: string;
  rawState: string | null;
  mappedState: string | null;
  driverNote: string | null;
  occurredAt: string;
  receivedAt: string;
}

export interface ShipmentDetail {
  id: string;
  orderId: string;
  trackingCode: string;
  state: string;
  rawState: string | null;
  cod: number;
  city: string;
  address: string;
  recipientName: string;
  recipientPhone: string;
  goodsLabel: string;
  goodsQty: number;
  comment: string | null;
  pushedAt: string;
  deliveredAt: string | null;
  returnedAt: string | null;
  events: ShipmentTimelineEvent[];
  account: { id: string; hubLabel: string };
}

// ─── Status mapping ─────────────────────────────────────────────────────────

// Mirror of the backend Prisma enum. Keep in sync with schema.prisma.
export type ShipmentState =
  | 'pending'
  | 'pushed'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'failed_delivery'
  | 'reported'
  | 'delivered'
  | 'returned';

// Values the admin can pick when assigning a Coliix wording.
// `pending` is excluded — it's a CRM-only state used before the agent
// links a tracking; Coliix will never report it. `pushed` IS included
// because Coliix's "Nouveau Colis" / "Attente De Ramassage" wordings
// land in that bucket.
export const ASSIGNABLE_SHIPMENT_STATES: ShipmentState[] = [
  'pushed',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'failed_delivery',
  'reported',
  'delivered',
  'returned',
];

export interface ColiixMapping {
  id: string;
  rawWording: string;
  internalState: ShipmentState | null;
  isTerminal: boolean;
  note: string | null;
  usageShipments: number;
  usageEvents: number;
  updatedAt: string;
  updatedById: string | null;
}

// ─── Error log ──────────────────────────────────────────────────────────────

export type ColiixErrorType =
  | 'webhook_invalid_secret'
  | 'webhook_invalid_payload'
  | 'webhook_unknown_tracking'
  | 'mapping_unknown_wording'
  | 'city_unknown'
  | 'api_credential_invalid'
  | 'api_timeout'
  | 'api_unknown';

export interface ColiixIntegrationError {
  id: string;
  type: ColiixErrorType;
  message: string;
  shipmentId: string | null;
  orderId: string | null;
  accountId: string | null;
  meta: Record<string, unknown> | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
}

export interface ListErrorsResponse {
  data: ColiixIntegrationError[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  unresolvedTotal: number;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const coliixApi = {
  // Accounts (hubs)
  listAccounts: () =>
    api.get<{ data: CarrierAccount[] }>('/coliix/accounts').then((r) => r.data.data),
  getAccount: (id: string) =>
    api.get<CarrierAccount>(`/coliix/accounts/${id}`).then((r) => r.data),
  createAccount: (input: CreateAccountInput) =>
    api.post<CarrierAccount>('/coliix/accounts', input).then((r) => r.data),
  updateAccount: (id: string, input: UpdateAccountInput) =>
    api.patch<CarrierAccount>(`/coliix/accounts/${id}`, input).then((r) => r.data),
  deleteAccount: (id: string) =>
    api.delete<{ ok: boolean }>(`/coliix/accounts/${id}`).then((r) => r.data),
  testAccount: (id: string) =>
    api.post<TestResult>(`/coliix/accounts/${id}/test`).then((r) => r.data),
  rotateSecret: (id: string) =>
    api.post<CarrierAccount>(`/coliix/accounts/${id}/rotate-secret`).then((r) => r.data),
  listHealth: () =>
    api.get<{ data: AccountHealth[] }>('/coliix/health').then((r) => r.data.data),

  // Cities
  listCities: (
    accountId: string,
    params: { search?: string; page?: number; pageSize?: number } = {},
  ) =>
    api
      .get<CitiesPage>(`/coliix/accounts/${accountId}/cities`, { params })
      .then((r) => r.data),
  importCitiesCsv: (accountId: string, file: File, mode: 'merge' | 'replace' = 'merge') => {
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    return api
      .post<ImportCitiesSummary>(`/coliix/accounts/${accountId}/cities/import-csv`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
  updateCity: (
    id: string,
    input: { ville?: string; zone?: string | null; deliveryPrice?: number | null },
  ) => api.patch<CarrierCity>(`/coliix/cities/${id}`, input).then((r) => r.data),
  deleteCity: (id: string) =>
    api.delete<{ ok: boolean }>(`/coliix/cities/${id}`).then((r) => r.data),

  // Mappings
  listMappings: (params: { search?: string; filter?: 'all' | 'mapped' | 'unknown' } = {}) =>
    api
      .get<{ data: ColiixMapping[] }>('/coliix/mappings', { params })
      .then((r) => r.data.data),
  createMapping: (input: {
    rawWording: string;
    internalState?: ShipmentState | null;
    isTerminal?: boolean;
    note?: string | null;
  }) => api.post<ColiixMapping>('/coliix/mappings', input).then((r) => r.data),
  updateMapping: (
    id: string,
    input: {
      internalState?: ShipmentState | null;
      isTerminal?: boolean;
      note?: string | null;
    },
  ) => api.patch<ColiixMapping>(`/coliix/mappings/${id}`, input).then((r) => r.data),
  deleteMapping: (id: string) =>
    api.delete<{ ok: boolean }>(`/coliix/mappings/${id}`).then((r) => r.data),

  // Shipments
  getShipmentDraft: (orderId: string, accountId?: string) =>
    api
      .get<ShipmentDraft>(`/coliix/shipments/${orderId}/draft`, {
        params: accountId ? { accountId } : undefined,
      })
      .then((r) => r.data),
  createShipment: (
    orderId: string,
    input: { accountId?: string; force?: boolean } = {},
  ) =>
    api
      .post<{ shipmentId: string; trackingCode: string }>(`/coliix/shipments/${orderId}`, input)
      .then((r) => r.data),
  getShipment: (orderId: string) =>
    api.get<ShipmentDetail>(`/coliix/shipments/${orderId}`).then((r) => r.data),
  // Force a fresh track call to Coliix and ingest the response — returns the
  // updated detail with whatever new history entries Coliix had. Used by the
  // timeline's Refresh button to skip the 60s polling cadence.
  trackNow: (orderId: string) =>
    // Empty `{}` body — Fastify's JSON parser rejects an empty payload when
    // Content-Type is application/json (which axios sets by default).
    api.post<ShipmentDetail>(`/coliix/shipments/${orderId}/track`, {}).then((r) => r.data),

  // Errors
  listErrors: (params: {
    type?: ColiixErrorType;
    resolved?: boolean;
    page?: number;
    pageSize?: number;
  } = {}) =>
    api.get<ListErrorsResponse>('/coliix/errors', { params }).then((r) => r.data),
  resolveError: (id: string) =>
    api.post<ColiixIntegrationError>(`/coliix/errors/${id}/resolve`).then((r) => r.data),
  unresolvedCount: () =>
    api.get<{ count: number }>('/coliix/errors/unresolved-count').then((r) => r.data.count),
};
