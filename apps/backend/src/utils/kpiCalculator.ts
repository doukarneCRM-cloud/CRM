import { prisma } from '../shared/prisma';
import { buildOrderWhereClause, type OrderFilterParams } from './filterBuilder';

/**
 * Canonical KPI formulas — single source of truth.
 * Every page that shows these numbers MUST call these functions.
 * Never compute the same metric with different logic elsewhere.
 */

export interface KPIResult {
  totalOrders: number;
  confirmationRate: number;   // %
  deliveryRate: number;       // %
  returnRate: number;         // %
  revenue: number;            // MAD — delivered orders
  profit: number;             // MAD — revenue minus shipping costs
  // Numerator / denominator pairs behind each rate, so the UI can render the
  // raw count alongside the percentage without recomputing anything.
  counts: {
    confirmed: number;
    confirmationDenom: number;
    delivered: number;
    deliveryDenom: number;
    returned: number;
    returnDenom: number;
  };
}

export interface KPIPeriodResult extends KPIResult {
  percentageChanges: {
    totalOrders: number;
    confirmationRate: number;
    deliveryRate: number;
    returnRate: number;
    revenue: number;
    profit: number;
  };
  // Echo back the comparison range actually used so the UI can label it.
  compare: { from: string | null; to: string | null };
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100; // 2 decimal places
}

// Canonical (team-card) formulas, used everywhere for cross-page consistency:
//   confirmationRate = confirmed / totalOrders
//   deliveryRate     = delivered / confirmed
//   returnRate       = returned  / delivered
export async function computeKPIs(filters: OrderFilterParams): Promise<KPIResult> {
  const where = buildOrderWhereClause(filters);

  const totalOrders = await prisma.order.count({ where });

  const [confirmedCount, deliveredCount, returnedCount] = await Promise.all([
    prisma.order.count({ where: { ...where, confirmationStatus: 'confirmed' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.count({
      where: { ...where, shippingStatus: { in: ['returned', 'return_validated'] } },
    }),
  ]);

  const confirmationRate = safeRate(confirmedCount, totalOrders);
  const deliveryRate = safeRate(deliveredCount, confirmedCount);
  const returnRate = safeRate(returnedCount, deliveredCount);

  const denominatorCount = totalOrders;
  const deliveryDenomCount = confirmedCount;
  const returnDenomCount = deliveredCount;

  // ── 5. Revenue: SUM(total) WHERE delivered ───────────────────────────────
  const revenueAgg = await prisma.order.aggregate({
    where: { ...where, shippingStatus: 'delivered' },
    _sum: { total: true },
  });
  const revenue = revenueAgg._sum.total ?? 0;

  // ── 6. Profit: Revenue − shipping fees (delivered orders) ────────────────
  const shippingCostAgg = await prisma.order.aggregate({
    where: { ...where, shippingStatus: 'delivered' },
    _sum: { shippingPrice: true },
  });
  const shippingCosts = shippingCostAgg._sum.shippingPrice ?? 0;
  const profit = revenue - shippingCosts;

  return {
    totalOrders,
    confirmationRate,
    deliveryRate,
    returnRate,
    revenue,
    profit,
    counts: {
      confirmed: confirmedCount,
      confirmationDenom: denominatorCount,
      delivered: deliveredCount,
      deliveryDenom: deliveryDenomCount,
      returned: returnedCount,
      returnDenom: returnDenomCount,
    },
  };
}

/**
 * Compute KPIs for current period AND compare to previous period of same length.
 * Returns percentage changes for each metric.
 */
export async function computeKPIsWithComparison(
  filters: OrderFilterParams,
  compare?: { from?: string; to?: string } | null,
): Promise<KPIPeriodResult> {
  const current = await computeKPIs(filters);

  // Build previous period. Priority:
  //   1. explicit `compare` window passed by the caller (dashboard UI)
  //   2. mirror of the current date range (same duration, shifted back)
  //   3. default: previous 30 days
  let prevFrom: string;
  let prevTo: string;

  if (compare?.from && compare?.to) {
    prevFrom = compare.from;
    prevTo = compare.to;
  } else if (filters.dateFrom && filters.dateTo) {
    const from = new Date(filters.dateFrom);
    const to = new Date(filters.dateTo);
    const duration = to.getTime() - from.getTime();
    prevFrom = new Date(from.getTime() - duration).toISOString().split('T')[0];
    prevTo = new Date(from.getTime() - 1).toISOString().split('T')[0];
  } else {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    prevFrom = sixtyDaysAgo.toISOString().split('T')[0];
    prevTo = thirtyDaysAgo.toISOString().split('T')[0];
  }

  const prevFilters: OrderFilterParams = { ...filters, dateFrom: prevFrom, dateTo: prevTo };
  const previous = await computeKPIs(prevFilters);

  function pctChange(curr: number, prev: number): number {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 1000) / 10;
  }

  return {
    ...current,
    percentageChanges: {
      totalOrders: pctChange(current.totalOrders, previous.totalOrders),
      confirmationRate: pctChange(current.confirmationRate, previous.confirmationRate),
      deliveryRate: pctChange(current.deliveryRate, previous.deliveryRate),
      returnRate: pctChange(current.returnRate, previous.returnRate),
      revenue: pctChange(current.revenue, previous.revenue),
      profit: pctChange(current.profit, previous.profit),
    },
    compare: { from: prevFrom, to: prevTo },
  };
}

/**
 * Per-agent KPI breakdown for a given filter context.
 */
export async function computeAgentKPIs(
  filters: OrderFilterParams,
): Promise<
  Array<{
    agentId: string;
    agentName: string;
    totalOrders: number;
    confirmed: number;
    confirmationRate: number;
    revenue: number;
  }>
> {
  const where = buildOrderWhereClause(filters);

  // Get all agents who have orders in scope
  const agentGroups = await prisma.order.groupBy({
    by: ['agentId'],
    where: { ...where, agentId: { not: null } },
    _count: { id: true },
  });

  const agentIds = agentGroups.map((g) => g.agentId!).filter(Boolean);

  const [agents, confirmedByAgent, revenueByAgent] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { not: null }, confirmationStatus: 'confirmed' },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { not: null }, shippingStatus: 'delivered' },
      _sum: { total: true },
    }),
  ]);

  const agentMap = new Map(agents.map((a) => [a.id, a.name]));
  const confirmedMap = new Map(confirmedByAgent.map((r) => [r.agentId, r._count.id]));
  const revenueMap = new Map(revenueByAgent.map((r) => [r.agentId, r._sum.total ?? 0]));

  return agentGroups
    .filter((g) => g.agentId)
    .map((g) => {
      const total = g._count.id;
      const confirmed = confirmedMap.get(g.agentId!) ?? 0;
      return {
        agentId: g.agentId!,
        agentName: agentMap.get(g.agentId!) ?? 'Unknown',
        totalOrders: total,
        confirmed,
        confirmationRate: safeRate(confirmed, total),
        revenue: revenueMap.get(g.agentId!) ?? 0,
      };
    })
    .sort((a, b) => b.confirmed - a.confirmed);
}

