/**
 * Physical Return Verification.
 *
 * Returned parcels (shippingStatus = 'returned') sit on the warehouse desk
 * until someone opens them. Verification picks one of two outcomes via
 * the `returnOutcome` field on Order:
 *
 *   - `good`    → variants are restocked (saleable again)
 *   - `damaged` → not restocked (counted as loss)
 *
 * The shippingStatus stays 'returned' either way — the rate-level KPIs
 * don't care about the outcome, only operational reports do.
 */

import { Prisma, type ReturnOutcome } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToUser, emitOrderUpdated } from '../../shared/socket';
import { buildOrderWhereClause, type OrderFilterParams } from '../../utils/filterBuilder';

export type VerifyOutcome = ReturnOutcome; // 'good' | 'damaged'

export interface ListParams extends OrderFilterParams {
  page?: number;
  pageSize?: number;
  scope?: 'pending' | 'verified' | 'all';
}

// Projection shared by the list endpoint and the scan lookup so the verify
// drawer always reads the same fields.
const RETURN_ORDER_SELECT = {
  id: true,
  reference: true,
  shippingStatus: true,
  returnOutcome: true,
  total: true,
  returnNote: true,
  returnVerifiedAt: true,
  returnVerifiedBy: { select: { id: true, name: true } },
  updatedAt: true,
  deliveredAt: true,
  customer: {
    select: { fullName: true, phone: true, phoneDisplay: true, city: true, address: true },
  },
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

function whereForScope(scope: 'pending' | 'verified' | 'all'): Prisma.OrderWhereInput {
  if (scope === 'pending') return { shippingStatus: 'returned', returnOutcome: null };
  if (scope === 'verified') return { shippingStatus: 'returned', returnOutcome: { not: null } };
  return { shippingStatus: 'returned' };
}

export async function listReturns(params: ListParams) {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));
  const scope = params.scope ?? 'pending';

  // Honour the dashboard-style filters (date range, agent, source, etc.) so
  // the Returns list shrinks to the same scope as the headline KPIs.
  const baseWhere = buildOrderWhereClause(params);
  const where: Prisma.OrderWhereInput = { ...baseWhere, ...whereForScope(scope) };

  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: RETURN_ORDER_SELECT,
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
 * `returnRate` formula (`returned / (delivered + returned)`).
 */
export async function getReturnStats(filters: OrderFilterParams = {}) {
  const where = buildOrderWhereClause(filters);
  const [deliveredCount, pendingCount, verifiedGoodCount, verifiedDamagedCount] = await Promise.all([
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'returned', returnOutcome: null } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'returned', returnOutcome: 'good' } }),
    prisma.order.count({
      where: { ...where, shippingStatus: 'returned', returnOutcome: 'damaged' },
    }),
  ]);

  const returnedTotal = pendingCount + verifiedGoodCount + verifiedDamagedCount;
  const verifiedTotal = verifiedGoodCount + verifiedDamagedCount;
  const rateDenominator = deliveredCount + returnedTotal;

  return {
    returnRate: rateDenominator > 0 ? returnedTotal / rateDenominator : 0,
    returnedTotal,
    deliveredCount,
    pendingCount,
    verifiedTotal,
    verifiedGoodCount,
    verifiedDamagedCount,
    // Share of returns actually verified — backlog gauge for the warehouse.
    verifiedRate: returnedTotal > 0 ? verifiedTotal / returnedTotal : 0,
  };
}

/**
 * Scan lookup — resolves a single order by reference for the scanner modal.
 */
export async function findByScan(query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.order.findFirst({
    where: {
      isArchived: false,
      OR: [
        { reference: q },
        { reference: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: RETURN_ORDER_SELECT,
  });
}

/**
 * Phone→laptop scan pipeline. Emits to the actor's user room so concurrent
 * scans by other agents don't collide.
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
  const updated = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shippingStatus: true,
        returnOutcome: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });
    if (!order) {
      throw Object.assign(new Error('Order not found'), {
        statusCode: 404,
        code: 'NOT_FOUND',
      });
    }
    if (order.shippingStatus !== 'returned') {
      throw Object.assign(new Error('Order is not in Returned state'), {
        statusCode: 400,
        code: 'INVALID_STATE',
      });
    }
    if (order.returnOutcome) {
      throw Object.assign(new Error('Return already verified'), {
        statusCode: 409,
        code: 'ALREADY_VERIFIED',
      });
    }

    // Restock only on "good" — variants physically came back saleable.
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
        returnOutcome: input.outcome,
        returnNote: input.note?.trim() || null,
        returnVerifiedAt: new Date(),
        returnVerifiedById: actor.id,
      },
      select: {
        id: true,
        reference: true,
        shippingStatus: true,
        returnOutcome: true,
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
            ? `Return verified — good (restocked) by ${actor.name}`
            : `Return verified — damaged (loss) by ${actor.name}`,
        performedBy: actor.name,
        userId: actor.id,
        meta: { outcome: input.outcome, note: input.note ?? null },
      },
    });

    return result;
  });

  emitOrderUpdated(orderId, { kpi: 'returned' });

  return updated;
}
