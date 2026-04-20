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
import { emitToRoom } from '../../shared/socket';

export type VerifyOutcome = 'good' | 'damaged' | 'wrong';

// These are the "bounced back" statuses — everything the warehouse still
// needs to physically verify.
const PENDING_STATUSES = ['returned', 'attempted', 'lost'] as const;

// Statuses that are ALREADY verified — shown on the "Verified" tab for history.
const VERIFIED_STATUSES = ['return_validated', 'return_refused'] as const;

export interface ListParams {
  page?: number;
  pageSize?: number;
  scope?: 'pending' | 'verified' | 'all';
  search?: string;
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

  const where: Prisma.OrderWhereInput = {
    shippingStatus: { in: statuses as unknown as Prisma.EnumShippingStatusFilter['in'] },
    isArchived: false,
  };

  if (params.search) {
    const s = params.search.trim();
    where.OR = [
      { reference: { contains: s, mode: 'insensitive' } },
      { coliixTrackingId: { contains: s, mode: 'insensitive' } },
      { customer: { fullName: { contains: s, mode: 'insensitive' } } },
      { customer: { phone: { contains: s, mode: 'insensitive' } } },
      { customer: { phoneDisplay: { contains: s, mode: 'insensitive' } } },
      { customer: { city: { contains: s, mode: 'insensitive' } } },
    ];
  }

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
                product: { select: { id: true, name: true } },
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
 * Scan lookup — resolves a single order by tracking ID or reference so the
 * scanner modal can open the verify drawer instantly.
 */
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
    select: {
      id: true,
      reference: true,
      shippingStatus: true,
      coliixTrackingId: true,
      returnVerifiedAt: true,
      customer: { select: { fullName: true, phone: true, phoneDisplay: true, city: true } },
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
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
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
