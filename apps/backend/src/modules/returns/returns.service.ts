/**
 * Physical Return Verification. Lists orders the carrier bounced back, lets
 * the warehouse look them up by tracking ID (scan) or free text, and verifies
 * the physical package.
 *
 * Outcomes:
 *  - `good`    → shippingStatus='return_validated'. Variants are restocked so
 *                the SKUs can be re-shipped to another client.
 *  - `damaged` → shippingStatus='return_refused'. Not restocked.
 *  - `wrong`   → shippingStatus='return_refused'. Not restocked.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToRoom, emitToUser } from '../../shared/socket';
import { buildOrderWhereClause, type OrderFilterParams } from '../../utils/filterBuilder';

export type VerifyOutcome = 'good' | 'damaged' | 'wrong';

// These are the "bounced back" statuses — everything the warehouse still
// needs to physically verify.
const PENDING_STATUSES = ['returned', 'attempted', 'lost'] as const;

// Statuses that are ALREADY verified — shown on the "Verified" tab for history.
const VERIFIED_STATUSES = ['return_validated', 'return_refused'] as const;

export interface ListParams extends OrderFilterParams {
  page?: number;
  pageSize?: number;
  scope?: 'pending' | 'verified' | 'all';
  // search inherited from OrderFilterParams
}

export async function listReturns(params: ListParams) {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));
  const scope = params.scope ?? 'pending';

  const statuses =
    scope === 'pending'
      ? PENDING_STATUSES
      : scope === 'verified'
        ? VERIFIED_STATUSES
        : [...PENDING_STATUSES, ...VERIFIED_STATUSES];

  // Honour the dashboard-style filters (date range, agent, source, etc.) so
  // the Returns list shrinks to the same scope as the headline KPIs above
  // it. buildOrderWhereClause already defaults isArchived to false, which
  // matches what we want here.
  const baseWhere = buildOrderWhereClause(params);
  const where: Prisma.OrderWhereInput = {
    ...baseWhere,
    shippingStatus: { in: statuses as unknown as Prisma.EnumShippingStatusFilter['in'] },
  };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        reference: true,
        shippingStatus: true,
        total: true,
        coliixTrackingId: true,
        returnNote: true,
        returnVerifiedAt: true,
        returnVerifiedBy: { select: { id: true, name: true } },
        updatedAt: true,
        deliveredAt: true,
        customer: { select: { fullName: true, phone: true, phoneDisplay: true, city: true, address: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            variant: {
              select: {
                id: true,
                sku: true,
                color: true,
                size: true,
                stock: true,
                product: { select: { id: true, name: true, imageUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

/**
 * Page-level stats for the Returns section. Matches the dashboard's
 * `returnRate` formula (`returned / (delivered + returned)`) so the
 * warehouse view and the leadership dashboard always agree on the headline
 * number — it's the first thing an agent cross-checks.
 */
export async function getReturnStats(filters: OrderFilterParams = {}) {
  // Respect the dashboard's date-range / agent / source filters so this
  // page agrees with the rest of the app instead of always reporting
  // all-time totals — the previous behaviour broke trust whenever an
  // operator switched the global date range and the headline numbers
  // didn't move.
  const where = buildOrderWhereClause(filters);
  const [deliveredCount, pendingCount, verifiedGoodCount, verifiedRefusedCount] = await Promise.all([
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.count({
      where: {
        ...where,
        shippingStatus: { in: PENDING_STATUSES as unknown as Prisma.EnumShippingStatusFilter['in'] },
      },
    }),
    prisma.order.count({ where: { ...where, shippingStatus: 'return_validated' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'return_refused' } }),
  ]);

  const returnedTotal = pendingCount + verifiedGoodCount + verifiedRefusedCount;
  const verifiedTotal = verifiedGoodCount + verifiedRefusedCount;
  const rateDenominator = deliveredCount + returnedTotal;

  return {
    // Headline number that matches the dashboard card.
    returnRate: rateDenominator > 0 ? returnedTotal / rateDenominator : 0,
    returnedTotal,
    deliveredCount,
    pendingCount,
    verifiedTotal,
    // Share of returns actually verified — lets the warehouse gauge backlog.
    verifiedRate: returnedTotal > 0 ? verifiedTotal / returnedTotal : 0,
  };
}