/**
 * Per-agent deliveryRate on top of computeAgentKPIs.
 * Merges confirmation + delivery info so UI can render twin rings.
 */
export interface AgentPerformance {
  agentId: string;
  agentName: string;
  totalOrders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
  revenue: number;
}

export async function computeAgentPerformance(
  filters: OrderFilterParams,
): Promise<AgentPerformance[]> {
  const where = buildOrderWhereClause(filters);

  const agentGroups = await prisma.order.groupBy({
    by: ['agentId'],
    where: { ...where, agentId: { not: null } },
    _count: { id: true },
  });
  const agentIds = agentGroups.map((g) => g.agentId!).filter(Boolean);

  const [agents, confirmedByAgent, deliveredByAgent, revenueByAgent] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { not: null }, confirmationStatus: 'confirmed' },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { not: null }, shippingStatus: 'delivered' },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { not: null }, shippingStatus: 'delivered' },
      _sum: { total: true },
    }),
  ]);

  const nameOf = new Map(agents.map((a) => [a.id, a.name]));
  const confirmedOf = new Map(confirmedByAgent.map((r) => [r.agentId, r._count.id]));
  const deliveredOf = new Map(deliveredByAgent.map((r) => [r.agentId, r._count.id]));
  const revenueOf = new Map(revenueByAgent.map((r) => [r.agentId, r._sum.total ?? 0]));

  return agentGroups
    .filter((g) => g.agentId)
    .map((g) => {
      const total = g._count.id;
      const confirmed = confirmedOf.get(g.agentId!) ?? 0;
      const delivered = deliveredOf.get(g.agentId!) ?? 0;
      return {
        agentId: g.agentId!,
        agentName: nameOf.get(g.agentId!) ?? 'Unknown',
        totalOrders: total,
        confirmed,
        delivered,
        confirmationRate: safeRate(confirmed, total),
        deliveryRate: safeRate(delivered, confirmed),
        revenue: revenueOf.get(g.agentId!) ?? 0,
      };
    })
    .sort((a, b) => b.confirmationRate - a.confirmationRate);
}

/**
 * Per-agent stats for a known set of user IDs — used by the Team page, which
 * must show cards for every user (including those with zero orders). Uses the
 * same formulas as `computeAgentPerformance` so the numbers match everywhere.
 *
 * The returned map is keyed by userId and always contains an entry for every
 * id passed in, even when the agent has no orders yet.
 */
