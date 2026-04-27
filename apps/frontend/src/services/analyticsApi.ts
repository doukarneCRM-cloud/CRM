import { api } from './api';

// ─── Shared filter shape (mirrors backend OrderFilterParams) ────────────────
export interface AnalyticsFilters {
  agentIds?: string;
  productIds?: string;
  cities?: string;
  confirmationStatuses?: string;
  shippingStatuses?: string;
  coliixRawStates?: string;
  sources?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Delivery ───────────────────────────────────────────────────────────────
export interface DeliveryKPIs {
  shipped: number;
  delivered: number;
  returned: number;
  inTransit: number;
  deliveryRate: number;
  returnRate: number;
  avgDeliveryDays: number;
  revenue: number;
  percentageChanges: {
    shipped: number;
    delivered: number;
    returned: number;
    deliveryRate: number;
    returnRate: number;
    avgDeliveryDays: number;
    revenue: number;
  };
}

export interface ShippingPipelineBucket {
  status: string;
  count: number;
}

export interface CityDeliveryStats {
  city: string;
  orders: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  avgDeliveryDays: number;
}

export interface AgentDeliveryStats {
  agentId: string;
  agentName: string;
  confirmed: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  revenue: number;
}

export interface ProductDeliveryStats {
  productId: string;
  productName: string;
  imageUrl: string | null;
  orders: number;
  delivered: number;
  returned: number;
  deliveryRate: number;
  revenue: number;
  variants: Array<{
    variantId: string;
    label: string;
    orders: number;
    delivered: number;
    deliveryRate: number;
  }>;
}

export interface DeliveryTrendPoint {
  date: string;
  delivered: number;
  returned: number;
}

export interface DeliveryTabPayload {
  kpis: DeliveryKPIs;
  pipeline: ShippingPipelineBucket[];
  cities: CityDeliveryStats[];
  agents: AgentDeliveryStats[];
  products: ProductDeliveryStats[];
  trend: DeliveryTrendPoint[];
}

// ─── Confirmation ───────────────────────────────────────────────────────────
export interface ConfirmationKPIs {
  totalOrders: number;
  confirmed: number;
  cancelled: number;
  unreachable: number;
  pending: number;
  merged: number;
  confirmationRate: number;
  cancellationRate: number;
  mergedRate: number;
  avgConfirmationHours: number;
  percentageChanges: {
    totalOrders: number;
    confirmed: number;
    cancelled: number;
    merged: number;
    confirmationRate: number;
    mergedRate: number;
    avgConfirmationHours: number;
  };
}

export interface ConfirmationPipelineBucket {
  status: string;
  count: number;
}

export interface AgentConfirmationStats {
  agentId: string;
  agentName: string;
  total: number;
  confirmed: number;
  cancelled: number;
  unreachable: number;
  confirmationRate: number;
}

export interface ProductConfirmationStats {
  productId: string;
  productName: string;
  imageUrl: string | null;
  orders: number;
  confirmed: number;
  cancelled: number;
  confirmationRate: number;
  variants: Array<{
    variantId: string;
    label: string;
    orders: number;
    confirmed: number;
    confirmationRate: number;
  }>;
}

export interface CityConfirmationStats {
  city: string;
  orders: number;
  confirmed: number;
  cancelled: number;
  confirmationRate: number;
}

export interface ConfirmationTrendPoint {
  date: string;
  confirmed: number;
  cancelled: number;
}

export interface ConfirmationTabPayload {
  kpis: ConfirmationKPIs;
  pipeline: ConfirmationPipelineBucket[];
  agents: AgentConfirmationStats[];
  products: ProductConfirmationStats[];
  cities: CityConfirmationStats[];
  trend: ConfirmationTrendPoint[];
}

// ─── Profit ─────────────────────────────────────────────────────────────────
export interface ProfitKPIs {
  revenue: number;
  cogs: number;
  shippingFees: number;
  expenses: number;
  profit: number;
  margin: number;
  percentageChanges: {
    revenue: number;
    cogs: number;
    shippingFees: number;
    expenses: number;
    profit: number;
    margin: number;
  };
}

export interface ProfitTrendPoint {
  date: string;
  revenue: number;
  profit: number;
}

export interface ProfitByProduct {
  productId: string;
  productName: string;
  imageUrl: string | null;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin: number;
}

export interface ProfitByAgent {
  agentId: string;
  agentName: string;
  revenue: number;
  cogs: number;
  shippingFees: number;
  profit: number;
  margin: number;
}

export interface ProfitTabPayload {
  kpis: ProfitKPIs;
  trend: ProfitTrendPoint[];
  byProduct: ProfitByProduct[];
  byAgent: ProfitByAgent[];
  breakdown: {
    revenue: number;
    cogs: number;
    shippingFees: number;
    expenses: number;
    profit: number;
  };
}

export const analyticsApi = {
  delivery: (filters: AnalyticsFilters) =>
    api.get<DeliveryTabPayload>('/analytics/delivery', { params: filters }).then((r) => r.data),

  confirmation: (filters: AnalyticsFilters) =>
    api.get<ConfirmationTabPayload>('/analytics/confirmation', { params: filters }).then((r) => r.data),

  profit: (filters: AnalyticsFilters) =>
    api.get<ProfitTabPayload>('/analytics/profit', { params: filters }).then((r) => r.data),
};
