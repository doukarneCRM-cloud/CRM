/**
 * Analytics module — canonical aggregations powering the Analytics page.
 *
 * Each tab (Delivery, Confirmation, Expenses, Profit) gets its own compose
 * function that returns everything the UI needs for that tab in one trip.
 *
 * All order-based aggregations reuse `buildOrderWhereClause` so filters stay
 * consistent with the Dashboard and every list view.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { buildOrderWhereClause, type OrderFilterParams } from '../../utils/filterBuilder';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function safeRate(num: number, denom: number): number {
  if (denom === 0) return 0;
  return Math.round((num / denom) * 10000) / 100;
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function dayKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

// Returns the order filter without its createdAt constraint. Used by
// "activity" queries (transition counts, trend logs) where the user's date
// filter applies to the activity timestamp (OrderLog.createdAt), not to
// when the order was originally placed.
function stripOrderCreatedAt(where: Prisma.OrderWhereInput): Prisma.OrderWhereInput {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt: _omit, ...rest } = where;
  return rest;
}

// Resolves the [from, to] window for activity-based queries (transitions
// per day, trend buckets, KPI counts of decisions). Mirrors the date-end
// inflation that buildOrderWhereClause does for createdAt so the filter
// includes the full last day instead of cutting off at midnight.
function activityRange(filters: OrderFilterParams): { from: Date; to: Date } {
  const from = filters.dateFrom
    ? new Date(filters.dateFrom)
    : new Date(Date.now() - 30 * 86_400_000);
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
  if (filters.dateTo) to.setHours(23, 59, 59, 999);
  return { from, to };
}

/** Mirror of the current date range (same duration, shifted back). */
function mirrorRange(filters: OrderFilterParams): OrderFilterParams {
  if (!filters.dateFrom || !filters.dateTo) {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 86_400_000);
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - 30 * 86_400_000);
    return { ...filters, dateFrom: dayKey(prevFrom), dateTo: dayKey(prevTo) };
  }
  const from = new Date(filters.dateFrom);
  const to = new Date(filters.dateTo);
  const duration = to.getTime() - from.getTime();
  return {
    ...filters,
    dateFrom: dayKey(new Date(from.getTime() - duration - 86_400_000)),
    dateTo: dayKey(new Date(from.getTime() - 86_400_000)),
  };
}

// ─── Delivery Tab ────────────────────────────────────────────────────────────