export interface AgentStats {
  totalOrders: number;
  confirmed: number;
  delivered: number;
  confirmationRate: number;
  deliveryRate: number;
  todayAssigned: number;
}

export async function computeAgentStatsByIds(
  userIds: string[],
): Promise<Map<string, AgentStats>> {
  const out = new Map<string, AgentStats>();
  for (const id of userIds) {
    out.set(id, {
      totalOrders: 0,
      confirmed: 0,
      delivered: 0,
      confirmationRate: 0,
      deliveryRate: 0,
      todayAssigned: 0,
    });
  }
  if (userIds.length === 0) return out;

  const where = buildOrderWhereClause({});
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [totalGroups, confirmedGroups, deliveredGroups, todayGroups] = await Promise.all([
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: userIds }, confirmationStatus: 'confirmed' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: userIds }, shippingStatus: 'delivered' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: userIds }, assignedAt: { gte: startOfDay } },
      _count: { _all: true },
    }),
  ]);

  for (const g of totalGroups) {
    if (!g.agentId) continue;
    const s = out.get(g.agentId);
    if (s) s.totalOrders = g._count._all;
  }
  for (const g of confirmedGroups) {
    if (!g.agentId) continue;
    const s = out.get(g.agentId);
    if (s) s.confirmed = g._count._all;
  }
  for (const g of deliveredGroups) {
    if (!g.agentId) continue;
    const s = out.get(g.agentId);
    if (s) s.delivered = g._count._all;
  }
  for (const g of todayGroups) {
    if (!g.agentId) continue;
    const s = out.get(g.agentId);
    if (s) s.todayAssigned = g._count._all;
  }

  for (const s of out.values()) {
    s.confirmationRate = safeRate(s.confirmed, s.totalOrders);
    s.deliveryRate = safeRate(s.delivered, s.confirmed);
  }

  return out;
}

/**
 * Per-agent commission — single canonical source used by every card:
 *   - Team admin card (`listUsers`)
 *   - Call-center agent KPI card (`/users/me/commission`)
 *   - Payout flow
 *
 * A commission row has exactly two states:
 *   - **paid**    → admin ran a payout, `commissionPaid = true`
 *   - **pending** → delivered but `commissionPaid = false` (owed to agent)
 *
 * `total = paidTotal + pendingTotal` is the agent's lifetime earnings.
 *
 * Amounts come from the `commissionAmount` column (locked in at delivery) so
 * rate changes never rewrite history. Delivered rows with NULL amount — e.g.
 * orders that delivered before any rule existed — fall back to the current
 * per-order rate; the payout flow backfills them as it runs.
 */
export interface AgentCommission {
  onConfirmRate: number;
  onDeliverRate: number;
  perOrderRate: number;

  deliveredCount: number;
  paidCount: number;
  pendingCount: number;

  paidTotal: number;
  pendingTotal: number;
  total: number;
}

