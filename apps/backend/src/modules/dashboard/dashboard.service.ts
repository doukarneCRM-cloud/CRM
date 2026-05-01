/**
 * Dashboard service — per-card compute functions.
 *
 * All cards accept the same OrderFilterParams shape the rest of the CRM
 * uses (`agentIds`, `cities`, `productIds`, `confirmationStatuses`,
 * `shippingStatuses`, `sources`, `dateFrom`, `dateTo`). When no filters are
 * supplied the cards report ALL-TIME numbers — that's the default.
 *
 * Date filtering always dates against `createdAt` (the single calendar that
 * answers "orders created in this window"). Per-status timestamps still
 * power the daily-trend chart; otherwise everything pivots on createdAt so
 * the global filter bar produces the same numbers in every card.
 */

import { prisma } from '../../shared/prisma';
import { buildOrderWhereClause, type OrderFilterParams } from '../../utils/filterBuilder';

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeRate(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 10000) / 100;
}

// ─── Card 1: Orders (total / pending / not assigned) ────────────────────────

export interface OrdersCardPayload {
  total: number;
  pending: number;
  notAssigned: number;
}

export async function computeOrdersCard(
  filters: OrderFilterParams = {},
): Promise<OrdersCardPayload> {
  const where = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const [total, pending, notAssigned] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, confirmationStatus: 'pending' } }),
    prisma.order.count({ where: { ...where, agentId: null, confirmationStatus: 'pending' } }),
  ]);
  return { total, pending, notAssigned };
}

// ─── Cards 2-4: Confirmation / Delivery / Return rates ──────────────────────
// All three rates share a single denominator pool (orders matching the
// filter, dated by createdAt) so they compose: created → confirmed →
// delivered. Returning every numerator + denominator lets the UI render
// the raw counts alongside each percentage.

export interface RatesCardPayload {
  // Confirmation
  confirmed: number;
  confirmationDenom: number; // matched filter (createdAt)
  confirmationRate: number;
  // Delivery
  delivered: number;
  deliveryDenom: number; // confirmed
  deliveryRate: number;
  // Return
  returned: number;
  returnDenom: number; // shipped (labelSent=true)
  returnRate: number;
}

export async function computeRatesCard(
  filters: OrderFilterParams = {},
): Promise<RatesCardPayload> {
  const where = buildOrderWhereClause(filters, { dateField: 'createdAt' });

  const [confirmationDenom, confirmed, delivered, shipped, returned] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.count({ where: { ...where, confirmationStatus: 'confirmed' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.count({ where: { ...where, labelSent: true } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'returned' } }),
  ]);

  return {
    confirmed,
    confirmationDenom,
    confirmationRate: safeRate(confirmed, confirmationDenom),
    delivered,
    deliveryDenom: confirmed,
    deliveryRate: safeRate(delivered, confirmed),
    returned,
    returnDenom: shipped,
    returnRate: safeRate(returned, shipped),
  };
}

// ─── Card 5: Merged orders ──────────────────────────────────────────────────

export interface MergedCardPayload {
  merged: number;
  total: number;
  rate: number;
}

export async function computeMergedCard(
  filters: OrderFilterParams = {},
): Promise<MergedCardPayload> {
  // Merged orders are archived, so rerun with isArchived:'all' to count them.
  const activeWhere = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const mergedWhere = buildOrderWhereClause(
    { ...filters, isArchived: 'all' },
    { dateField: 'createdAt' },
  );
  const [active, merged] = await Promise.all([
    prisma.order.count({ where: activeWhere }),
    prisma.order.count({ where: { ...mergedWhere, mergedIntoId: { not: null } } }),
  ]);
  const denom = active + merged;
  return { merged, total: denom, rate: safeRate(merged, denom) };
}

// ─── Card 6: Revenue ────────────────────────────────────────────────────────

export interface RevenueCardPayload {
  deliveredCount: number;
  revenue: number;
  shippingFees: number;
  netRevenue: number;
}

