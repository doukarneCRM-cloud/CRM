import { api } from './api';

export type InternalShippingStatus =
  | 'not_shipped'
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'attempted'
  | 'returned'
  | 'return_validated'
  | 'return_refused'
  | 'exchange'
  | 'lost'
  | 'destroyed';

export interface ColiixMapping {
  coliixWording: string;
  internalStatus: InternalShippingStatus | null;
  note: string | null;
  updatedAt: string;
  orderCount: number;
  // shippingStatus → count of orders with that wording currently in
  // that bucket. Lets the UI flag drift between mapping and live data.
  currentBucketCounts: Record<string, number>;
}

export interface UpdateMappingResult {
  mapping: {
    coliixWording: string;
    internalStatus: InternalShippingStatus | null;
    note: string | null;
    updatedAt: string;
  };
  affected: number;
}

// The wording is base64-url-encoded into the path because it can carry
// spaces, accents, and slashes ("Mise en distribution", "Livré au
// client"). Plain URI escape works but base64-url avoids triple-escape
// edge cases on some HTTP clients/proxies.
function encodeWording(wording: string): string {
  // btoa requires latin1 — convert through UTF-8 bytes first.
  const utf8 = new TextEncoder().encode(wording);
  let binary = '';
  for (const byte of utf8) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const coliixMappingsApi = {
  list: () =>
    api
      .get<{ mappings: ColiixMapping[] }>('/integrations/coliix/mappings')
      .then((r) => r.data.mappings),

  update: (
    wording: string,
    payload: {
      internalStatus: InternalShippingStatus | null;
      note?: string | null;
    },
  ) =>
    api
      .patch<UpdateMappingResult>(
        `/integrations/coliix/mappings/${encodeWording(wording)}`,
        payload,
      )
      .then((r) => r.data),
};