/**
 * Scan lookup — resolves a single order by tracking ID or reference so the
 * scanner modal can open the verify drawer instantly.
 */
// Match the listReturns projection exactly — the VerifyModal reads the same
// fields whether the order came from the list or from a scan.
const RETURN_SCAN_SELECT = {
  id: true,
  reference: true,
  shippingStatus: true,
  total: true,
  coliixTrackingId: true,
  returnNote: true,
  returnVerifiedAt: true,
  returnVerifiedBy: { select: { id: true, name: true } },
  updatedAt: true,
  deliveredAt: true,
  customer: { select: { fullName: true, phone: true, phoneDisplay: true, city: true, address: true } },
  items: {
    select: {
      id: true,
      quantity: true,
      variant: {
        select: {
          id: true,
          sku: true,
          color: true,
          size: true,
          stock: true,
          product: { select: { id: true, name: true, imageUrl: true } },
        },
      },
    },
  },
} as const;

export async function findByScan(query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.order.findFirst({
    where: {
      isArchived: false,
      OR: [
        { coliixTrackingId: q },
        { reference: q },
        { coliixTrackingId: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: RETURN_SCAN_SELECT,
  });
}

/**
 * Phone→laptop scan pipeline. The agent scans a parcel barcode on their
 * phone; we resolve it here and emit either `return:scanned` (with the full
 * order payload) or `return:scan_failed` (with the raw code so the phone
 * can show a "not found" toast) to the agent's own user room. Only that
 * user's sockets receive the event — a second agent scanning at the same
 * time doesn't collide.
 */
export async function pushScanToUser(userId: string, code: string) {
  const order = await findByScan(code);
  if (!order) {
    emitToUser(userId, 'return:scan_failed', { code });
    return { found: false as const, code };
  }
  emitToUser(userId, 'return:scanned', order);
  return { found: true as const, order };
}

export interface VerifyInput {
  outcome: VerifyOutcome;
  note?: string | null;
}

export async function verifyReturn(
  orderId: string,
  input: VerifyInput,
  actor: { id: string; name: string },
) {
  const newStatus = input.outcome === 'good' ? 'return_validated' : 'return_refused';

  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shippingStatus: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });
    if (!order) {
      throw Object.assign(new Error('Order not found'), {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }

    // Only restock on "good" — variants physically came back saleable.
    if (input.outcome === 'good') {
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }

    const result = await tx.order.update({
      where: { id: orderId },
      data: {
        shippingStatus: newStatus,
        returnNote: input.note?.trim() || null,
        returnVerifiedAt: new Date(),
        returnVerifiedById: actor.id,
      },
      select: {
        id: true,
        reference: true,
        shippingStatus: true,
        returnNote: true,
        returnVerifiedAt: true,
        returnVerifiedBy: { select: { id: true, name: true } },
      },
    });

    await tx.orderLog.create({
      data: {
        orderId,
        type: 'shipping',
        action:
          input.outcome === 'good'
            ? `Physical return validated & restocked by ${actor.name}`
            : input.outcome === 'damaged'
              ? `Physical return refused (damaged) by ${actor.name}`
              : `Physical return refused (wrong item) by ${actor.name}`,
        performedBy: actor.name,
        userId: actor.id,
        meta: { outcome: input.outcome, note: input.note ?? null },
      },
    });

    return result;
  });

  emitToRoom('orders:all', 'order:updated', { orderId });
  emitToRoom('dashboard', 'kpi:refresh', {});

  return updated;
}
