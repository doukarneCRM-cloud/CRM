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

const SHIPPING_ORDER: Array<
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
  | 'destroyed'
> = [
  'not_shipped',
  'label_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'attempted',
  'returned',
  'return_validated',
  'return_refused',
  'exchange',
  'lost',
  'destroyed',
];

async function computeDeliveryCore(filters: OrderFilterParams) {
  const where = buildOrderWhereClause(filters);

  const [shipped, delivered, returned, inTransit, revenueAgg, deliveredSample] = await Promise.all([
    prisma.order.count({ where: { ...where, labelSent: true } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.count({
      where: { ...where, shippingStatus: { in: ['returned', 'return_validated'] } },
    }),
    prisma.order.count({
      where: {
        ...where,
        shippingStatus: { in: ['picked_up', 'in_transit', 'out_for_delivery'] },
      },
    }),
    prisma.order.aggregate({
      where: { ...where, shippingStatus: 'delivered' },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: {
        ...where,
        shippingStatus: 'delivered',
        labelSentAt: { not: null },
        deliveredAt: { not: null },
      },
      select: { labelSentAt: true, deliveredAt: true },
      take: 5000,
    }),
  ]);

  const deliveryRate = safeRate(delivered, delivered + returned);
  const returnRate = safeRate(returned, delivered + returned);
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

  const [current, previous, pipelineGroups, cityRows, agentGroups, productRows, trendRows] =
    await Promise.all([
      computeDeliveryCore(filters),
      computeDeliveryCore(mirrorRange(filters)),
      prisma.order.groupBy({
        by: ['shippingStatus'],
        where,
        _count: { _all: true },
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
          shippingStatus: { in: ['delivered', 'returned', 'return_validated'] },
        },
        select: { shippingStatus: true, deliveredAt: true, updatedAt: true },
      }),
    ]);

  // ── Pipeline buckets in canonical order ────────────────────────────────
  const countsByStatus = new Map<string, number>();
  for (const g of pipelineGroups) countsByStatus.set(g.shippingStatus, g._count._all);
  const pipeline = SHIPPING_ORDER.map((s) => ({ status: s, count: countsByStatus.get(s) ?? 0 }));

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
    } else if (row.shippingStatus === 'returned' || row.shippingStatus === 'return_validated') {
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
        shippingStatus: { in: ['returned', 'return_validated'] },
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
        deliveryRate: safeRate(delivered, delivered + returned),
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
    } else if (
      row.order.shippingStatus === 'returned' ||
      row.order.shippingStatus === 'return_validated'
    ) {
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
  confirmationRate: number;   // confirmed / (pending+awaiting+confirmed+cancelled+unreachable+fake)
  cancellationRate: number;
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
  | 'awaiting'
  | 'confirmed'
  | 'cancelled'
  | 'unreachable'
  | 'callback'
  | 'fake'
  | 'out_of_stock'
  | 'reported'
> = [
  'pending',
  'awaiting',
  'confirmed',
  'callback',
  'cancelled',
  'unreachable',
  'out_of_stock',
  'fake',
  'reported',
];

async function computeConfirmationCore(filters: OrderFilterParams) {
  const where = buildOrderWhereClause(filters);
  // Merged orders are archived, so `where` (which excludes archived by default)
  // won't include them — count them with the archive filter disabled.
  const mergedWhere = buildOrderWhereClause({ ...filters, isArchived: 'all' });

  const [total, confirmed, cancelled, unreachable, pending, merged, confirmedSample] =
    await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, confirmationStatus: 'confirmed' } }),
      prisma.order.count({ where: { ...where, confirmationStatus: 'cancelled' } }),
      prisma.order.count({ where: { ...where, confirmationStatus: 'unreachable' } }),
      prisma.order.count({
        where: { ...where, confirmationStatus: { in: ['pending', 'awaiting', 'callback'] } },
      }),
      prisma.order.count({ where: { ...mergedWhere, mergedIntoId: { not: null } } }),
      prisma.orderLog.findMany({
        where: {
          type: 'confirmation',
          action: { contains: 'confirmed' },
          order: { ...where, confirmationStatus: 'confirmed' },
        },
        select: { createdAt: true, order: { select: { createdAt: true } } },
        take: 5000,
      }),
    ]);

  const decidedPool =
    confirmed + cancelled + unreachable + pending; // active + decided confirmations
  const confirmationRate = safeRate(confirmed, decidedPool);
  const cancellationRate = safeRate(cancelled, decidedPool);
  const mergedRate = safeRate(merged, total + merged);

  let avgConfirmationHours = 0;
  if (confirmedSample.length > 0) {
    const totalMs = confirmedSample.reduce(
      (s, r) => s + (r.createdAt.getTime() - r.order.createdAt.getTime()),
      0,
    );
    avgConfirmationHours = Math.round((totalMs / confirmedSample.length / 3_600_000) * 10) / 10;
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

  const [current, previous, pipelineGroups, agentGroups, productRows, cityRows, trendRows] =
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
      prisma.order.findMany({
        where: { ...where, confirmationStatus: { in: ['confirmed', 'cancelled'] } },
        select: { confirmationStatus: true, updatedAt: true, createdAt: true },
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
  const from = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 30 * 86_400_000);
  const to = filters.dateTo ? new Date(filters.dateTo) : new Date();
  const trendBucket = new Map<string, { confirmed: number; cancelled: number }>();
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    trendBucket.set(dayKey(d), { confirmed: 0, cancelled: 0 });
  }
  for (const row of trendRows) {
    const key = dayKey(row.updatedAt);
    const b = trendBucket.get(key);
    if (!b) continue;
    if (row.confirmationStatus === 'confirmed') b.confirmed += 1;
    else b.cancelled += 1;
  }
  const trend = Array.from(trendBucket.entries())
    .map(([date, v]) => ({ date, confirmed: v.confirmed, cancelled: v.cancelled }))
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
        deliveredAt: true,
        updatedAt: true,
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
    const when = o.deliveredAt ?? o.updatedAt;
    const k = dayKey(when);
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
