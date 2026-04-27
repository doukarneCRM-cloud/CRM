import { api } from './api';

export interface DashboardKPIs {
  totalOrders: number;
  confirmationRate: number;
  deliveryRate: number;
  returnRate: number;
  mergedRate: number;
  revenue: number;
  profit: number;
  counts: {
    confirmed: number;
    confirmationDenom: number;
    delivered: number;
    deliveryDenom: number;
    returned: number;
    returnDenom: number;
    merged: number;
    mergedDenom: number;
  };
  percentageChanges: {
    totalOrders: number;
    confirmationRate: number;
    deliveryRate: number;
    returnRate: number;
    mergedRate: number;
    revenue: number;
    profit: number;
  };
  compare: { from: string | null; to: string | null };
}

export interface DashboardAgent {
  agentId: string;
  agentName: string;
  totalOrders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
  revenue: number;
}

export interface DashboardTopProduct {
  productId: string;
  productName: string;
  orders: number;
  revenue: number;
}

export interface DashboardTopCity {
  city: string;
  orders: number;
  delivered: number;
  deliveryRate: number;
}

export interface DashboardTrendPoint {
  date: string;
  count: number;
}

export interface DashboardStatusBreakdown {
  confirmation: Record<string, number>;
  shipping: Record<string, number>;
}

export interface DashboardPayload {
  kpis: DashboardKPIs;
  agents: DashboardAgent[];
  topProducts: DashboardTopProduct[];
  topCities: DashboardTopCity[];
  trend: DashboardTrendPoint[];
  breakdown: DashboardStatusBreakdown;
}

export interface DashboardFilters {
  agentIds?: string;
  productIds?: string;
  cities?: string;
  confirmationStatuses?: string;
  shippingStatuses?: string;
  coliixRawStates?: string;
  sources?: string;
  dateFrom?: string;
  dateTo?: string;
  compareFrom?: string;
  compareTo?: string;
}

export const dashboardApi = {
  get: (filters: DashboardFilters) =>
    api.get<DashboardPayload>('/kpi/dashboard', { params: filters }).then((r) => r.data),
};
