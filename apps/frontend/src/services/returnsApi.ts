import { api } from './api';

export interface ReturnOrderItem {
  id: string;
  quantity: number;
  variant: {
    id: string;
    sku: string;
    color: string | null;
    size: string | null;
    stock?: number;
    product: { id: string; name: string };
  };
}

export interface ReturnOrder {
  id: string;
  reference: string;
  shippingStatus: string;
  total?: number;
  coliixTrackingId: string | null;
  returnNote?: string | null;
  returnVerifiedAt?: string | null;
  returnVerifiedBy?: { id: string; name: string } | null;
  updatedAt?: string;
  deliveredAt?: string | null;
  customer: {
    fullName: string;
    phone: string;
    phoneDisplay: string;
    city: string;
    address?: string | null;
  };
  items: ReturnOrderItem[];
}

export interface ReturnListResponse {
  data: ReturnOrder[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export type VerifyOutcome = 'good' | 'damaged' | 'wrong';

export const returnsApi = {
  list: (params: {
    page?: number;
    pageSize?: number;
    scope?: 'pending' | 'verified' | 'all';
    search?: string;
  }) => api.get<ReturnListResponse>('/returns', { params }).then((r) => r.data),

  scan: (query: string) =>
    api.get<ReturnOrder>(`/returns/scan/${encodeURIComponent(query)}`).then((r) => r.data),

  verify: (id: string, input: { outcome: VerifyOutcome; note?: string | null }) =>
    api.post(`/returns/${id}/verify`, input).then((r) => r.data),
};