export async function computeRevenueCard(
  filters: OrderFilterParams = {},
): Promise<RevenueCardPayload> {
  // Revenue dates against deliveredAt (the column that records the moment
  // the money was earned). The rest of the cards date on createdAt; this
  // one diverges by design — see the doc comment on `dateField` in
  // filterBuilder.
  const where = {
    ...buildOrderWhereClause(filters, { dateField: 'deliveredAt' }),
    shippingStatus: 'delivered' as const,
  };
  const [count, revenueAgg, feesAgg] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where, _sum: { total: true } }),
    prisma.order.aggregate({ where, _sum: { shippingPrice: true } }),
  ]);
  const revenue = Number(revenueAgg._sum.total ?? 0);
  const shippingFees = Number(feesAgg._sum.shippingPrice ?? 0);
  return {
    deliveredCount: count,
    revenue,
    shippingFees,
    netRevenue: revenue - shippingFees,
  };
}

// ─── Operations Card 1: Commission unpaid by agent ──────────────────────────

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

export async function computeUnpaidCommissionCard(
  filters: OrderFilterParams = {},
): Promise<UnpaidCommissionPayload> {
  const baseWhere = buildOrderWhereClause(filters, { dateField: 'deliveredAt' });
  const pending = await prisma.order.findMany({
    where: {
      ...baseWhere,
      shippingStatus: 'delivered',
      commissionPaid: false,
      commissionAmount: { not: null },
      agentId: { not: null },
    },
    select: { agentId: true, commissionAmount: true },
  });

  const byAgent = new Map<string, { count: number; amount: number }>();
  for (const o of pending) {
    if (!o.agentId) continue;
    const slot = byAgent.get(o.agentId) ?? { count: 0, amount: 0 };
    slot.count += 1;
    slot.amount += Number(o.commissionAmount ?? 0);
    byAgent.set(o.agentId, slot);
  }

  const ids = Array.from(byAgent.keys());
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  const agents: UnpaidCommissionAgent[] = ids
    .map((id) => ({
      agentId: id,
      name: nameById.get(id) ?? '—',
      pendingCount: byAgent.get(id)!.count,
      pendingAmount: byAgent.get(id)!.amount,
    }))
    .sort((a, b) => b.pendingAmount - a.pendingAmount);

  return {
    totalAmount: agents.reduce((s, a) => s + a.pendingAmount, 0),
    totalOrders: agents.reduce((s, a) => s + a.pendingCount, 0),
    agents,
  };
}

// ─── Operations Card 2: Returns awaiting verification ───────────────────────

export interface AwaitingReturnsPayload {
  count: number;
}

export async function computeAwaitingReturnsCard(
  filters: OrderFilterParams = {},
): Promise<AwaitingReturnsPayload> {
  const where = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const count = await prisma.order.count({
    where: { ...where, shippingStatus: 'returned', returnOutcome: null },
  });
  return { count };
}

// ─── Daily trend chart ──────────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  orders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
}

