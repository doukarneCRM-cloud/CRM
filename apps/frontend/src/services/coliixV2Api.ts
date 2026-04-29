import { api } from './api';

// ── Types ────────────────────────────────────────────────────────────────────

export type ShipmentState =
  | 'pending'
  | 'push_failed'
  | 'pushed'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'refused'
  | 'returned'
  | 'lost'
  | 'cancelled';

export type ShipmentEventSource = 'webhook' | 'poll' | 'push' | 'manual';

export interface CarrierAccount {
  id: string;
  carrierCode: string;
  hubLabel: string;
  storeId: string | null;
  apiBaseUrl: string;
  apiKeyMask: string | null;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierCity {
  ville: string;
  zone: string | null;
  refreshedAt: string;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  source: ShipmentEventSource;
  rawState: string | null;
  mappedState: ShipmentState | null;
  driverNote: string | null;
  occurredAt: string;
  receivedAt: string;
  payload: unknown;
  dedupeHash: string;
}

export interface Shipment {
  id: string;
  orderId: string;
  accountId: string;
  trackingCode: string | null;
  state: ShipmentState;
  rawState: string | null;
  cod: string;
  city: string;
  zone: string | null;
  address: string;
  recipientName: string;
  recipientPhone: string;
  goodsLabel: string;
  goodsQty: number;
  note: string | null;
  pushAttempts: number;
  lastPushError: string | null;
  pushedAt: string | null;
  deliveredAt: string | null;
  returnedAt: string | null;
  nextPollAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentDetail extends Shipment {
  events: ShipmentEvent[];
}

export interface MappingRow {
  id: string;
  carrierCode: string;
  rawWording: string;
  internalState: ShipmentState;
  isTerminal: boolean;
  note: string | null;
  shipmentCount: number;
  buckets: Array<{ state: ShipmentState; count: number }>;
  updatedAt: string;
}

export interface AccountHealth {
  account: CarrierAccount;
  lastWebhookAt: string | null;
  lastWebhookOk: boolean | null;
  count1h: number;
  count24h: number;
  recentRejections: Array<{
    createdAt: string;
    statusCode: number;
    secretMatched: boolean;
    tracking: string | null;
    rawState: string | null;
    reason: string | null;
    ip: string | null;
  }>;
}

// ── API client ───────────────────────────────────────────────────────────────

export const coliixV2Api = {
  // Accounts
  listAccounts: () =>
    api.get<{ accounts: CarrierAccount[] }>('/coliixv2/accounts').then((r) => r.data.accounts),

  createAccount: (input: {
    hubLabel: string;
    apiBaseUrl?: string;
    apiKey: string;
    storeId?: string | null;
  }) => api.post<CarrierAccount>('/coliixv2/accounts', input).then((r) => r.data),

  updateAccount: (
    id: string,
    input: Partial<{
      hubLabel: string;
      apiBaseUrl: string;
      apiKey: string;
      storeId: string | null;
      isActive: boolean;
    }>,
  ) => api.patch<CarrierAccount>(`/coliixv2/accounts/${id}`, input).then((r) => r.data),

  deleteAccount: (id: string) =>
    api.delete<{ ok: boolean }>(`/coliixv2/accounts/${id}`).then((r) => r.data),

  testAccount: (id: string) =>
    api
      .post<{ ok: boolean; message: string }>(`/coliixv2/accounts/${id}/test`)
      .then((r) => r.data),

  rotateSecret: (id: string) =>
    api.post<CarrierAccount>(`/coliixv2/accounts/${id}/rotate-secret`).then((r) => r.data),

  syncCities: (id: string) =>
    api
      .post<{ total: number; inserted: number; updated: number; removed: number }>(
        `/coliixv2/accounts/${id}/sync-cities`,
        undefined,
        { timeout: 120_000 },
      )
      .then((r) => r.data),

  importV1Cities: (id: string) =>
    api
      .post<{ total: number; inserted: number; updated: number }>(
        `/coliixv2/accounts/${id}/import-v1-cities`,
        undefined,
        { timeout: 120_000 },
      )
      .then((r) => r.data),

  importCitiesCsv: (
    id: string,
    rows: Array<{ ville: string; zone?: string | null; deliveryPrice?: number | null }>,
    mode: 'upsert' | 'replace' = 'upsert',
  ) =>
    api
      .post<{
        total: number;
        inserted: number;
        updated: number;
        unchanged: number;
        removed: number;
        skipped: Array<{ ville: string; reason: string }>;
      }>(
        `/coliixv2/accounts/${id}/import-cities-csv`,
        { rows, mode },
        { timeout: 120_000 },
      )
      .then((r) => r.data),

  migrateV1Orders: (id: string) =>
    api
      .post<{
        scanned: number;
        migrated: number;
        skippedAlreadyMigrated: number;
        skippedNoTracking: number;
        skippedTerminal: number;
        skippedNoCustomerData: number;
        errors: Array<{ orderId: string; reference: string; reason: string }>;
      }>(`/coliixv2/accounts/${id}/migrate-v1`, undefined, { timeout: 300_000 })
      .then((r) => r.data),

  listCities: (id: string) =>
    api
      .get<{ cities: CarrierCity[] }>(`/coliixv2/accounts/${id}/cities`)
      .then((r) => r.data.cities),

  health: (id: string) =>
    api.get<AccountHealth>(`/coliixv2/accounts/${id}/health`).then((r) => r.data),

  // Shipments
  createShipment: (
    orderId: string,
    input?: { accountId?: string; cod?: number; note?: string | null },
  ) =>
    api
      .post<{ shipmentId: string; state: string; accountId: string; hubLabel: string }>(
        `/coliixv2/shipments/${orderId}`,
        input ?? {},
      )
      .then((r) => r.data),

  bulkShipments: (orderIds: string[]) =>
    api
      .post<{
        total: number;
        ok: number;
        failed: number;
        results: Array<{ orderId: string; ok: boolean; shipmentId?: string; error?: string }>;
      }>('/coliixv2/shipments/bulk', { orderIds })
      .then((r) => r.data),

  shipment: (id: string) =>
    api.get<ShipmentDetail>(`/coliixv2/shipments/${id}`).then((r) => r.data),

  shipmentsForOrder: (orderId: string) =>
    api
      .get<{ shipments: Shipment[] }>(`/coliixv2/orders/${orderId}/shipments`)
      .then((r) => r.data.shipments),

  refreshShipment: (id: string) =>
    api.post<{ ok: boolean; changed: boolean }>(`/coliixv2/shipments/${id}/refresh`).then((r) => r.data),

  cancelShipment: (id: string, reason?: string) =>
    api.post<{ ok: boolean }>(`/coliixv2/shipments/${id}/cancel`, { reason }).then((r) => r.data),

  // Mappings
  listMappings: () =>
    api.get<{ mappings: MappingRow[] }>('/coliixv2/mappings').then((r) => r.data.mappings),

  updateMapping: (
    id: string,
    input: { internalState: ShipmentState; isTerminal?: boolean; note?: string | null },
  ) =>
    api
      .patch<{ mapping: MappingRow; rebucketed: number }>(`/coliixv2/mappings/${id}`, input)
      .then((r) => r.data),
};

// ── Display helpers ──────────────────────────────────────────────────────────

export const SHIPMENT_STATE_LABEL: Record<ShipmentState, string> = {
  pending: 'Pending',
  push_failed: 'Push failed',
  pushed: 'Pushed',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  refused: 'Refused',
  returned: 'Returned',
  lost: 'Lost',
  cancelled: 'Cancelled',
};

export const SHIPMENT_STATE_COLOR: Record<ShipmentState, string> = {
  pending: 'bg-gray-100 text-gray-700',
  push_failed: 'bg-red-100 text-red-700',
  pushed: 'bg-blue-100 text-blue-700',
  picked_up: 'bg-indigo-100 text-indigo-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
  out_for_delivery: 'bg-amber-100 text-amber-800',
  delivered: 'bg-emerald-100 text-emerald-700',
  refused: 'bg-orange-100 text-orange-800',
  returned: 'bg-rose-100 text-rose-700',
  lost: 'bg-zinc-300 text-zinc-800',
  cancelled: 'bg-gray-200 text-gray-600',
};
