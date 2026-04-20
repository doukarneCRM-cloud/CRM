/**
 * Money → Delivery Invoice. Reconciles what we owe the carrier for every
 * delivered order, grouped by month. Per-order fee is looked up from the
 * ShippingCity table by matching the customer's city name (case-insensitive).
 *
 * Until the Coliix invoice API is wired up, paid/unpaid is a manual flag on
 * each order. Supports bulk mark-paid per month.
 */

import { prisma } from '../../shared/prisma';

export interface DeliveryInvoiceOrder {
  id: string;
  reference: string;
  deliveredAt: string | null;
  trackingId: string | null;
  customer: { fullName: string; phone: string; city: string };
  shippingFee: number;
  paidToCarrier: boolean;
  paidToCarrierAt: string | null;
}

export interface DeliveryInvoiceMonth {
  period: string; // YYYY-MM (delivery month, "unknown" for never-delivered)
  label: string;
  orderCount: number;
  paidCount: number;
  unpaidCount: number;
  totalFees: number;
  paidFees: number;
  unpaidFees: number;
  orders: DeliveryInvoiceOrder[];
}

function monthKey(d: Date | null) {
  if (!d) return { key: 'unknown', label: 'Unknown date' };
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { key, label };
}

export async function listDeliveryInvoice(params: {
  dateFrom?: string;
  dateTo?: string;
  paidOnly?: 'paid' | 'unpaid' | 'all';
  search?: string;
}): Promise<{ months: DeliveryInvoiceMonth[]; totals: { orders: number; paid: number; unpaid: number; totalFees: number; paidFees: number; unpaidFees: number } }> {
  const where: Record<string, unknown> = {
    shippingStatus: 'delivered',
    isArchived: false,
  };

  if (params.dateFrom || params.dateTo) {
    const range: Record<string, Date> = {};
    if (params.dateFrom) range.gte = new Date(params.dateFrom);
    if (params.dateTo) {
      const t = new Date(params.dateTo);
      t.setHours(23, 59, 59, 999);
      range.lte = t;
    }
    where.deliveredAt = range;
  }

  if (params.paidOnly === 'paid') where.paidToCarrier = true;
  if (params.paidOnly === 'unpaid') where.paidToCarrier = false;

  if (params.search) {
    const s = params.search.trim();
    where.OR = [
      { reference: { contains: s, mode: 'insensitive' } },
      { coliixTrackingId: { contains: s, mode: 'insensitive' } },
      { customer: { fullName: { contains: s, mode: 'insensitive' } } },
      { customer: { city: { contains: s, mode: 'insensitive' } } },
    ];
  }

  const [orders, cities] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        reference: true,
        deliveredAt: true,
        coliixTrackingId: true,
        paidToCarrier: true,
        paidToCarrierAt: true,
        customer: { select: { fullName: true, phone: true, city: true } },
      },
      orderBy: { deliveredAt: 'desc' },
    }),
    prisma.shippingCity.findMany({ select: { name: true, price: true } }),
  ]);

  const feeByCity = new Map<string, number>();
  for (const c of cities) feeByCity.set(c.name.trim().toLowerCase(), c.price);

  const byMonth = new Map<string, DeliveryInvoiceMonth>();
  let tOrders = 0;
  let tPaid = 0;
  let tUnpaid = 0;
  let tFees = 0;
  let tPaidFees = 0;
  let tUnpaidFees = 0;

  for (const o of orders) {
    const { key, label } = monthKey(o.deliveredAt);
    const bucket =
      byMonth.get(key) ??
      ({
        period: key,
        label,
        orderCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        totalFees: 0,
        paidFees: 0,
        unpaidFees: 0,
        orders: [],
      } satisfies DeliveryInvoiceMonth);

    const fee = feeByCity.get(o.customer.city.trim().toLowerCase()) ?? 0;
    bucket.orderCount += 1;
    bucket.totalFees += fee;
    if (o.paidToCarrier) {
      bucket.paidCount += 1;
      bucket.paidFees += fee;
    } else {
      bucket.unpaidCount += 1;
      bucket.unpaidFees += fee;
    }
    bucket.orders.push({
      id: o.id,
      reference: o.reference,
      deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
      trackingId: o.coliixTrackingId,
      customer: o.customer,
      shippingFee: fee,
      paidToCarrier: o.paidToCarrier,
      paidToCarrierAt: o.paidToCarrierAt ? o.paidToCarrierAt.toISOString() : null,
    });

    byMonth.set(key, bucket);
    tOrders += 1;
    tFees += fee;
    if (o.paidToCarrier) {
      tPaid += 1;
      tPaidFees += fee;
    } else {
      tUnpaid += 1;
      tUnpaidFees += fee;
    }
  }

  const months = Array.from(byMonth.values()).sort((a, b) => {
    if (a.period === 'unknown') return 1;
    if (b.period === 'unknown') return -1;
    return b.period.localeCompare(a.period);
  });

  return {
    months,
    totals: {
      orders: tOrders,
      paid: tPaid,
      unpaid: tUnpaid,
      totalFees: Math.round(tFees * 100) / 100,
      paidFees: Math.round(tPaidFees * 100) / 100,
      unpaidFees: Math.round(tUnpaidFees * 100) / 100,
    },
  };
}

export async function setOrderCarrierPaid(
  orderIds: string[],
  paid: boolean,
  actorId?: string,
) {
  if (orderIds.length === 0) return { updated: 0 };

  const actorName = actorId
    ? (await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ?? 'admin'
    : 'admin';

  return prisma.$transaction(async (tx) => {
    const eligible = await tx.order.findMany({
      where: { id: { in: orderIds }, shippingStatus: 'delivered', paidToCarrier: !paid },
      select: { id: true },
    });
    const eligibleIds = eligible.map((o) => o.id);
    if (eligibleIds.length === 0) return { updated: 0 };

    const r = await tx.order.updateMany({
      where: { id: { in: eligibleIds } },
      data: {
        paidToCarrier: paid,
        paidToCarrierAt: paid ? new Date() : null,
      },
    });

    await tx.orderLog.createMany({
      data: eligibleIds.map((orderId) => ({
        orderId,
        type: 'shipping' as const,
        action: paid
          ? `Marked paid to carrier by ${actorName}`
          : `Carrier payment reversed by ${actorName}`,
        performedBy: actorName,
        userId: actorId ?? null,
      })),
    });

    return { updated: r.count };
  });
}
