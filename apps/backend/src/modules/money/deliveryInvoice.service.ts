/**
 * Money → Delivery Invoice. Reconciles the payout Coliix owes us for every
 * delivered order, grouped by month.
 *
 * Business model: Coliix collects cash on delivery from the customer, keeps
 * their carrier fee (ShippingCity.price, by city), and remits the rest to us.
 *
 *   orderTotal     = what the customer pays  (order.total)
 *   carrierFee     = what Coliix keeps       (ShippingCity.price for the city)
 *   netPayout      = what we should receive  = orderTotal − carrierFee
 *
 * So per order we track BOTH:
 *   - carrierFee (informational — what Coliix takes)
 *   - netPayout  (what we should get paid; this is the real receivable)
 *
 * The `paidToCarrier` flag on Order — despite its name — is used here as
 * "payout reconciled": flipped to true once we've received the remittance
 * from Coliix. Until the Coliix invoice API is wired up, it's a manual flag.
 */

import { prisma } from '../../shared/prisma';

export interface DeliveryInvoiceOrder {
  id: string;
  reference: string;
  deliveredAt: string | null;
  trackingId: string | null;
  customer: { fullName: string; phone: string; city: string };
  orderTotal: number;
  shippingFee: number;   // Coliix fee (what they keep)
  netPayout: number;     // orderTotal − shippingFee (what we should receive)
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
  totalPayout: number;
  paidPayout: number;
  unpaidPayout: number;
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
}): Promise<{
  months: DeliveryInvoiceMonth[];
  totals: {
    orders: number;
    paid: number;
    unpaid: number;
    totalFees: number;
    paidFees: number;
    unpaidFees: number;
    totalPayout: number;
    paidPayout: number;
    unpaidPayout: number;
  };
}> {
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
        total: true,
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

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const byMonth = new Map<string, DeliveryInvoiceMonth>();
  let tOrders = 0;
  let tPaid = 0;
  let tUnpaid = 0;
  let tFees = 0;
  let tPaidFees = 0;
  let tUnpaidFees = 0;
  let tPayout = 0;
  let tPaidPayout = 0;
  let tUnpaidPayout = 0;

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
        totalPayout: 0,
        paidPayout: 0,
        unpaidPayout: 0,
        orders: [],
      } satisfies DeliveryInvoiceMonth);

    const fee = feeByCity.get(o.customer.city.trim().toLowerCase()) ?? 0;
    // `order.total` is Prisma Decimal — coerce via Number() to avoid NaN from
    // string ops later. Net payout is what Coliix remits to us.
    const orderTotal = Number(o.total);
    const netPayout = orderTotal - fee;

    bucket.orderCount += 1;
    bucket.totalFees += fee;
    bucket.totalPayout += netPayout;
    if (o.paidToCarrier) {
      bucket.paidCount += 1;
      bucket.paidFees += fee;
      bucket.paidPayout += netPayout;
    } else {
      bucket.unpaidCount += 1;
      bucket.unpaidFees += fee;
      bucket.unpaidPayout += netPayout;
    }
    bucket.orders.push({
      id: o.id,
      reference: o.reference,
      deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
      trackingId: o.coliixTrackingId,
      customer: o.customer,
      orderTotal: round2(orderTotal),
      shippingFee: fee,
      netPayout: round2(netPayout),
      paidToCarrier: o.paidToCarrier,
      paidToCarrierAt: o.paidToCarrierAt ? o.paidToCarrierAt.toISOString() : null,
    });

    byMonth.set(key, bucket);
    tOrders += 1;
    tFees += fee;
    tPayout += netPayout;
    if (o.paidToCarrier) {
      tPaid += 1;
      tPaidFees += fee;
      tPaidPayout += netPayout;
    } else {
      tUnpaid += 1;
      tUnpaidFees += fee;
      tUnpaidPayout += netPayout;
    }
  }

  // Round each month's aggregates in place so downstream fmt doesn't need to.
  for (const m of byMonth.values()) {
    m.totalFees = round2(m.totalFees);
    m.paidFees = round2(m.paidFees);
    m.unpaidFees = round2(m.unpaidFees);
    m.totalPayout = round2(m.totalPayout);
    m.paidPayout = round2(m.paidPayout);
    m.unpaidPayout = round2(m.unpaidPayout);
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
      totalFees: round2(tFees),
      paidFees: round2(tPaidFees),
      unpaidFees: round2(tUnpaidFees),
      totalPayout: round2(tPayout),
      paidPayout: round2(tPaidPayout),
      unpaidPayout: round2(tUnpaidPayout),
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
