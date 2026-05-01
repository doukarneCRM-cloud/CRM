import { api } from './api';

// ─── Filters shared with the rest of the CRM ────────────────────────────────

export interface DashboardFilters {
  agentIds?: string;
  productIds?: string;
  cities?: string;
  confirmationStatuses?: string;
  shippingStatuses?: string;
  sources?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  isArchived?: string;
}

// ─── Per-card response shapes ───────────────────────────────────────────────

export interface OrdersCardPayload {
  total: number;
  pending: number;
  notAssigned: number;
}

export interface RatesCardPayload {
  confirmed: number;
  confirmationDenom: number;
  confirmationRate: number;
  delivered: number;
  deliveryDenom: number;
  deliveryRate: number;
  returned: number;
  returnDenom: number;
  returnRate: number;
}

export interface MergedCardPayload {
  merged: number;
  total: number;
  rate: number;
}

export interface RevenueCardPayload {
  deliveredCount: number;
  revenue: number;
  shippingFees: number;
  netRevenue: number;
}

export interface UnpaidCommissionAgent {
  agentId: string;
  name: string;
  pendingCount: number;
  pendingAmount: number;
}

export interface UnpaidCommissionPayload {
  totalAmount: number;
  totalOrders: number;
  agents: UnpaidCommissionAgent[];
}

export interface AwaitingReturnsPayload {
  count: number;
}

export interface TrendPoint {
  date: string;
  orders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
}

export interface TrendPayload {
  days: number;
  points: TrendPoint[];
}

export interface ConfirmationDonutPayload {
  agentId: string | null;
  breakdown: Record<string, number>;
}

export interface AgentPipelineRow {
  agentId: string;
  name: string;
  total: number;
  byStatus: Record<string, number>;
}

export interface ProductPipelineRow {
  productId: string;
  name: string;
  imageUrl: string | null;
  orders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
}

// ─── API ────────────────────────────────────────────────────────────────────

export const dashboardApi = {
  orders: (filters: DashboardFilters = {}) =>
    api.get<OrdersCardPayload>('/dashboard/orders', { params: filters }).then((r) => r.data),
  rates: (filters: DashboardFilters = {}) =>
    api.get<RatesCardPayload>('/dashboard/rates', { params: filters }).then((r) => r.data),
  merged: (filters: DashboardFilters = {}) =>
    api.get<MergedCardPayload>('/dashboard/merged', { params: filters }).then((r) => r.data),
  revenue: (filters: DashboardFilters = {}) =>
    api.get<RevenueCardPayload>('/dashboard/revenue', { params: filters }).then((r) => r.data),
  commissionUnpaid: (filters: DashboardFilters = {}) =>
    api
      .get<UnpaidCommissionPayload>('/dashboard/commission-unpaid', { params: filters })
      .then((r) => r.data),
  returnsAwaiting: (filters: DashboardFilters = {}) =>
    api
      .get<AwaitingReturnsPayload>('/dashboard/returns-awaiting', { params: filters })
      .then((r) => r.data),
  trend: (days = 14, filters: DashboardFilters = {}) =>
    api
      .get<TrendPayload>('/dashboard/trend', { params: { days, ...filters } })
      .then((r) => r.data),
  donut: (donutAgentId: string | null = null, filters: DashboardFilters = {}) =>
    api
      .get<ConfirmationDonutPayload>('/dashboard/donut', {
        params: { ...filters, ...(donutAgentId ? { donutAgentId } : {}) },
      })
      .then((r) => r.data),
  pipelineAgents: (filters: DashboardFilters = {}) =>
    api
      .get<{ data: AgentPipelineRow[] }>('/dashboard/pipeline-agents', { params: filters })
      .then((r) => r.data.data),
  pipelineProducts: (limit = 20, filters: DashboardFilters = {}) =>
    api
      .get<{ data: ProductPipelineRow[] }>('/dashboard/pipeline-products', {
        params: { limit, ...filters },
      })
      .then((r) => r.data.data),
};