export async function computeTrend(
  days: number,
  filters: OrderFilterParams = {},
): Promise<TrendPoint[]> {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  // The trend chart spans `days` regardless of the global date filter (the
  // filter doesn't make sense on a fixed-window view). Other filters
  // (agent / source / city / status) DO apply via buildOrderWhereClause.
  const filterNoDates: OrderFilterParams = {
    ...filters,
    dateFrom: undefined,
    dateTo: undefined,
  };
  const baseWhere = buildOrderWhereClause(filterNoDates);

  const [created, confirmed, delivered] = await Promise.all([
    prisma.order.findMany({
      where: { ...baseWhere, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    prisma.order.findMany({
      where: {
        ...baseWhere,
        confirmationStatus: 'confirmed',
        confirmedAt: { gte: from, lte: to },
      },
      select: { confirmedAt: true },
    }),
    prisma.order.findMany({
      where: {
        ...baseWhere,
        shippingStatus: 'delivered',
        deliveredAt: { gte: from, lte: to },
      },
      select: { deliveredAt: true },
    }),
  ]);

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const buckets = new Map<string, { orders: number; confirmed: number; delivered: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    buckets.set(dayKey(d), { orders: 0, confirmed: 0, delivered: 0 });
  }
  for (const o of created) {
    const k = dayKey(o.createdAt);
    if (buckets.has(k)) buckets.get(k)!.orders += 1;
  }
  for (const o of confirmed) {
    if (!o.confirmedAt) continue;
    const k = dayKey(o.confirmedAt);
    if (buckets.has(k)) buckets.get(k)!.confirmed += 1;
  }
  for (const o of delivered) {
    if (!o.deliveredAt) continue;
    const k = dayKey(o.deliveredAt);
    if (buckets.has(k)) buckets.get(k)!.delivered += 1;
  }

  return Array.from(buckets.entries()).map(([date, v]) => ({
    date,
    orders: v.orders,
    confirmed: v.confirmed,
    delivered: v.delivered,
    confirmationRate: safeRate(v.confirmed, v.orders),
    deliveryRate: safeRate(v.delivered, v.confirmed),
  }));
}

// ─── Confirmation donut ─────────────────────────────────────────────────────
// Optional `agentId` overrides any agentIds filter so the inline picker on
// the donut card narrows independently of the global filter bar.

export interface ConfirmationDonutPayload {
  agentId: string | null;
  breakdown: Record<string, number>;
}

export async function computeConfirmationDonut(
  filters: OrderFilterParams = {},
  agentId: string | null = null,
): Promise<ConfirmationDonutPayload> {
  const merged: OrderFilterParams = agentId ? { ...filters, agentIds: agentId } : filters;
  const where = buildOrderWhereClause(merged, { dateField: 'createdAt' });

  const groups = await prisma.order.groupBy({
    by: ['confirmationStatus'],
    where,
    _count: { _all: true },
  });
  const breakdown: Record<string, number> = {};
  for (const g of groups) breakdown[g.confirmationStatus] = g._count._all;
  return { agentId, breakdown };
}

// ─── Pipeline: per-agent assigned breakdown ─────────────────────────────────

export interface AgentPipelineRow {
  agentId: string;
  name: string;
  total: number;
  byStatus: Record<string, number>;
}

export async function computeAgentPipeline(
  filters: OrderFilterParams = {},
): Promise<AgentPipelineRow[]> {
  const where = {
    ...buildOrderWhereClause(filters, { dateField: 'createdAt' }),
    agentId: { not: null },
  };

  const groups = await prisma.order.groupBy({
    by: ['agentId', 'confirmationStatus'],
    where,
    _count: { _all: true },
  });

  const byAgent = new Map<string, { total: number; byStatus: Record<string, number> }>();
  for (const g of groups) {
    if (!g.agentId) continue;
    const slot = byAgent.get(g.agentId) ?? { total: 0, byStatus: {} };
    slot.total += g._count._all;
    slot.byStatus[g.confirmationStatus] = g._count._all;
    byAgent.set(g.agentId, slot);
  }

  const ids = Array.from(byAgent.keys());
  const users = ids.length
    ? await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));

  return ids
    .map((id) => ({
      agentId: id,
      name: nameById.get(id) ?? '—',
      total: byAgent.get(id)!.total,
      byStatus: byAgent.get(id)!.byStatus,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── Pipeline: per-product breakdown ────────────────────────────────────────

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

export async function computeProductPipeline(
  limit = 20,
  filters: OrderFilterParams = {},
): Promise<ProductPipelineRow[]> {
  const orderWhere = buildOrderWhereClause(filters, { dateField: 'createdAt' });

  const items = await prisma.orderItem.findMany({
    where: { order: orderWhere },
    select: {
      variant: { select: { product: { select: { id: true, name: true, imageUrl: true } } } },
      order: { select: { id: true, confirmationStatus: true, shippingStatus: true } },
    },
  });

  // De-dupe order×product pairs — multiple items of the same product on
  // one order should still count as one order for that product.
  const seen = new Set<string>();
  const byProduct = new Map<
    string,
    { name: string; imageUrl: string | null; orders: number; confirmed: number; delivered: number }
  >();

  for (const it of items) {
    const p = it.variant.product;
    const key = `${it.order.id}:${p.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const slot =
      byProduct.get(p.id) ?? {
        name: p.name,
        imageUrl: p.imageUrl,
        orders: 0,
        confirmed: 0,
        delivered: 0,
      };
    slot.orders += 1;
    if (it.order.confirmationStatus === 'confirmed') slot.confirmed += 1;
    if (it.order.shippingStatus === 'delivered') slot.delivered += 1;
    byProduct.set(p.id, slot);
  }

  return Array.from(byProduct.entries())
    .map(([productId, v]) => ({
      productId,
      name: v.name,
      imageUrl: v.imageUrl,
      orders: v.orders,
      confirmed: v.confirmed,
      delivered: v.delivered,
      confirmationRate: safeRate(v.confirmed, v.orders),
      deliveryRate: safeRate(v.delivered, v.confirmed),
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}
