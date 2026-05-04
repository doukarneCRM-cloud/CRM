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

// ─── All Orders ─────────────────────────────────────────────────────────────
export type AllOrdersRiskBand = 'imminent' | 'low' | 'healthy' | 'overstock' | 'stale';

export interface AllOrdersKPIs {
  totalOrders: number;
  avgItemsPerOrder: number;
  topSource: { source: string; count: number; pct: number } | null;
  topVariant: {
    variantId: string;
    productName: string;
    color: string | null;
    size: string | null;
    quantity: number;
  } | null;
  stockAtRisk: number;
  percentageChanges: {
    totalOrders: number;
    avgItemsPerOrder: number;
  };
}

export interface AllOrdersSourceRow {
  source: string;
  orders: number;
  confirmed: number;
  delivered: number;
  revenue: number;
  confirmationRate: number;
}

export interface AllOrdersTrendPoint {
  date: string;
  bySource: Record<string, number>;
}

export interface AllOrdersTopVariant {
  variantId: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  quantity: number;
  orders: number;
}

export interface AllOrdersVariantStat {
  variantId: string;
  productId: string;
  productName: string;
  color: string | null;
  size: string | null;
  ordered: number;
  currentStock: number;
  velocityPerDay: number;
  daysOfCover: number | null;
  suggestedReorder: number;
  risk: AllOrdersRiskBand;
}

export interface AllOrdersProductBreakdownRow {
  productId: string;
  productName: string;
  imageUrl: string | null;
  orders: number;
  variants: AllOrdersVariantStat[];
}

export interface AllOrdersTabPayload {
  kpis: AllOrdersKPIs;
  sources: AllOrdersSourceRow[];
  trendBySource: AllOrdersTrendPoint[];
  topVariants: AllOrdersTopVariant[];
  productBreakdown: AllOrdersProductBreakdownRow[];
  stockSuggestions: {
    targetDays: number;
    variants: AllOrdersVariantStat[];
  };
  windowDays: number;
}

// ─── Smart Répartition ──────────────────────────────────────────────────────
export type LifecycleStatus =
  | 'delivered'
  | 'returned'
  | 'shipped'
  | 'confirmed'
  | 'pending'
  | 'cancelled';

export interface SmartRepartitionRow {
  color: string;
  size: string;
  status: LifecycleStatus;
  count: number;
}

export interface SmartRepartitionPayload {
  product: { id: string; name: string; imageUrl: string | null } | null;
  rows: SmartRepartitionRow[];
  colors: string[];
  sizes: string[];
  rawCounts: Record<LifecycleStatus, number>;
  totalOrders: number;
  windowDays: number;
}

export const analyticsApi = {
  delivery: (filters: AnalyticsFilters) =>
    api.get<DeliveryTabPayload>('/analytics/delivery', { params: filters }).then((r) => r.data),

  confirmation: (filters: AnalyticsFilters) =>
    api.get<ConfirmationTabPayload>('/analytics/confirmation', { params: filters }).then((r) => r.data),

  profit: (filters: AnalyticsFilters) =>
    api.get<ProfitTabPayload>('/analytics/profit', { params: filters }).then((r) => r.data),

  allOrders: (filters: AnalyticsFilters & { targetDays?: number }) =>
    api
      .get<AllOrdersTabPayload>('/analytics/all-orders', { params: filters })
      .then((r) => r.data),

  smartRepartition: (params: AnalyticsFilters & { modelId: string }) =>
    api
      .get<SmartRepartitionPayload>('/analytics/smart-repartition', { params })
      .then((r) => r.data),
};
