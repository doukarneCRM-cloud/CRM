import { api } from './api';
import type {
  Order,
  PaginatedOrders,
  OrdersSummary,
  OrderFilters,
  Product,
  ShippingCity,
  AgentOption,
  OrderLog,
  CustomerDetail,
} from '@/types/orders';

// ─── Orders ──────────────────────────────────────────────────────────────────

export const ordersApi = {
  list: (filters: OrderFilters) =>
    api.get<PaginatedOrders>('/orders', { params: filters }).then((r) => r.data),

  summary: (filters: Omit<OrderFilters, 'page' | 'pageSize'>) =>
    api.get<OrdersSummary>('/orders/summary', { params: filters }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Order>(`/orders/${id}`).then((r) => r.data),

  getLogs: (id: string) =>
    api.get<{ data: OrderLog[] }>(`/orders/${id}/logs`).then((r) => r.data.data),

  create: (data: Record<string, unknown>) =>
    api.post<Order>('/orders', data).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<Order>(`/orders/${id}`, data).then((r) => r.data),

  archive: (id: string) =>
    api.delete(`/orders/${id}`),

  updateStatus: (
    id: string,
    data: {
      confirmationStatus?: string;
      shippingStatus?: string;
      note?: string;
      callbackAt?: string;
      cancellationReason?: string;
    },
  ) => api.patch<Order>(`/orders/${id}/status`, data).then((r) => r.data),

  assign: (id: string, agentId: string | null) =>
    api.patch(`/orders/${id}/assign`, { agentId }),

  bulk: (payload: {
    orderIds: string[];
    action: 'assign' | 'unassign' | 'archive' | 'unarchive';
    agentId?: string;
  }) => api.post<{ succeeded: number; failed: number; total: number }>('/orders/bulk', payload).then((r) => r.data),

  duplicates: () =>
    api.get<DuplicateGroupsResponse>('/orders/duplicates').then((r) => r.data),

  merge: (payload: { keepOrderId: string; mergeOrderIds: string[] }) =>
    api.post<Order>('/orders/merge', payload).then((r) => r.data),
};

// ─── Duplicate merge types ───────────────────────────────────────────────────

export interface DuplicateOrder {
  id: string;
  reference: string;
  agentId: string | null;
  total: number;
  createdAt: string;
  customer: { id: string; fullName: string; phoneDisplay: string; city: string };
  agent: { id: string; name: string } | null;
  items: {
    quantity: number;
    variant: {
      color: string | null;
      size: string | null;
      product: { name: string };
    };
  }[];
}

export interface DuplicateGroup {
  customerId: string;
  customer: { id: string; fullName: string; phoneDisplay: string; city: string };
  needsReassignment: boolean;
  orders: DuplicateOrder[];
}

export interface DuplicateGroupsResponse {
  groups: DuplicateGroup[];
}

// ─── Customers ────────────────────────────────────────────────────────────────

export interface ClientsListFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  city?: string;
  tag?: 'normal' | 'vip' | 'blacklisted';
  sortBy?: 'recent' | 'totalOrders';
}

export interface ClientListItem {
  id: string;
  fullName: string;
  phone: string;
  phoneDisplay: string;
  city: string;
  address: string | null;
  tag: 'normal' | 'vip' | 'blacklisted';
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  totalOrders: number;
  lastOrderAt: string | null;
}

export interface PaginatedClients {
  data: ClientListItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CreateClientPayload {
  fullName: string;
  phone: string;
  city: string;
  address?: string;
  notes?: string;
  tag?: 'normal' | 'vip' | 'blacklisted';
}

export const customersApi = {
  list: (filters: ClientsListFilters) =>
    api.get<PaginatedClients>('/customers', { params: filters }).then((r) => r.data),

  create: (payload: CreateClientPayload) =>
    api.post<CustomerDetail>('/customers', payload).then((r) => r.data),

  getById: (id: string) =>
    api.get<CustomerDetail>(`/customers/${id}`).then((r) => r.data),

  update: (id: string, data: Record<string, unknown>) =>
    api.patch<CustomerDetail>(`/customers/${id}`, data).then((r) => r.data),

  history: (id: string, page = 1, pageSize = 20) =>
    api
      .get<PaginatedOrders>(`/customers/${id}/history`, { params: { page, pageSize } })
      .then((r) => r.data),
};

// ─── Supporting data ─────────────────────────────────────────────────────────

export const supportApi = {
  products: (search?: string) =>
    api.get<{ data: Product[] }>('/products', { params: search ? { search } : {} }).then((r) => r.data.data),

  shippingCities: () =>
    api.get<{ data: ShippingCity[] }>('/shipping-cities').then((r) => r.data.data),

  agents: () =>
    api.get<{ data: AgentOption[] }>('/users/agents').then((r) => r.data.data),
};

// ─── Me (current user) ────────────────────────────────────────────────────────

export interface MyCommission {
  deliveredCount: number;
  paidCount: number;
  pendingCount: number;
  onConfirmRate: number;
  onDeliverRate: number;
  paidTotal: number;
  pendingTotal: number;
  unpaid: number;
  total: number;
  allTime: boolean;
  period: { from: string; to: string } | null;
}

export interface MyPipeline {
  todayCount: number;
  confirmation: Record<string, number>;
  shipping: Record<string, number>;
}

export const meApi = {
  commission: (opts?: { from?: string; to?: string; all?: boolean }) =>
    api
      .get<MyCommission>('/users/me/commission', {
        params: opts?.all
          ? { all: 'true' }
          : { from: opts?.from, to: opts?.to },
      })
      .then((r) => r.data),

  pipeline: () =>
    api.get<MyPipeline>('/users/me/pipeline').then((r) => r.data),
};