export interface DeliveryKPIs {
  shipped: number;              // orders that left the warehouse (label_created+)
  delivered: number;
  returned: number;
  inTransit: number;
  deliveryRate: number;         // delivered / (delivered + returned)
  returnRate: number;
  avgDeliveryDays: number;      // labelSentAt → deliveredAt avg
  revenue: number;              // SUM(total) where delivered
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

// Returned statuses — the carrier sent the parcel back. Verification outcome
// (good/damaged) is a separate field on Order, not a status branch, so a
// single bucket is enough here.
const RETURNED_STATUSES = ['returned'] as const;

async function computeDeliveryCore(filters: OrderFilterParams) {
  // Per-metric date fields. Each delivery metric dates against the column
  // that records WHEN that step happened: labelSentAt for shipped,
  // deliveredAt for delivered, returnVerifiedAt for returned. In-transit
  // is a snapshot ("currently in transit") so it stays on createdAt.
  const whereCreated   = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const whereShipped   = buildOrderWhereClause(filters, { dateField: 'labelSentAt' });
  const whereConfirmed = buildOrderWhereClause(filters, { dateField: 'confirmedAt' });
  const whereDelivered = buildOrderWhereClause(filters, { dateField: 'deliveredAt' });
  const whereReturned  = buildOrderWhereClause(filters, { dateField: 'returnVerifiedAt' });

  const [shipped, confirmed, delivered, returned, inTransit, revenueAgg, deliveredSample] =
    await Promise.all([
      prisma.order.count({ where: { ...whereShipped, labelSent: true } }),
      // Confirmed = denominator for deliveryRate, matching kpiCalculator's
      // canonical formula (delivered / confirmed).
      prisma.order.count({ where: { ...whereConfirmed, confirmationStatus: 'confirmed' } }),
      prisma.order.count({ where: { ...whereDelivered, shippingStatus: 'delivered' } }),
      prisma.order.count({
        where: { ...whereReturned, shippingStatus: { in: [...RETURNED_STATUSES] } },
      }),
      prisma.order.count({
        where: {
          ...whereCreated,
          shippingStatus: { in: ['picked_up', 'in_transit', 'out_for_delivery'] },
        },
      }),
      prisma.order.aggregate({
        where: { ...whereDelivered, shippingStatus: 'delivered' },
        _sum: { total: true },
      }),
      prisma.order.findMany({
        where: {
          ...whereDelivered,
          shippingStatus: 'delivered',
          labelSentAt: { not: null },
          deliveredAt: { not: null },
        },
        select: { labelSentAt: true, deliveredAt: true },
        take: 5000,
      }),
    ]);

  // Rates aligned with kpiCalculator.computeKPIs:
  //   deliveryRate = delivered / confirmed         ("of orders we said yes to,
  //                                                  how many got delivered")
  //   returnRate   = returned  / shipped           ("of orders we sent out,
  //                                                  how many came back")
  // The Returns page's tab can still expose its own pending-aware rate.
  const deliveryRate = safeRate(delivered, confirmed);
  const returnDenom = shipped > 0 ? shipped : delivered + returned;
  const returnRate = safeRate(returned, returnDenom);
  const revenue = revenueAgg._sum.total ?? 0;

  let avgDeliveryDays = 0;
  if (deliveredSample.length > 0) {
    const totalMs = deliveredSample.reduce((s, o) => {
      const sent = o.labelSentAt!.getTime();
      const got = o.deliveredAt!.getTime();
      return s + (got - sent);
    }, 0);
    avgDeliveryDays = Math.round((totalMs / deliveredSample.length / 86_400_000) * 10) / 10;
  }

  return { shipped, delivered, returned, inTransit, deliveryRate, returnRate, avgDeliveryDays, revenue };
}

export async function computeDeliveryTab(filters: OrderFilterParams): Promise<DeliveryTabPayload> {
  const where = buildOrderWhereClause(filters);

  const [current, previous, pipelineRows, cityRows, agentGroups, productRows, trendRows] =
    await Promise.all([
      computeDeliveryCore(filters),
      computeDeliveryCore(mirrorRange(filters)),
      // Pipeline = shipping stages of orders already pushed to a carrier
      // (labelSent: true). Buckets are the canonical ShippingStatus enum.
      prisma.order.findMany({
        where: { ...where, labelSent: true },
        select: { shippingStatus: true },
      }),
      prisma.order.findMany({
        where: { ...where, labelSent: true },
        select: {
          shippingStatus: true,
          labelSentAt: true,
          deliveredAt: true,
          customer: { select: { city: true } },
        },
      }),
      prisma.order.groupBy({
        by: ['agentId'],
        where: { ...where, agentId: { not: null }, labelSent: true },
        _count: { _all: true },
      }),
      prisma.orderItem.findMany({
        where: { order: { ...where, labelSent: true } },
        select: {
          quantity: true,
          total: true,
          variant: {
            select: {
              id: true,
              color: true,
              size: true,
              product: {
                select: { id: true, name: true, imageUrl: true },
              },
            },
          },
          order: { select: { shippingStatus: true } },
        },
      }),
      prisma.order.findMany({
        where: {
          ...where,
          shippingStatus: { in: ['delivered', 'returned'] },
        },
        select: { shippingStatus: true, deliveredAt: true, updatedAt: true },
      }),
    ]);

  // ── Pipeline buckets — keyed by ShippingStatus enum ────────────────────
  // Sorted by count desc; ties broken alphabetically for stable rendering.
  const countsByStatus = new Map<string, number>();
  for (const o of pipelineRows) {
    const key = o.shippingStatus;
    countsByStatus.set(key, (countsByStatus.get(key) ?? 0) + 1);
  }
  const pipeline = Array.from(countsByStatus.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => (b.count - a.count) || a.status.localeCompare(b.status));

  // ── Per-city breakdown ─────────────────────────────────────────────────
  const byCity = new Map<
    string,
    { orders: number; delivered: number; returned: number; totalMs: number; sampleCount: number }
  >();
  for (const row of cityRows) {
    const city = row.customer.city;
    const entry =
      byCity.get(city) ?? { orders: 0, delivered: 0, returned: 0, totalMs: 0, sampleCount: 0 };
    entry.orders += 1;
    if (row.shippingStatus === 'delivered') {
      entry.delivered += 1;
      if (row.labelSentAt && row.deliveredAt) {
        entry.totalMs += row.deliveredAt.getTime() - row.labelSentAt.getTime();
        entry.sampleCount += 1;
      }
    } else if (row.shippingStatus === 'returned') {
      entry.returned += 1;
    }
    byCity.set(city, entry);
  }
  const cities = Array.from(byCity.entries())
    .map(([city, v]) => ({
      city,
      orders: v.orders,
      delivered: v.delivered,
      returned: v.returned,
      deliveryRate: safeRate(v.delivered, v.delivered + v.returned),
      avgDeliveryDays:
        v.sampleCount > 0
          ? Math.round((v.totalMs / v.sampleCount / 86_400_000) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 12);

  // ── Per-agent breakdown ────────────────────────────────────────────────
  const agentIds = agentGroups.map((g) => g.agentId!).filter(Boolean);
  const [agentUsers, agentDelivered, agentReturned, agentRevenue] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: agentIds }, shippingStatus: 'delivered' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: {
        ...where,
        agentId: { in: agentIds },
        shippingStatus: { in: ['returned'] },
      },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: agentIds }, shippingStatus: 'delivered' },
      _sum: { total: true },
    }),
  ]);
  const agentName = new Map(agentUsers.map((u) => [u.id, u.name]));
  const agentDeliveredMap = new Map(agentDelivered.map((g) => [g.agentId, g._count._all]));
  const agentReturnedMap = new Map(agentReturned.map((g) => [g.agentId, g._count._all]));
  const agentRevenueMap = new Map(agentRevenue.map((g) => [g.agentId, g._sum.total ?? 0]));
  const agents = agentGroups
    .filter((g) => g.agentId)
    .map((g) => {
      const confirmed = g._count._all;
      const delivered = agentDeliveredMap.get(g.agentId!) ?? 0;
      const returned = agentReturnedMap.get(g.agentId!) ?? 0;
      return {
        agentId: g.agentId!,
        agentName: agentName.get(g.agentId!) ?? 'Unknown',
        confirmed,
        delivered,
        returned,
        // Canonical formula (matches Dashboard + computeDeliveryCore):
        // of orders this agent confirmed, what fraction got delivered?
        // Previous denominator (delivered + returned) silently excluded
        // in-transit orders so a busy agent's rate looked artificially
        // high until their parcels actually landed.
        deliveryRate: safeRate(delivered, confirmed),
        revenue: agentRevenueMap.get(g.agentId!) ?? 0,
      };
    })
    .sort((a, b) => b.delivered - a.delivered)
    .slice(0, 10);

  // ── Per-product breakdown with variant drilldown ───────────────────────
  interface VariantAgg {
    variantId: string;
    label: string;
    orders: number;
    delivered: number;
  }
  interface ProductAgg {
    productId: string;
    productName: string;
    imageUrl: string | null;
    orders: number;
    delivered: number;
    returned: number;
    revenue: number;
    variants: Map<string, VariantAgg>;
  }
  const byProduct = new Map<string, ProductAgg>();
  for (const row of productRows) {
    const p = row.variant.product;
    const entry =
      byProduct.get(p.id) ??
      {
        productId: p.id,
        productName: p.name,
        imageUrl: p.imageUrl,
        orders: 0,
        delivered: 0,
        returned: 0,
        revenue: 0,
        variants: new Map<string, VariantAgg>(),
      };
    entry.orders += 1;
    if (row.order.shippingStatus === 'delivered') {
      entry.delivered += 1;
      entry.revenue += row.total;
    } else if (row.order.shippingStatus === 'returned') {
      entry.returned += 1;
    }
    const variantLabel = [row.variant.color, row.variant.size].filter(Boolean).join(' / ') || '—';
    const vEntry =
      entry.variants.get(row.variant.id) ??
      { variantId: row.variant.id, label: variantLabel, orders: 0, delivered: 0 };
    vEntry.orders += 1;
    if (row.order.shippingStatus === 'delivered') vEntry.delivered += 1;
    entry.variants.set(row.variant.id, vEntry);
    byProduct.set(p.id, entry);
  }
  const products: ProductDeliveryStats[] = Array.from(byProduct.values())
    .map((p) => ({
      productId: p.productId,
      productName: p.productName,
      imageUrl: p.imageUrl,
      orders: p.orders,
      delivered: p.delivered,
      returned: p.returned,
      deliveryRate: safeRate(p.delivered, p.delivered + p.returned),
      revenue: p.revenue,
      variants: Array.from(p.variants.values())
        .map((v) => ({
          variantId: v.variantId,
          label: v.label,
          orders: v.orders,
          delivered: v.delivered,
          deliveryRate: safeRate(v.delivered, v.orders),
        }))
        .sort((a, b) => b.delivered - a.delivered),
    }))
    .sort((a, b) => b.delivered - a.delivered)
    .slice(0, 10);

  // ── Daily trend (delivered vs returned) ────────────────────────────────
  const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 30 * 86_400_000);
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
  const trendBucket = new Map<string, { delivered: number; returned: number }>();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    trendBucket.set(dayKey(d), { delivered: 0, returned: 0 });
  }
  for (const row of trendRows) {
    const when = row.shippingStatus === 'delivered' ? row.deliveredAt : row.updatedAt;
    if (!when) continue;
    const key = dayKey(when);
    const b = trendBucket.get(key);
    if (!b) continue;
    if (row.shippingStatus === 'delivered') b.delivered += 1;
    else b.returned += 1;
  }
  const trend = Array.from(trendBucket.entries())
    .map(([date, v]) => ({ date, delivered: v.delivered, returned: v.returned }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const kpis: DeliveryKPIs = {
    ...current,
    percentageChanges: {
      shipped: pctChange(current.shipped, previous.shipped),
      delivered: pctChange(current.delivered, previous.delivered),
      returned: pctChange(current.returned, previous.returned),
      deliveryRate: pctChange(current.deliveryRate, previous.deliveryRate),
      returnRate: pctChange(current.returnRate, previous.returnRate),
      avgDeliveryDays: pctChange(current.avgDeliveryDays, previous.avgDeliveryDays),
      revenue: pctChange(current.revenue, previous.revenue),
    },
  };

  return { kpis, pipeline, cities, agents, products, trend };
}

// ─── Confirmation Tab ────────────────────────────────────────────────────────

export interface ConfirmationKPIs {
  totalOrders: number;
  confirmed: number;
  cancelled: number;
  unreachable: number;
  pending: number;
  merged: number;             // orders absorbed into another via mergedIntoId
  confirmationRate: number;   // confirmed / totalOrders (canonical, matches Dashboard)
  cancellationRate: number;   // cancelled / totalOrders
  mergedRate: number;         // merged / (totalOrders + merged)
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

const CONFIRMATION_ORDER: Array<
  | 'pending'
  | 'confirmed'
  | 'cancelled'
  | 'unreachable'
  | 'callback'
  | 'fake'
  | 'out_of_stock'
  | 'reported'
> = [
  'pending',
  'confirmed',
  'callback',
  'cancelled',
  'unreachable',
  'out_of_stock',
  'fake',
  'reported',
];

async function computeConfirmationCore(filters: OrderFilterParams) {
  // Per-metric date fields. Total = createdAt (orders that arrived);
  // Confirmed/Cancelled/Unreachable = the timestamp when the agent acted on
  // them (so "Confirmed today" means agent confirmed it today, regardless
  // of when the order originally arrived). Pending stays on createdAt —
  // it has no transition timestamp by definition.
  const whereTotal       = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const whereConfirmed   = buildOrderWhereClause(filters, { dateField: 'confirmedAt' });
  const whereCancelled   = buildOrderWhereClause(filters, { dateField: 'cancelledAt' });
  const whereUnreachable = buildOrderWhereClause(filters, { dateField: 'unreachableAt' });
  const wherePending     = whereTotal;
  // Merged orders are archived, so the default where excludes them — count
  // them with archive filter disabled, dated on createdAt of the duplicate.
  const mergedWhere = buildOrderWhereClause(
    { ...filters, isArchived: 'all' },
    { dateField: 'createdAt' },
  );

  const { from: activityFrom, to: activityTo } = activityRange(filters);
  const orderFilterForActivity = stripOrderCreatedAt(whereTotal);

  const [total, confirmed, cancelled, unreachable, pending, merged, confirmedSample] =
    await Promise.all([
      prisma.order.count({ where: whereTotal }),
      prisma.order.count({ where: { ...whereConfirmed, confirmationStatus: 'confirmed' } }),
      prisma.order.count({ where: { ...whereCancelled, confirmationStatus: 'cancelled' } }),
      prisma.order.count({ where: { ...whereUnreachable, confirmationStatus: 'unreachable' } }),
      prisma.order.count({
        where: { ...wherePending, confirmationStatus: { in: ['pending', 'callback'] } },
      }),
      prisma.order.count({ where: { ...mergedWhere, mergedIntoId: { not: null } } }),
      // First confirmation log per order in the activity window, used to
      // compute mean (logTime − orderCreatedAt). Deduped via earliest-per-
      // order so a re-confirmation doesn't bias the average.
      prisma.orderLog.findMany({
        where: {
          type: 'confirmation',
          createdAt: { gte: activityFrom, lte: activityTo },
          action: { contains: 'Confirmation → confirmed' },
          order: orderFilterForActivity,
        },
        select: { createdAt: true, orderId: true, order: { select: { createdAt: true } } },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
    ]);

  // Confirmation / cancellation rate use total orders as the denominator
  // — same canonical formula as kpiCalculator.ts on the Dashboard. The
  // previous "decided pool" denominator (confirmed + cancelled + unreachable)
  // silently excluded fake and callback orders, producing higher rates here
  // than on the dashboard for the same agent + filters. The two pages now
  // agree: of every order that came in, what fraction did we confirm?
  const confirmationRate = safeRate(confirmed, total);
  const cancellationRate = safeRate(cancelled, total);
  const mergedRate = safeRate(merged, total + merged);

  let avgConfirmationHours = 0;
  // First confirmation per order: orderBy createdAt asc means the first
  // log we see for each orderId is the earliest. Skip subsequent ones.
  const seenForAvg = new Set<string>();
  let avgN = 0;
  let avgMs = 0;
  for (const r of confirmedSample) {
    if (seenForAvg.has(r.orderId)) continue;
    seenForAvg.add(r.orderId);
    avgMs += r.createdAt.getTime() - r.order.createdAt.getTime();
    avgN += 1;
  }
  if (avgN > 0) {
    avgConfirmationHours = Math.round((avgMs / avgN / 3_600_000) * 10) / 10;
  }

  return {
    totalOrders: total,
    confirmed,
    cancelled,
    unreachable,
    pending,
    merged,
    confirmationRate,
    cancellationRate,
    mergedRate,
    avgConfirmationHours,
  };
}

export async function computeConfirmationTab(
  filters: OrderFilterParams,
): Promise<ConfirmationTabPayload> {
  const where = buildOrderWhereClause(filters);

  // The trend chart's date axis is governed by when the confirmation
  // actually happened (OrderLog.createdAt), not by when the order was
  // originally placed (Order.createdAt). Use the shared activityRange /
  // stripOrderCreatedAt helpers — same semantics as the activity-based KPIs
  // — so a "today" filter shows every confirmation logged today regardless
  // of when those orders were placed. Every other filter (agent / source /
  // city / product / status / archive) still applies via the relation.
  const { from: trendFrom, to: trendTo } = activityRange(filters);
  const orderFilterForTrend = stripOrderCreatedAt(where);

  const [current, previous, pipelineGroups, agentGroups, productRows, cityRows, trendLogs] =
    await Promise.all([
      computeConfirmationCore(filters),
      computeConfirmationCore(mirrorRange(filters)),
      prisma.order.groupBy({
        by: ['confirmationStatus'],
        where,
        _count: { _all: true },
      }),
      prisma.order.groupBy({
        by: ['agentId'],
        where: { ...where, agentId: { not: null } },
        _count: { _all: true },
      }),
      prisma.orderItem.findMany({
        where: { order: where },
        select: {
          variant: {
            select: {
              id: true,
              color: true,
              size: true,
              product: { select: { id: true, name: true, imageUrl: true } },
            },
          },
          order: { select: { confirmationStatus: true } },
        },
      }),
      prisma.order.findMany({
        where,
        select: { confirmationStatus: true, customer: { select: { city: true } } },
      }),
      // Pull every confirmation transition in the trend window. Bucketing
      // by log.createdAt — the real time of the status change — replaces
      // the old Order.updatedAt bucketing which was wrong: any later edit
      // (Coliix label sent, address fixed, unreachable counter bumped)
      // would shove the order into "today" and leave previous days flat.
      // We also pull orderId so the bars can dedupe to DISTINCT orders per
      // day (a re-confirmation contributes 0, not 1, to that day's bar) —
      // same semantic as the KPI cards.
      prisma.orderLog.findMany({
        where: {
          type: 'confirmation',
          createdAt: { gte: trendFrom, lte: trendTo },
          OR: [
            { action: { contains: 'Confirmation → confirmed' } },
            { action: { contains: 'Confirmation → cancelled' } },
          ],
          order: orderFilterForTrend,
        },
        select: { action: true, createdAt: true, orderId: true },
      }),
    ]);

  // ── Pipeline ────────────────────────────────────────────────────────────
  const countsByStatus = new Map<string, number>();
  for (const g of pipelineGroups) countsByStatus.set(g.confirmationStatus, g._count._all);
  const pipeline = CONFIRMATION_ORDER.map((s) => ({ status: s, count: countsByStatus.get(s) ?? 0 }));

  // ── Per-agent confirmation ─────────────────────────────────────────────
  const agentIds = agentGroups.map((g) => g.agentId!).filter(Boolean);
  const [agentUsers, agentConfirmed, agentCancelled, agentUnreachable] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: agentIds } },
      select: { id: true, name: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: agentIds }, confirmationStatus: 'confirmed' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: agentIds }, confirmationStatus: 'cancelled' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['agentId'],
      where: { ...where, agentId: { in: agentIds }, confirmationStatus: 'unreachable' },
      _count: { _all: true },
    }),
  ]);
  const nameMap = new Map(agentUsers.map((u) => [u.id, u.name]));
  const cMap = new Map(agentConfirmed.map((r) => [r.agentId, r._count._all]));
  const xMap = new Map(agentCancelled.map((r) => [r.agentId, r._count._all]));
  const uMap = new Map(agentUnreachable.map((r) => [r.agentId, r._count._all]));
  const agents = agentGroups
    .filter((g) => g.agentId)
    .map((g) => {
      const total = g._count._all;
      const confirmed = cMap.get(g.agentId!) ?? 0;
      return {
        agentId: g.agentId!,
        agentName: nameMap.get(g.agentId!) ?? 'Unknown',
        total,
        confirmed,
        cancelled: xMap.get(g.agentId!) ?? 0,
        unreachable: uMap.get(g.agentId!) ?? 0,
        confirmationRate: safeRate(confirmed, total),
      };
    })
    .sort((a, b) => b.confirmed - a.confirmed)
    .slice(0, 10);

  // ── Per-product ────────────────────────────────────────────────────────
  interface VarAgg {
    variantId: string;
    label: string;
    orders: number;
    confirmed: number;
  }
  interface ProdAgg {
    productId: string;
    productName: string;
    imageUrl: string | null;
    orders: number;
    confirmed: number;
    cancelled: number;
    variants: Map<string, VarAgg>;
  }
  const byProduct = new Map<string, ProdAgg>();
  for (const row of productRows) {
    const p = row.variant.product;
    const entry =
      byProduct.get(p.id) ??
      {
        productId: p.id,
        productName: p.name,
        imageUrl: p.imageUrl,
        orders: 0,
        confirmed: 0,
        cancelled: 0,
        variants: new Map<string, VarAgg>(),
      };
    entry.orders += 1;
    if (row.order.confirmationStatus === 'confirmed') entry.confirmed += 1;
    else if (row.order.confirmationStatus === 'cancelled') entry.cancelled += 1;
    const label = [row.variant.color, row.variant.size].filter(Boolean).join(' / ') || '—';
    const v =
      entry.variants.get(row.variant.id) ??
      { variantId: row.variant.id, label, orders: 0, confirmed: 0 };
    v.orders += 1;
    if (row.order.confirmationStatus === 'confirmed') v.confirmed += 1;
    entry.variants.set(row.variant.id, v);
    byProduct.set(p.id, entry);
  }
  const products = Array.from(byProduct.values())
    .map((p) => ({
      productId: p.productId,
      productName: p.productName,
      imageUrl: p.imageUrl,
      orders: p.orders,
      confirmed: p.confirmed,
      cancelled: p.cancelled,
      confirmationRate: safeRate(p.confirmed, p.orders),
      variants: Array.from(p.variants.values())
        .map((v) => ({
          variantId: v.variantId,
          label: v.label,
          orders: v.orders,
          confirmed: v.confirmed,
          confirmationRate: safeRate(v.confirmed, v.orders),
        }))
        .sort((a, b) => b.confirmed - a.confirmed),
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 10);

  // ── Per-city ───────────────────────────────────────────────────────────
  const byCity = new Map<string, { orders: number; confirmed: number; cancelled: number }>();
  for (const row of cityRows) {
    const city = row.customer.city;
    const entry = byCity.get(city) ?? { orders: 0, confirmed: 0, cancelled: 0 };
    entry.orders += 1;
    if (row.confirmationStatus === 'confirmed') entry.confirmed += 1;
    else if (row.confirmationStatus === 'cancelled') entry.cancelled += 1;
    byCity.set(city, entry);
  }
  const cities = Array.from(byCity.entries())
    .map(([city, v]) => ({
      city,
      orders: v.orders,
      confirmed: v.confirmed,
      cancelled: v.cancelled,
      confirmationRate: safeRate(v.confirmed, v.orders),
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 12);

  // ── Trend ──────────────────────────────────────────────────────────────
  // Bucket each (orderId, status) into the day its transition was logged.
  // Counts DISTINCT orders per day — a re-confirmation of the same order
  // on the same day no longer adds a second tally to that day's bar.
  // Matches the KPI cards above so the bar for "today" equals the
  // Confirmed + Cancelled cards exactly.
  const trendBucket = new Map<
    string,
    { confirmed: Set<string>; cancelled: Set<string> }
  >();
  for (let d = new Date(trendFrom); d <= trendTo; d.setDate(d.getDate() + 1)) {
    trendBucket.set(dayKey(d), { confirmed: new Set(), cancelled: new Set() });
  }
  for (const log of trendLogs) {
    const key = dayKey(log.createdAt);
    const b = trendBucket.get(key);
    if (!b) continue;
    if (log.action.includes('Confirmation → confirmed')) b.confirmed.add(log.orderId);
    else if (log.action.includes('Confirmation → cancelled')) b.cancelled.add(log.orderId);
  }
  const trend = Array.from(trendBucket.entries())
    .map(([date, v]) => ({ date, confirmed: v.confirmed.size, cancelled: v.cancelled.size }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const kpis: ConfirmationKPIs = {
    ...current,
    percentageChanges: {
      totalOrders: pctChange(current.totalOrders, previous.totalOrders),
      confirmed: pctChange(current.confirmed, previous.confirmed),
      cancelled: pctChange(current.cancelled, previous.cancelled),
      merged: pctChange(current.merged, previous.merged),
      confirmationRate: pctChange(current.confirmationRate, previous.confirmationRate),
      mergedRate: pctChange(current.mergedRate, previous.mergedRate),
      avgConfirmationHours: pctChange(current.avgConfirmationHours, previous.avgConfirmationHours),
    },
  };

  return { kpis, pipeline, agents, products, cities, trend };
}

// ─── Profit Tab ──────────────────────────────────────────────────────────────

export interface ProfitKPIs {
  revenue: number;
  cogs: number;             // SUM(variant.costPrice * quantity) for delivered orders
  shippingFees: number;     // SUM(shippingPrice) for delivered orders
  expenses: number;         // SUM(expense.amount) in range
  profit: number;           // revenue − cogs − shippingFees − expenses
  margin: number;           // profit / revenue %
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

async function computeProfitCore(filters: OrderFilterParams) {
  const where = buildOrderWhereClause(filters);

  const [orders, expensesAgg] = await Promise.all([
    prisma.order.findMany({
      where: { ...where, shippingStatus: 'delivered' },
      select: {
        total: true,
        shippingPrice: true,
        items: { select: { quantity: true, variant: { select: { costPrice: true } } } },
      },
    }),
    prisma.expense.aggregate({
      where: expenseDateFilter(filters),
      _sum: { amount: true },
    }),
  ]);

  let revenue = 0;
  let cogs = 0;
  let shippingFees = 0;
  for (const o of orders) {
    revenue += o.total;
    shippingFees += o.shippingPrice;
    for (const it of o.items) {
      cogs += it.quantity * (it.variant.costPrice ?? 0);
    }
  }
  const expenses = expensesAgg._sum.amount ?? 0;
  const profit = revenue - cogs - shippingFees - expenses;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

  return { revenue, cogs, shippingFees, expenses, profit, margin };
}

function expenseDateFilter(filters: OrderFilterParams): Prisma.ExpenseWhereInput {
  if (!filters.dateFrom && !filters.dateTo) return {};
  const where: Prisma.ExpenseWhereInput = {};
  const dateFilter: Prisma.DateTimeFilter = {};
  if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    dateFilter.lte = to;
  }
  where.date = dateFilter;
  return where;
}

export async function computeProfitTab(filters: OrderFilterParams): Promise<ProfitTabPayload> {
  const where = buildOrderWhereClause(filters);

  const [current, previous, orderRows, expensesList] = await Promise.all([
    computeProfitCore(filters),
    computeProfitCore(mirrorRange(filters)),
    prisma.order.findMany({
      where: { ...where, shippingStatus: 'delivered' },
      select: {
        total: true,
        shippingPrice: true,
        // createdAt drives the trend bucket so the per-day bars line up
        // with the same date filter the rest of the tab uses (KPIs,
        // by-product, by-agent — all pre-filtered on Order.createdAt via
        // buildOrderWhereClause). The previous bucketing on
        // (deliveredAt ?? updatedAt) silently dropped any order whose
        // creation date was inside the range but whose delivery happened
        // outside, leaving phantom-empty days.
        createdAt: true,
        agentId: true,
        agent: { select: { id: true, name: true } },
        items: {
          select: {
            quantity: true,
            total: true,
            variant: {
              select: {
                costPrice: true,
                product: { select: { id: true, name: true, imageUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.expense.findMany({
      where: expenseDateFilter(filters),
      select: { amount: true, date: true },
    }),
  ]);

  // ── Daily trend of revenue / profit over range ─────────────────────────
  const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 30 * 86_400_000);
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();

  const dailyRevenue = new Map<string, number>();
  const dailyCogs = new Map<string, number>();
  const dailyShipping = new Map<string, number>();
  const dailyExpenses = new Map<string, number>();

  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const k = dayKey(d);
    dailyRevenue.set(k, 0);
    dailyCogs.set(k, 0);
    dailyShipping.set(k, 0);
    dailyExpenses.set(k, 0);
  }

  for (const o of orderRows) {
    const k = dayKey(o.createdAt);
    if (!dailyRevenue.has(k)) continue;
    dailyRevenue.set(k, (dailyRevenue.get(k) ?? 0) + o.total);
    dailyShipping.set(k, (dailyShipping.get(k) ?? 0) + o.shippingPrice);
    let cogsRow = 0;
    for (const it of o.items) cogsRow += it.quantity * (it.variant.costPrice ?? 0);
    dailyCogs.set(k, (dailyCogs.get(k) ?? 0) + cogsRow);
  }
  for (const e of expensesList) {
    const k = dayKey(e.date);
    if (!dailyExpenses.has(k)) continue;
    dailyExpenses.set(k, (dailyExpenses.get(k) ?? 0) + e.amount);
  }

  const trend = Array.from(dailyRevenue.keys())
    .sort()
    .map((date) => {
      const rev = dailyRevenue.get(date) ?? 0;
      const profit =
        rev -
        (dailyCogs.get(date) ?? 0) -
        (dailyShipping.get(date) ?? 0) -
        (dailyExpenses.get(date) ?? 0);
      return { date, revenue: rev, profit };
    });

  // ── Per-product profit ─────────────────────────────────────────────────
  interface ProdAgg {
    productId: string;
    productName: string;
    imageUrl: string | null;
    unitsSold: number;
    revenue: number;
    cogs: number;
  }
  const prodMap = new Map<string, ProdAgg>();
  for (const o of orderRows) {
    for (const it of o.items) {
      const p = it.variant.product;
      const entry =
        prodMap.get(p.id) ??
        { productId: p.id, productName: p.name, imageUrl: p.imageUrl, unitsSold: 0, revenue: 0, cogs: 0 };
      entry.unitsSold += it.quantity;
      entry.revenue += it.total;
      entry.cogs += it.quantity * (it.variant.costPrice ?? 0);
      prodMap.set(p.id, entry);
    }
  }
  const byProduct: ProfitByProduct[] = Array.from(prodMap.values())
    .map((p) => {
      const profit = p.revenue - p.cogs;
      const margin = p.revenue > 0 ? Math.round((profit / p.revenue) * 10000) / 100 : 0;
      return {
        productId: p.productId,
        productName: p.productName,
        imageUrl: p.imageUrl,
        unitsSold: p.unitsSold,
        revenue: p.revenue,
        cogs: p.cogs,
        profit,
        margin,
      };
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 15);

  // ── Per-agent profit (revenue − cogs − shipping for delivered orders) ──
  interface AgAgg {
    agentId: string;
    agentName: string;
    revenue: number;
    cogs: number;
    shippingFees: number;
  }
  const agentMap = new Map<string, AgAgg>();
  for (const o of orderRows) {
    if (!o.agent) continue;
    const entry =
      agentMap.get(o.agent.id) ??
      { agentId: o.agent.id, agentName: o.agent.name, revenue: 0, cogs: 0, shippingFees: 0 };
    entry.revenue += o.total;
    entry.shippingFees += o.shippingPrice;
    for (const it of o.items) {
      entry.cogs += it.quantity * (it.variant.costPrice ?? 0);
    }
    agentMap.set(o.agent.id, entry);
  }
  const byAgent: ProfitByAgent[] = Array.from(agentMap.values())
    .map((a) => {
      const profit = a.revenue - a.cogs - a.shippingFees;
      const margin = a.revenue > 0 ? Math.round((profit / a.revenue) * 10000) / 100 : 0;
      return { ...a, profit, margin };
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const kpis: ProfitKPIs = {
    ...current,
    percentageChanges: {
      revenue: pctChange(current.revenue, previous.revenue),
      cogs: pctChange(current.cogs, previous.cogs),
      shippingFees: pctChange(current.shippingFees, previous.shippingFees),
      expenses: pctChange(current.expenses, previous.expenses),
      profit: pctChange(current.profit, previous.profit),
      margin: pctChange(current.margin, previous.margin),
    },
  };

  return {
    kpis,
    trend,
    byProduct,
    byAgent,
    breakdown: {
      revenue: current.revenue,
      cogs: current.cogs,
      shippingFees: current.shippingFees,
      expenses: current.expenses,
      profit: current.profit,
    },
  };
}

// ─── All Orders Tab ──────────────────────────────────────────────────────────
//
// Demand-oriented view (vs the funnel-oriented Delivery / Confirmation /
// Profit tabs). Answers "where do orders come from?" and "what should the
// atelier produce next?". Velocity uses confirmed orders only — junk
// (cancelled / fake / duplicate) doesn't drive production decisions.

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
  // One numeric column per source; absent sources implicitly 0.
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
  ordered: number;            // units in window (confirmed orders)
  currentStock: number;
  velocityPerDay: number;
  daysOfCover: number | null; // null = velocity 0 (cannot compute)
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
  // Echo the window we used so the UI can label "Velocity over X days".
  windowDays: number;
}

function classifyRisk(daysOfCover: number | null, velocity: number): AllOrdersRiskBand {
  if (velocity === 0) return 'stale';
  if (daysOfCover === null) return 'stale';
  if (daysOfCover < 7) return 'imminent';
  if (daysOfCover < 14) return 'low';
  if (daysOfCover <= 30) return 'healthy';
  return 'overstock';
}

async function computeAllOrdersCore(
  filters: OrderFilterParams,
): Promise<{ totalOrders: number; avgItemsPerOrder: number }> {
  const where = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const [orderCount, itemAgg] = await Promise.all([
    prisma.order.count({ where }),
    prisma.orderItem.aggregate({
      where: { order: where },
      _sum: { quantity: true },
    }),
  ]);
  const totalUnits = itemAgg._sum.quantity ?? 0;
  const avgItemsPerOrder = orderCount > 0 ? Math.round((totalUnits / orderCount) * 10) / 10 : 0;
  return { totalOrders: orderCount, avgItemsPerOrder };
}

export interface ComputeAllOrdersOpts {
  // Default 14. Drives the suggested-reorder column (qty needed to cover
  // `targetDays` of demand at the observed velocity, minus current stock).
  targetDays?: number;
}

export async function computeAllOrdersTab(
  filters: OrderFilterParams,
  opts: ComputeAllOrdersOpts = {},
): Promise<AllOrdersTabPayload> {
  const targetDays = Math.max(1, Math.min(180, Math.round(opts.targetDays ?? 14)));

  // ── Window (for velocity denominator) ──────────────────────────────────
  // Honor the user's date filter; fall back to 30 days when none set so
  // velocity has a meaningful denominator on first load.
  const { from, to } = activityRange(filters);
  const windowMs = Math.max(86_400_000, to.getTime() - from.getTime());
  const windowDays = Math.max(1, Math.round(windowMs / 86_400_000));

  // Where clauses — same filters, two date fields. createdAt drives the
  // total/avg/source breakdown (when did the order arrive?). confirmed
  // orders drive velocity (junk shouldn't influence production decisions).
  const whereCreated = buildOrderWhereClause(filters, { dateField: 'createdAt' });
  const whereConfirmed = buildOrderWhereClause(filters, { dateField: 'confirmedAt' });
  const whereDelivered = buildOrderWhereClause(filters, { dateField: 'deliveredAt' });

  const [
    coreCurr,
    corePrev,
    sourceGroups,
    confirmedBySource,
    deliveredBySource,
    revenueBySource,
    trendOrders,
    confirmedItems,
    productMeta,
    variantStocks,
  ] = await Promise.all([
    computeAllOrdersCore(filters),
    computeAllOrdersCore(mirrorRange(filters)),
    // Source breakdown — counts per source within the window.
    prisma.order.groupBy({
      by: ['source'],
      where: whereCreated,
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['source'],
      where: { ...whereConfirmed, confirmationStatus: 'confirmed' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['source'],
      where: { ...whereDelivered, shippingStatus: 'delivered' },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['source'],
      where: { ...whereDelivered, shippingStatus: 'delivered' },
      _sum: { total: true },
    }),
    // Daily trend, segmented by source. We pull (createdAt, source) and
    // bucket client-side — cheap for normal volumes (< 50k orders/window).
    prisma.order.findMany({
      where: whereCreated,
      select: { createdAt: true, source: true },
      take: 50_000,
    }),
    // Confirmed orders' items — drives velocity AND the per-product /
    // variant aggregates. Joined to variant + product for labels.
    prisma.orderItem.findMany({
      where: { order: { ...whereConfirmed, confirmationStatus: 'confirmed' } },
      select: {
        quantity: true,
        orderId: true,
        variant: {
          select: {
            id: true,
            color: true,
            size: true,
            stock: true,
            product: { select: { id: true, name: true, imageUrl: true } },
          },
        },
      },
    }),
    // Product image fallback for products that haven't sold yet but the
    // breakdown still references them (e.g. via an orphan variant). Empty
    // result when not needed.
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, imageUrl: true },
    }),
    // Stock snapshot for every active variant — covers "stale" rows
    // (variants with zero orders in the window but stock on hand) so the
    // operator still sees inventory at risk of getting old.
    prisma.productVariant.findMany({
      select: {
        id: true,
        color: true,
        size: true,
        stock: true,
        product: { select: { id: true, name: true, imageUrl: true } },
      },
    }),
  ]);

  // ── Sources ────────────────────────────────────────────────────────────
  const orderTotal = coreCurr.totalOrders;
  const sourceCount = new Map(sourceGroups.map((g) => [g.source, g._count._all]));
  const confirmedBySourceMap = new Map(
    confirmedBySource.map((g) => [g.source, g._count._all]),
  );
  const deliveredBySourceMap = new Map(
    deliveredBySource.map((g) => [g.source, g._count._all]),
  );
  const revenueBySourceMap = new Map(
    revenueBySource.map((g) => [g.source, Number(g._sum.total ?? 0)]),
  );

  const sources: AllOrdersSourceRow[] = Array.from(sourceCount.entries())
    .map(([source, orders]) => {
      const confirmed = confirmedBySourceMap.get(source) ?? 0;
      const delivered = deliveredBySourceMap.get(source) ?? 0;
      const revenue = revenueBySourceMap.get(source) ?? 0;
      return {
        source,
        orders,
        confirmed,
        delivered,
        revenue,
        confirmationRate: safeRate(confirmed, orders),
      };
    })
    .sort((a, b) => b.orders - a.orders);

  // ── Daily trend by source ──────────────────────────────────────────────
  const trendBuckets = new Map<string, Record<string, number>>();
  // Pre-seed every day in the window so the chart has a continuous x-axis.
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    trendBuckets.set(dayKey(new Date(d)), {});
  }
  for (const o of trendOrders) {
    const k = dayKey(o.createdAt);
    const day = trendBuckets.get(k);
    if (!day) continue; // outside window (shouldn't happen given filter)
    day[o.source] = (day[o.source] ?? 0) + 1;
  }
  const trendBySource: AllOrdersTrendPoint[] = Array.from(trendBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bySource]) => ({ date, bySource }));

  // ── Variant aggregation ────────────────────────────────────────────────
  interface VariantAcc {
    variantId: string;
    productId: string;
    productName: string;
    imageUrl: string | null;
    color: string | null;
    size: string | null;
    currentStock: number;
    quantity: number;            // total units ordered
    orderIds: Set<string>;       // unique order count for the variant
  }
  const variantAcc = new Map<string, VariantAcc>();
  for (const it of confirmedItems) {
    const key = it.variant.id;
    const existing = variantAcc.get(key);
    if (existing) {
      existing.quantity += it.quantity;
      existing.orderIds.add(it.orderId);
    } else {
      variantAcc.set(key, {
        variantId: it.variant.id,
        productId: it.variant.product.id,
        productName: it.variant.product.name,
        imageUrl: it.variant.product.imageUrl,
        color: it.variant.color,
        size: it.variant.size,
        currentStock: it.variant.stock,
        quantity: it.quantity,
        orderIds: new Set([it.orderId]),
      });
    }
  }

  // Stale variants: in stock but no orders in the window. Operators want
  // to see these too — they're the ones eating storage without moving.
  for (const v of variantStocks) {
    if (variantAcc.has(v.id)) continue;
    if (v.stock <= 0) continue;
    variantAcc.set(v.id, {
      variantId: v.id,
      productId: v.product.id,
      productName: v.product.name,
      imageUrl: v.product.imageUrl,
      color: v.color,
      size: v.size,
      currentStock: v.stock,
      quantity: 0,
      orderIds: new Set(),
    });
  }

  // Build per-variant stats with velocity / coverage / suggested reorder.
  const variantStats: AllOrdersVariantStat[] = Array.from(variantAcc.values()).map((a) => {
    const velocityPerDay = a.quantity / windowDays;
    const daysOfCover = velocityPerDay > 0 ? a.currentStock / velocityPerDay : null;
    const suggestedReorder =
      velocityPerDay > 0
        ? Math.max(0, Math.ceil(targetDays * velocityPerDay) - a.currentStock)
        : 0;
    return {
      variantId: a.variantId,
      productId: a.productId,
      productName: a.productName,
      color: a.color,
      size: a.size,
      ordered: a.quantity,
      currentStock: a.currentStock,
      velocityPerDay: Math.round(velocityPerDay * 100) / 100,
      daysOfCover: daysOfCover === null ? null : Math.round(daysOfCover * 10) / 10,
      suggestedReorder,
      risk: classifyRisk(daysOfCover, velocityPerDay),
    };
  });

  // ── Top 15 variants (by units ordered) ────────────────────────────────
  const topVariants: AllOrdersTopVariant[] = Array.from(variantAcc.values())
    .filter((a) => a.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 15)
    .map((a) => ({
      variantId: a.variantId,
      productId: a.productId,
      productName: a.productName,
      color: a.color,
      size: a.size,
      quantity: a.quantity,
      orders: a.orderIds.size,
    }));

  // ── Per-product breakdown ─────────────────────────────────────────────
  // Operators want to be able to spotlight ANY product, including ones
  // with neither stock nor orders in the window — they may want to
  // inspect a product they're considering retiring or relaunching.
  // We seed the breakdown from the full active-product list and merge
  // in any orders/stock data we've already aggregated.
  interface ProductAcc {
    productId: string;
    productName: string;
    imageUrl: string | null;
    orders: Set<string>;
    variantIds: Set<string>;
    totalStock: number;
  }
  const productAcc = new Map<string, ProductAcc>();
  // 1. Seed from every active product so even no-order-no-stock items
  //    show in the searchable dropdown.
  for (const p of productMeta) {
    productAcc.set(p.id, {
      productId: p.id,
      productName: p.name,
      imageUrl: p.imageUrl,
      orders: new Set<string>(),
      variantIds: new Set<string>(),
      totalStock: 0,
    });
  }
  // 2. Layer in orders + stock from the variant aggregator.
  for (const a of variantAcc.values()) {
    const existing = productAcc.get(a.productId);
    if (existing) {
      a.orderIds.forEach((id) => existing.orders.add(id));
      existing.variantIds.add(a.variantId);
      existing.totalStock += a.currentStock;
    } else {
      productAcc.set(a.productId, {
        productId: a.productId,
        productName: a.productName,
        imageUrl: a.imageUrl,
        orders: new Set(a.orderIds),
        variantIds: new Set([a.variantId]),
        totalStock: a.currentStock,
      });
    }
  }
  const variantById = new Map(variantStats.map((v) => [v.variantId, v]));
  const productBreakdown: AllOrdersProductBreakdownRow[] = Array.from(productAcc.values())
    // Sort: products with orders first (desc), then stock-only (desc),
    // then alphabetical for the no-orders-no-stock long tail so the
    // dropdown is searchable but ordered usefully.
    .sort((a, b) => {
      if (a.orders.size > 0 && b.orders.size === 0) return -1;
      if (a.orders.size === 0 && b.orders.size > 0) return 1;
      if (a.orders.size !== b.orders.size) return b.orders.size - a.orders.size;
      if (a.totalStock !== b.totalStock) return b.totalStock - a.totalStock;
      return a.productName.localeCompare(b.productName);
    })
    .map((p) => {
      const variants = Array.from(p.variantIds)
        .map((vid) => variantById.get(vid)!)
        .filter(Boolean)
        .sort((a, b) => b.ordered - a.ordered);
      return {
        productId: p.productId,
        productName: p.productName,
        imageUrl: p.imageUrl,
        orders: p.orders.size,
        variants,
      };
    });

  // Suppress unused-var lint — productMeta exists for future fallback
  // labelling; harmless to keep.
  void productMeta;

  // ── Stock-at-risk (KPI) ────────────────────────────────────────────────
  const stockAtRisk = variantStats.filter(
    (v) => v.risk === 'imminent' || v.risk === 'low',
  ).length;

  // ── Top source (KPI) ──────────────────────────────────────────────────
  const topSourceRow = sources[0];
  const topSource = topSourceRow
    ? {
        source: topSourceRow.source,
        count: topSourceRow.orders,
        pct:
          orderTotal > 0
            ? Math.round((topSourceRow.orders / orderTotal) * 1000) / 10
            : 0,
      }
    : null;

  // ── Top variant (KPI) ─────────────────────────────────────────────────
  const topVariantRow = topVariants[0];
  const topVariant = topVariantRow
    ? {
        variantId: topVariantRow.variantId,
        productName: topVariantRow.productName,
        color: topVariantRow.color,
        size: topVariantRow.size,
        quantity: topVariantRow.quantity,
      }
    : null;

  return {
    kpis: {
      totalOrders: coreCurr.totalOrders,
      avgItemsPerOrder: coreCurr.avgItemsPerOrder,
      topSource,
      topVariant,
      stockAtRisk,
      percentageChanges: {
        totalOrders: pctChange(coreCurr.totalOrders, corePrev.totalOrders),
        avgItemsPerOrder: pctChange(coreCurr.avgItemsPerOrder, corePrev.avgItemsPerOrder),
      },
    },
    sources,
    trendBySource,
    topVariants,
    productBreakdown,
    stockSuggestions: {
      targetDays,
      // Sort by risk (imminent first), then by velocity (highest demand first).
      variants: variantStats
        .slice()
        .sort((a, b) => {
          const order: Record<AllOrdersRiskBand, number> = {
            imminent: 0,
            low: 1,
            healthy: 2,
            overstock: 3,
            stale: 4,
          };
          const r = order[a.risk] - order[b.risk];
          if (r !== 0) return r;
          return b.velocityPerDay - a.velocityPerDay;
        }),
    },
    windowDays,
  };
}