export async function computeAgentCommission(
  agentId: string,
  window?: { from?: Date | null; to?: Date | null },
): Promise<AgentCommission> {
  const range = window?.from && window?.to
    ? { updatedAt: { gte: window.from, lte: window.to } }
    : {};
  const base = { agentId, isArchived: false, shippingStatus: 'delivered' as const } as const;

  const [rules, paidAgg, pendingAgg, pendingLegacyCount] = await Promise.all([
    prisma.commissionRule.findMany({ where: { agentId }, select: { type: true, value: true } }),
    // PAID — admin has already disbursed. Amount is locked in.
    prisma.order.aggregate({
      where: { ...base, commissionPaid: true, commissionAmount: { not: null }, ...range },
      _sum: { commissionAmount: true },
      _count: { _all: true },
    }),
    // PENDING with a ledger amount — delivered-with-rule, not yet paid.
    prisma.order.aggregate({
      where: { ...base, commissionPaid: false, commissionAmount: { not: null }, ...range },
      _sum: { commissionAmount: true },
      _count: { _all: true },
    }),
    // PENDING legacy — delivered before any rule existed. Valued at the current
    // per-order rate. Counts as pending until the payout flow backfills them.
    prisma.order.count({
      where: { ...base, commissionPaid: false, commissionAmount: null, ...range },
    }),
  ]);

  const onConfirmRate = rules.find((r) => r.type === 'onConfirm')?.value ?? 0;
  const onDeliverRate = rules.find((r) => r.type === 'onDeliver')?.value ?? 0;
  const perOrderRate = onConfirmRate + onDeliverRate;

  const paidCount = paidAgg._count._all;
  const paidTotal = paidAgg._sum.commissionAmount ?? 0;

  const pendingLedger = pendingAgg._sum.commissionAmount ?? 0;
  const pendingCount = pendingAgg._count._all + pendingLegacyCount;
  const pendingTotal = pendingLedger + pendingLegacyCount * perOrderRate;

  const deliveredCount = paidCount + pendingCount;
  const total = paidTotal + pendingTotal;

  return {
    onConfirmRate,
    onDeliverRate,
    perOrderRate,
    deliveredCount,
    paidCount,
    pendingCount,
    paidTotal: Math.round(paidTotal * 100) / 100,
    pendingTotal: Math.round(pendingTotal * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Bulk variant — returns a Map<agentId, AgentCommission> for a set of agents.
 * Every id in the input appears in the output, even with zero orders.
 */
export async function computeAgentCommissionByIds(
  userIds: string[],
): Promise<Map<string, AgentCommission>> {
  const out = new Map<string, AgentCommission>();
  const results = await Promise.all(userIds.map((id) => computeAgentCommission(id)));
  userIds.forEach((id, i) => out.set(id, results[i]));
  return out;
}

/**
 * Top products by order count in scope.
 */
export interface TopProduct {
  productId: string;
  productName: string;
  orders: number;
  revenue: number;
}

export async function computeTopProducts(
  filters: OrderFilterParams,
  limit = 5,
): Promise<TopProduct[]> {
  const where = buildOrderWhereClause(filters);
  const rows = await prisma.orderItem.findMany({
    where: { order: where },
    select: {
      orderId: true,
      total: true,
      variant: {
        select: {
          product: { select: { id: true, name: true } },
        },
      },
      order: { select: { shippingStatus: true } },
    },
  });

  // Distinct orderId per product — an order with 2 products counts once toward each.
  const byProduct = new Map<
    string,
    { productName: string; orderIds: Set<string>; revenue: number }
  >();
  for (const r of rows) {
    const p = r.variant.product;
    const entry =
      byProduct.get(p.id) ?? { productName: p.name, orderIds: new Set<string>(), revenue: 0 };
    entry.orderIds.add(r.orderId);
    if (r.order.shippingStatus === 'delivered') entry.revenue += r.total;
    byProduct.set(p.id, entry);
  }

  return Array.from(byProduct.entries())
    .map(([productId, v]) => ({
      productId,
      productName: v.productName,
      orders: v.orderIds.size,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}

/**
 * Top cities by order count + their per-city delivery rate.
 */
export interface TopCity {
  city: string;
  orders: number;
  delivered: number;
  deliveryRate: number;
}

export async function computeTopCities(
  filters: OrderFilterParams,
  limit = 5,
): Promise<TopCity[]> {
  const where = buildOrderWhereClause(filters);
  const orders = await prisma.order.findMany({
    where,
    select: { shippingStatus: true, customer: { select: { city: true } } },
  });

  const byCity = new Map<string, { orders: number; delivered: number }>();
  for (const o of orders) {
    const city = o.customer.city;
    const entry = byCity.get(city) ?? { orders: 0, delivered: 0 };
    entry.orders += 1;
    if (o.shippingStatus === 'delivered') entry.delivered += 1;
    byCity.set(city, entry);
  }

  return Array.from(byCity.entries())
    .map(([city, v]) => ({
      city,
      orders: v.orders,
      delivered: v.delivered,
      deliveryRate: safeRate(v.delivered, v.orders),
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, limit);
}

/**
 * Orders per day trend for the given date range (or last 30 days).
 */
export interface TrendPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export async function computeOrderTrend(filters: OrderFilterParams): Promise<TrendPoint[]> {
  const where = buildOrderWhereClause(filters);

  const from = filters.dateFrom
    ? new Date(filters.dateFrom)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();

  const orders = await prisma.order.findMany({
    where,
    select: { createdAt: true },
  });

  const bucket = new Map<string, number>();
  // Seed all days in range to 0 so sparse days still show
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    bucket.set(d.toISOString().split('T')[0], 0);
  }
  for (const o of orders) {
    const key = o.createdAt.toISOString().split('T')[0];
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }

  return Array.from(bucket.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Count per confirmation and shipping status — for donut/bar charts.
 */
export interface StatusBreakdown {
  confirmation: Record<string, number>;
  shipping: Record<string, number>;
}

export async function computeStatusBreakdown(
  filters: OrderFilterParams,
): Promise<StatusBreakdown> {
  const where = buildOrderWhereClause(filters);

  const [confirmationGroups, shippingGroups] = await Promise.all([
    prisma.order.groupBy({
      by: ['confirmationStatus'],
      where,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['shippingStatus'],
      where,
      _count: { _all: true },
    }),
  ]);

  const confirmation: Record<string, number> = {};
  for (const g of confirmationGroups) confirmation[g.confirmationStatus] = g._count._all;
  const shipping: Record<string, number> = {};
  for (const g of shippingGroups) shipping[g.shippingStatus] = g._count._all;

  return { confirmation, shipping };
}
