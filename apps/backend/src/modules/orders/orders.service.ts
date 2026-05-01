import { Prisma } from '@prisma/client';
import { prisma, type OrderPayload } from '../../shared/prisma';
import {
  emitToRoom,
  emitOrderUpdated,
  emitOrderCreated,
  emitOrderArchived,
} from '../../shared/socket';
import {
  createNotification,
  createAdminNotification,
  fetchOrderProductMeta,
} from '../notifications/notifications.service';
import { buildOrderWhereClause } from '../../utils/filterBuilder';
import { parsePagination, paginatedResponse } from '../../utils/pagination';
import { normalizePhone } from '../../utils/phoneNormalize';
import { triggerOutOfStock } from '../../utils/stockEffects';
import { autoAssign } from '../../utils/autoAssign';
import { dispatchOrderStatusChange } from '../automation/dispatcher';
import type { JwtPayload } from '../../shared/jwt';
import { getActorName } from '../../shared/actorName';
import type {
  CreateOrderInput,
  UpdateOrderInput,
  UpdateStatusInput,
  AssignOrderInput,
  BulkActionInput,
  OrderQueryInput,
  MergeOrdersInput,
} from './orders.schema';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ORD-YY-XXXXX. The next value comes from an atomic UPDATE on the Counter
// row (one row per year), so concurrent creates never collide and archived
// orders never free up a reference number.
export async function generateReference(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const key = `order_ref_${year}`;
  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `ORD-${year}-${String(counter.value).padStart(5, '0')}`;
}

// Self-heal when the Counter row drifts below reality — happens after
// partial imports, manual INSERTs, or a Counter reset that left orders
// behind. We scan for the largest live ORD-YY-XXXXX this year and jump
// the counter past it so the next generateReference() starts from a
// free slot in one hop (instead of burning a retry per stale row).
export async function healReferenceCounter(): Promise<void> {
  const year = new Date().getFullYear().toString().slice(-2);
  const key = `order_ref_${year}`;
  const prefix = `ORD-${year}-`;
  // Zero-padded 5-digit suffix means lexicographic sort matches numeric
  // sort, so `orderBy reference desc` gives us the true max.
  const latest = await prisma.order.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  let maxSeq = 0;
  if (latest) {
    const m = latest.reference.match(/^ORD-\d{2}-(\d{5})$/);
    if (m) maxSeq = parseInt(m[1], 10);
  }
  await prisma.counter.upsert({
    where: { key },
    create: { key, value: maxSeq },
    update: { value: maxSeq },
  });
}

// Narrow type guard — Prisma's P2002 with `target` pointing at the
// Order.reference column is the only case we want to recover from.
export function isReferenceCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = (err.meta as { target?: unknown } | null | undefined)?.target;
  if (Array.isArray(target)) return target.includes('reference');
  if (typeof target === 'string') return target.includes('reference');
  return false;
}

/**
 * Verifies an agent exists, is active, and holds the confirmation:view
 * permission required to receive orders. Returns the agent id + name on
 * success; throws a 400 INVALID_AGENT otherwise.
 */
async function assertCanReceiveAssignment(agentId: string): Promise<{ id: string; name: string }> {
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!agent || !agent.isActive) {
    throw { statusCode: 400, code: 'INVALID_AGENT', message: 'Agent not found or inactive' };
  }
  const canConfirm = agent.role.permissions.some((rp) => rp.permission.key === 'confirmation:view');
  if (!canConfirm) {
    throw { statusCode: 400, code: 'INVALID_AGENT', message: 'Agent does not have confirmation access' };
  }
  return { id: agent.id, name: agent.name };
}

function calculateTotals(
  items: { quantity: number; unitPrice: number }[],
  discountType?: string | null,
  discountAmount?: number | null,
  shippingPrice = 0,
): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  let discount = 0;
  if (discountType && discountAmount != null && discountAmount > 0) {
    discount = discountType === 'fixed' ? discountAmount : (subtotal * discountAmount) / 100;
  }
  const total = Math.max(0, subtotal - discount) + shippingPrice;
  return { subtotal, total };
}

/** Find or create a customer from order creation payload. Returns customerId.
 *
 * Uses upsert so we never crash on a P2002 when the phone is already taken —
 * the prior two-step find-then-create was racy (two concurrent order creates
 * for the same new customer) and also brittle against any phone-format drift
 * between the stored row and the freshly-normalized value. upsert hands both
 * cases to Postgres atomically. */
async function resolveCustomer(input: {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  customerAddress?: string;
}): Promise<string> {
  if (input.customerId) return input.customerId;

  const { normalized, display } = normalizePhone(input.customerPhone!);

  const customer = await prisma.customer.upsert({
    where: { phone: normalized },
    update: {
      // Only overwrite fields the caller actually sent — keep whatever is
      // on file otherwise so a thin "new order" form doesn't wipe prior data.
      ...(input.customerName ? { fullName: input.customerName } : {}),
      ...(input.customerCity ? { city: input.customerCity } : {}),
      ...(input.customerAddress ? { address: input.customerAddress } : {}),
    },
    create: {
      fullName: input.customerName!,
      phone: normalized,
      phoneDisplay: display,
      city: input.customerCity!,
      address: input.customerAddress,
    },
    select: { id: true },
  });
  return customer.id;
}

/** Full include shape used for single-order responses */
const ORDER_FULL_INCLUDE = {
  customer: {
    select: {
      id: true,
      fullName: true,
      phoneDisplay: true,
      city: true,
      address: true,
      tag: true,
      _count: { select: { orders: true } },
    },
  },
  agent: {
    select: { id: true, name: true, email: true, role: { select: { name: true, label: true } } },
  },
  store: { select: { id: true, name: true } },
  items: {
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              imageUrl: true,
              isPlaceholder: true,
              deletedAt: true,
              youcanId: true,
              storeId: true,
            },
          },
        },
      },
    },
  },
  logs: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      type: true,
      action: true,
      performedBy: true,
      meta: true,
      createdAt: true,
    },
  },
  shipment: { select: { rawState: true, state: true, trackingCode: true } },
} as const;

// Derived "stock short" flag. True when any item on the order references a
// variant whose current stock is below the quantity the agent needs. It is
// a pure read-side computation — nothing mutates. The frontend gates the
// visible badge to pending orders itself, so we emit the raw fact for any
// status and let the UI decide; that also keeps the shape consistent for
// confirmed/shipped views (where the value is effectively moot).
function withStockWarning<
  T extends { items: { quantity: number; variant: { stock: number } }[] },
>(order: T): T & { hasStockWarning: boolean } {
  return {
    ...order,
    hasStockWarning: order.items.some((it) => it.variant.stock < it.quantity),
  };
}

// ─── Service: List ────────────────────────────────────────────────────────────

export async function getOrders(query: OrderQueryInput) {
  const { page, pageSize, skip, take } = parsePagination(query as Record<string, unknown>);
  const where = buildOrderWhereClause(query);

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: {
          select: {
            id: true,
            fullName: true,
            phoneDisplay: true,
            city: true,
            address: true,
            tag: true,
            _count: { select: { orders: true } },
          },
        },
        agent: { select: { id: true, name: true } },
        // Surface the carrier's literal wording on every row. Multiple
        // Coliix wordings can map to the same enum bucket (e.g. several
        // wordings → 'pushed'); the table renders rawState alongside
        // the enum so the operator sees exactly what Coliix said.
        shipment: { select: { rawState: true, state: true, trackingCode: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            total: true,
            variant: {
              select: {
                id: true,
                color: true,
                size: true,
                stock: true,
                product: {
                  select: {
                    id: true,
                    name: true,
                    imageUrl: true,
                    isPlaceholder: true,
                    deletedAt: true,
                    youcanId: true,
                    storeId: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);

  return paginatedResponse(data.map(withStockWarning), total, page, pageSize);
}

// ─── Service: Single ──────────────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_FULL_INCLUDE });
  if (!order) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };
  return withStockWarning(order);
}

export async function getOrderLogs(orderId: string, includeSystem: boolean) {
  const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  return prisma.orderLog.findMany({
    where: {
      orderId,
      ...(includeSystem ? {} : { type: { in: ['confirmation', 'shipping'] } }),
    },
    orderBy: { createdAt: 'desc' },
  });
}

// Surfaces any *other* unshipped, unarchived pending orders the same customer
// has placed in the last 3 days. Triggered right before the confirm popup so
// an agent can roll duplicates into the one they're about to confirm.
export async function getPendingSiblings(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, customerId: true, shippingStatus: true },
  });
  if (!order) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const siblings = await prisma.order.findMany({
    where: {
      id: { not: orderId },
      customerId: order.customerId,
      isArchived: false,
      mergedIntoId: null,
      confirmationStatus: 'pending',
      shippingStatus: 'not_shipped',
      createdAt: { gte: threeDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      reference: true,
      agentId: true,
      total: true,
      createdAt: true,
      agent: { select: { id: true, name: true, email: true } },
      items: {
        select: {
          quantity: true,
          unitPrice: true,
          variant: {
            select: {
              color: true,
              size: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return { data: siblings };
}

// ─── Service: Create ──────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput, actor: JwtPayload) {
  const customerId = await resolveCustomer(input);
  const { subtotal, total } = calculateTotals(
    input.items,
    input.discountType,
    input.discountAmount,
    input.shippingPrice,
  );

  const actorName = await getActorName(actor);

  // When an agent creates an order manually (no explicit `agentId` in the
  // payload), assign it to themselves so it shows up under their queue
  // instead of being thrown into the round-robin pool. Admin / supervisor
  // creates without `agentId` keep the existing auto-assign behavior so
  // they can still create unassigned orders that get routed by the engine.
  //
  // Only admin/supervisor may target a different agent via `input.agentId`
  // — without this gate, a regular agent could POST `{ agentId: someoneElseId }`
  // and bypass their self-assign (the frontend hides the picker but the API
  // is the trust boundary).
  const isAdminLike =
    actor.roleName === 'admin' || actor.roleName === 'supervisor';
  const effectiveAgentId: string | null | undefined = isAdminLike
    ? input.agentId ?? null
    : actor.sub;

  // Retry on reference collisions — the Counter can drift below reality
  // after imports / manual INSERTs / partial resets. First collision runs
  // healReferenceCounter() to jump past the true max in one hop; any
  // subsequent collisions are pure bad luck and just re-roll.
  const MAX_ATTEMPTS = 5;
  // Typed to match the full include shape so downstream `withStockWarning`
  // can read items/variant.stock without an any-cast.
  let order:
    | OrderPayload<{ include: typeof ORDER_FULL_INCLUDE }>
    | undefined;
  let healedOnce = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const reference = await generateReference();
    try {
      order = await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            reference,
            customerId,
            source: input.source,
            storeId: input.storeId,
            agentId: effectiveAgentId ?? undefined,
            assignedAt: effectiveAgentId ? new Date() : undefined,
            discountType: input.discountType,
            discountAmount: input.discountAmount,
            shippingPrice: input.shippingPrice ?? 0,
            subtotal,
            total,
            confirmationNote: input.confirmationNote,
            shippingInstruction: input.shippingInstruction,
            items: {
              create: input.items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: item.quantity * item.unitPrice,
              })),
            },
            logs: {
              create: [
                {
                  type: 'system' as const,
                  action: `Order created by ${actorName}`,
                  performedBy: actorName,
                  userId: actor.sub,
                },
                ...(effectiveAgentId
                  ? [
                      {
                        type: 'system' as const,
                        action:
                          effectiveAgentId === actor.sub
                            ? `Self-assigned on creation`
                            : `Assigned to agent on creation`,
                        performedBy: actorName,
                        userId: actor.sub,
                      },
                    ]
                  : []),
              ],
            },
          },
          include: ORDER_FULL_INCLUDE,
        });

        // Stock is NOT decremented here — a freshly-created order is just a
        // lead (confirmationStatus: pending). Stock only moves when an agent
        // confirms the order via updateOrderStatus() → 'confirmed'. That
        // mirrors the physical reality: pending orders can be cancelled,
        // merged, or dropped as unreachable, and none of that should have
        // touched inventory.

        return created;
      });
      break; // success
    } catch (err) {
      if (isReferenceCollision(err)) {
        if (!healedOnce) {
          await healReferenceCounter();
          healedOnce = true;
        }
        continue; // re-roll and try again
      }
      throw err;
    }
  }

  if (!order) {
    throw {
      statusCode: 500,
      code: 'REFERENCE_GEN_FAILED',
      message: 'Could not generate a unique order reference after retries',
    };
  }

  // No out-of-stock cascade at creation — stock hasn't moved yet. That fires
  // from updateOrderStatus when the order actually gets confirmed.

  emitOrderCreated(order.id, order.reference);

  // Auto-assign only when the order is still unassigned (admin created
  // without picking an agent). When an agent self-creates, effectiveAgentId
  // is already their own id, so we skip the rotation.
  if (!effectiveAgentId) {
    autoAssign(order.id).catch(() => {
      // Swallow — order exists unassigned, and the engine logs its own reasons.
    });
  }

  return withStockWarning(order);
}

// ─── Service: Update ──────────────────────────────────────────────────────────

// Shipping statuses at or past "picked_up" — items can no longer be edited
// because the parcel is physically out of the warehouse.
const SHIPPED_OUT_STATUSES = new Set([
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
]);

export async function updateOrder(id: string, input: UpdateOrderInput, actor: JwtPayload) {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      subtotal: true,
      discountType: true,
      discountAmount: true,
      shippingPrice: true,
      shippingStatus: true,
      confirmationStatus: true,
      labelSent: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
  if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  // Once the parcel has been handed off to Coliix the order is packed and
  // labeled — any edit would desync the CRM from the physical shipment.
  if (existing.labelSent) {
    throw {
      statusCode: 409,
      code: 'ORDER_LOCKED',
      message: 'Order has been sent to Coliix — it is packed and labeled, no further edits allowed.',
    };
  }

  if (input.items && SHIPPED_OUT_STATUSES.has(existing.shippingStatus)) {
    throw {
      statusCode: 409,
      code: 'ORDER_LOCKED',
      message: 'Order items can no longer be edited once the parcel has been picked up.',
    };
  }

  const actorName = await getActorName(actor);

  // Determine the new subtotal: from replacement items if provided, else existing
  const newItems = input.items;
  const subtotal = newItems
    ? newItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    : existing.subtotal;

  const discountType = input.discountType !== undefined ? input.discountType : existing.discountType;
  const discountAmount =
    input.discountAmount !== undefined ? input.discountAmount : existing.discountAmount;
  const shippingPrice =
    input.shippingPrice !== undefined ? input.shippingPrice : existing.shippingPrice;
  const { total } = calculateTotals(
    [{ quantity: 1, unitPrice: subtotal }],
    discountType,
    discountAmount,
    shippingPrice,
  );

  // Build stock-delta map: +oldQty restored, -newQty deducted (net per variant).
  // Only material when the order has already been confirmed — pending orders
  // don't hold stock reservations, so editing their items is free.
  const stockDelta = new Map<string, number>();
  const orderHoldsStock = existing.confirmationStatus === 'confirmed';
  if (newItems && orderHoldsStock) {
    for (const old of existing.items) {
      stockDelta.set(old.variantId, (stockDelta.get(old.variantId) ?? 0) + old.quantity);
    }
    for (const nxt of newItems) {
      stockDelta.set(nxt.variantId, (stockDelta.get(nxt.variantId) ?? 0) - nxt.quantity);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (newItems) {
      await tx.orderItem.deleteMany({ where: { orderId: id } });
      await tx.orderItem.createMany({
        data: newItems.map((it) => ({
          orderId: id,
          variantId: it.variantId,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.quantity * it.unitPrice,
        })),
      });
      // Apply stock delta atomically. For a decrement we gate on
      // `stock >= abs(delta)` so the DB refuses to go negative under
      // concurrent writes; for an increment there's nothing to guard.
      for (const [variantId, delta] of stockDelta) {
        if (delta === 0) continue;
        if (delta < 0) {
          const need = -delta;
          const res = await tx.productVariant.updateMany({
            where: { id: variantId, stock: { gte: need } },
            data: { stock: { decrement: need } },
          });
          if (res.count === 0) {
            throw {
              statusCode: 400,
              code: 'INSUFFICIENT_STOCK',
              message: 'Not enough stock for one of the selected variants',
            };
          }
        } else {
          await tx.productVariant.update({
            where: { id: variantId },
            data: { stock: { increment: delta } },
          });
        }
      }
    }

    const order = await tx.order.update({
      where: { id },
      data: {
        agentId: input.agentId,
        discountType: input.discountType,
        discountAmount: input.discountAmount,
        shippingPrice: input.shippingPrice,
        confirmationNote: input.confirmationNote,
        shippingInstruction: input.shippingInstruction,
        cancellationReason: input.cancellationReason,
        callbackAt: input.callbackAt ? new Date(input.callbackAt) : input.callbackAt,
        subtotal,
        total,
      },
      include: ORDER_FULL_INCLUDE,
    });

    await tx.orderLog.create({
      data: {
        orderId: id,
        type: 'system',
        action: newItems
          ? `Order items + fields updated by ${actorName}`
          : `Order fields updated by ${actorName}`,
        performedBy: actorName,
        userId: actor.sub,
      },
    });

    return order;
  });

  // Post-transaction: trigger out-of-stock cascade for any variant that hit 0.
  // stockDelta is empty for pending orders (no reservation held), so this
  // naturally skips them.
  if (newItems && orderHoldsStock) {
    const touched = Array.from(stockDelta.keys());
    await Promise.all(touched.map((variantId) => triggerOutOfStock(variantId)));
  }

  emitOrderUpdated(id, { agentId: updated.agent?.id ?? null });

  return withStockWarning(updated);
}

// ─── Service: Archive (soft-delete) ──────────────────────────────────────────

export async function archiveOrder(id: string, actor: JwtPayload) {
  const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  const actorName = await getActorName(actor);

  await prisma.$transaction([
    prisma.order.update({ where: { id }, data: { isArchived: true } }),
    prisma.orderLog.create({
      data: {
        orderId: id,
        type: 'system',
        action: `Archived by ${actorName}`,
        performedBy: actorName,
        userId: actor.sub,
      },
    }),
  ]);

  emitOrderArchived(id);
}

// ─── Service: Status Engine ───────────────────────────────────────────────────

export async function updateOrderStatus(id: string, input: UpdateStatusInput, actor: JwtPayload) {
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      reference: true,
      confirmationStatus: true,
      shippingStatus: true,
      labelSent: true,
      unreachableCount: true,
      customer: { select: { city: true, fullName: true } },
      agent: { select: { id: true, name: true } },
      items: { select: { variantId: true, quantity: true } },
    },
  });
  if (!order) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  // Coliix owns the shipping status once the parcel has been handed off —
  // webhook/poller ingest goes through ingestStatus, not this endpoint. Manual
  // overrides here would race with the provider's updates.
  if (order.labelSent) {
    throw {
      statusCode: 409,
      code: 'ORDER_LOCKED',
      message: 'Order has been sent to Coliix — status is now driven by the shipping provider.',
    };
  }

  // ── Business rule validations ────────────────────────────────────────────
  if (input.confirmationStatus === 'callback' && !input.callbackAt) {
    throw {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'callbackAt is required when setting status to callback',
    };
  }

  if (input.confirmationStatus === 'cancelled' && !input.cancellationReason) {
    throw {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'cancellationReason is required when cancelling an order',
    };
  }

  if (input.confirmationStatus === 'confirmed') {
    const shippingCity = await prisma.shippingCity.findFirst({
      where: {
        name: { equals: order.customer.city, mode: 'insensitive' },
        isActive: true,
      },
    });
    if (!shippingCity) {
      throw {
        statusCode: 422,
        code: 'CITY_NOT_CONFIGURED',
        message: `Customer city "${order.customer.city}" is not configured for shipping. Add it in Settings → Shipping Cities first.`,
      };
    }
  }

  const actorName = await getActorName(actor);

  const logType: 'confirmation' | 'shipping' = input.confirmationStatus ? 'confirmation' : 'shipping';

  const actionParts: string[] = [];
  if (input.confirmationStatus) actionParts.push(`Confirmation → ${input.confirmationStatus}`);
  if (input.shippingStatus) actionParts.push(`Shipping → ${input.shippingStatus}`);
  if (input.note) actionParts.push(`Note: ${input.note}`);

  const updateData: Record<string, unknown> = {};
  if (input.confirmationStatus) updateData.confirmationStatus = input.confirmationStatus;
  if (input.shippingStatus) updateData.shippingStatus = input.shippingStatus;
  if (input.callbackAt) updateData.callbackAt = new Date(input.callbackAt);
  if (input.cancellationReason) updateData.cancellationReason = input.cancellationReason;

  // Per-metric timestamps. We stamp on transition INTO the state so the
  // KPI cards can date-filter "confirmed today" / "cancelled today" /
  // "unreachable today" by the moment the agent actually acted.
  // Only set when the status is newly entered — re-confirming an already-
  // confirmed order doesn't bump confirmedAt.
  const now = new Date();
  if (
    input.confirmationStatus === 'confirmed' &&
    order.confirmationStatus !== 'confirmed'
  ) {
    updateData.confirmedAt = now;
  }
  if (
    input.confirmationStatus === 'cancelled' &&
    order.confirmationStatus !== 'cancelled'
  ) {
    updateData.cancelledAt = now;
  }
  if (
    input.confirmationStatus === 'unreachable' &&
    order.confirmationStatus !== 'unreachable'
  ) {
    updateData.unreachableAt = now;
  }

  // Count every "unreachable" submission as one failed contact attempt, even
  // when the order is already in that state — agents retry the same customer
  // several times and expect the counter to climb with each failed try.
  if (input.confirmationStatus === 'unreachable') {
    updateData.unreachableCount = { increment: 1 };
    // Auto-cancel after 9 failed contact attempts — the agent has exhausted
    // reasonable retries and keeping the order open wastes pipeline capacity.
    const nextCount = order.unreachableCount + 1;
    if (nextCount >= 9) {
      updateData.confirmationStatus = 'cancelled';
      updateData.cancellationReason = `Auto-cancelled after ${nextCount} unreachable attempts`;
      // Stamp cancelledAt for the auto-cancel branch too — same per-metric
      // semantics as the manual cancel above.
      if (order.confirmationStatus !== 'cancelled') updateData.cancelledAt = now;
      actionParts.push(`Auto-cancelled (${nextCount} unreachable attempts)`);
    }
  }

  // ── Commission on delivery ───────────────────────────────────────────────
  // Only fire once — when shipping transitions *to* delivered — and only when
  // an agent is attached. Commission = onConfirm + onDeliver rates for that
  // agent. The assignment page phrases this as "paid out once per order when
  // it delivers" (see AssignmentPage.tsx).
  const becomingDelivered =
    input.shippingStatus === 'delivered' &&
    order.shippingStatus !== 'delivered' &&
    !!order.agent?.id;

  if (becomingDelivered && order.agent?.id) {
    updateData.deliveredAt = new Date();
    const rules = await prisma.commissionRule.findMany({
      where: { agentId: order.agent.id },
      select: { type: true, value: true },
    });
    let amount = 0;
    for (const r of rules) {
      if (r.type === 'onConfirm' || r.type === 'onDeliver') amount += r.value;
    }
    if (amount > 0) updateData.commissionAmount = amount;
  }

  // Stock accounting is tied to the confirmed state, not order creation:
  //   reservingStock:  moving INTO confirmed           → gated decrement (or 422 if short)
  //   restoringStock:  moving OUT of confirmed to ANY  → increment back
  //                    other confirmation status
  // Moving out of confirmed into any other confirmation status releases
  // the reservation. Covers cancel, unreachable, callback, fake, duplicate,
  // wrong_number, no_stock, postponed — the stock was held on the agent's
  // "yes" and must be freed the moment that "yes" is withdrawn. Guarded by
  // the labelSent check earlier in this function so a shipped parcel never
  // falls through this path. Auto-cancel (9× unreachable) still trips it
  // because updateData rewrites confirmationStatus to 'cancelled' above.
  const wasConfirmed = order.confirmationStatus === 'confirmed';
  const willBeConfirmed = updateData.confirmationStatus === 'confirmed';
  const reservingStock = !wasConfirmed && willBeConfirmed;
  const leavingConfirmed =
    updateData.confirmationStatus !== undefined &&
    updateData.confirmationStatus !== 'confirmed';
  const restoringStock = wasConfirmed && leavingConfirmed;

  await prisma.$transaction(async (tx) => {
    // Re-check labelSent inside the transaction: a Coliix webhook could
    // have flipped it between our initial read and this write.
    const fresh = await tx.order.findUnique({
      where: { id },
      select: { labelSent: true },
    });
    if (fresh?.labelSent) {
      throw {
        statusCode: 409,
        code: 'ORDER_LOCKED',
        message: 'Order has been sent to Coliix — status is now driven by the shipping provider.',
      };
    }
    if (reservingStock) {
      // Gated decrement inside the transaction — if any variant is short,
      // the whole confirmation rolls back and the agent sees a 422 instead
      // of a half-applied state.
      for (const item of order.items) {
        const res = await tx.productVariant.updateMany({
          where: { id: item.variantId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (res.count === 0) {
          throw {
            statusCode: 422,
            code: 'INSUFFICIENT_STOCK',
            message:
              'One of the variants on this order is out of stock — cannot confirm. Try "No stock" or restock first.',
          };
        }
      }
    }
    await tx.order.update({ where: { id }, data: updateData });
    if (restoringStock) {
      for (const item of order.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stock: { increment: item.quantity } },
        });
      }
    }
    await tx.orderLog.create({
      data: {
        orderId: id,
        type: logType,
        action: actionParts.join(' | '),
        performedBy: actorName,
        userId: actor.sub,
        meta: input.note ? { note: input.note } : undefined,
      },
    });
    if (reservingStock) {
      await tx.orderLog.create({
        data: {
          orderId: id,
          type: 'system',
          action: `Stock reserved for ${order.items.length} item(s) — order confirmed`,
          performedBy: 'System',
          meta: {
            reserved: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          },
        },
      });
    }
    if (restoringStock) {
      await tx.orderLog.create({
        data: {
          orderId: id,
          type: 'system',
          action: `Stock restored for ${order.items.length} item(s) — order moved from confirmed → ${updateData.confirmationStatus}`,
          performedBy: 'System',
          meta: {
            restored: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          },
        },
      });
    }
  });

  // Post-transaction: if we just reserved stock, cascade the out-of-stock
  // auto-flag so any OTHER pending orders sharing a now-zero variant get
  // bumped to out_of_stock. (Restoration doesn't need this — stock just
  // went UP, nothing can hit zero from an increment.)
  if (reservingStock) {
    await Promise.all(
      order.items.map((item) => triggerOutOfStock(item.variantId)),
    );
  }

  const updatedOrder = await prisma.order.findUnique({ where: { id }, include: ORDER_FULL_INCLUDE });

  // Pick the most-specific KPI hint so dashboard cards can tick the right
  // counter without a refetch. Order matters — delivered is more specific
  // than confirmed (delivery implies confirmation already happened).
  const kpiHint =
    becomingDelivered
      ? ('delivered' as const)
      : input.confirmationStatus === 'confirmed' && order.confirmationStatus !== 'confirmed'
      ? ('confirmed' as const)
      : input.confirmationStatus === 'cancelled' && order.confirmationStatus !== 'cancelled'
      ? ('cancelled' as const)
      : input.shippingStatus === 'returned' && order.shippingStatus !== 'returned'
      ? ('returned' as const)
      : input.shippingStatus && input.shippingStatus !== order.shippingStatus
      ? ('shipped' as const)
      : undefined;

  emitOrderUpdated(id, { kpi: kpiHint, agentId: order.agent?.id ?? null });

  // Automation — enqueues a WhatsApp message if the matching template is enabled.
  // Fire-and-forget; dispatcher handles its own errors and idempotency.
  void dispatchOrderStatusChange(id, {
    prev: { confirmation: order.confirmationStatus, shipping: order.shippingStatus },
    next: {
      confirmation: (updateData.confirmationStatus as typeof order.confirmationStatus) ?? order.confirmationStatus,
      shipping: (updateData.shippingStatus as typeof order.shippingStatus) ?? order.shippingStatus,
    },
  });

  // Toast/sound trigger for admin when an order transitions to confirmed
  if (
    input.confirmationStatus === 'confirmed' &&
    order.confirmationStatus !== 'confirmed'
  ) {
    const confirmedProduct = await fetchOrderProductMeta(id);
    emitToRoom('admin', 'order:confirmed', {
      orderId: id,
      reference: order.reference,
      customerName: order.customer.fullName,
      agentName: order.agent?.name ?? actorName,
      product: confirmedProduct,
    });
    // Persist for the bell — fan out to every admin/supervisor so each has
    // their own read state.
    void createAdminNotification({
      kind: 'order_confirmed',
      title: `Order confirmed #${order.reference}`,
      body: `${order.customer.fullName} · by ${order.agent?.name ?? actorName}`,
      href: '/orders',
      orderId: id,
    });
  }

  // Cha-ching trigger for admin when an order transitions to delivered.
  // Same shape as `order:confirmed` so the frontend hook can mirror its
  // toast + sound logic without special-casing.
  if (becomingDelivered) {
    const deliveredProduct = await fetchOrderProductMeta(id);
    emitToRoom('admin', 'order:delivered', {
      orderId: id,
      reference: order.reference,
      customerName: order.customer.fullName,
      agentName: order.agent?.name ?? actorName,
      product: deliveredProduct,
    });
    void createAdminNotification({
      kind: 'order_delivered',
      title: `Order delivered #${order.reference}`,
      body: `${order.customer.fullName} · ${order.agent?.name ?? actorName}`,
      href: '/orders',
      orderId: id,
    });
  }

  return updatedOrder ? withStockWarning(updatedOrder) : updatedOrder;
}

// ─── Service: Assign ──────────────────────────────────────────────────────────

export async function assignOrder(id: string, input: AssignOrderInput, actor: JwtPayload) {
  const exists = await prisma.order.findUnique({
    where: { id },
    select: { id: true, agentId: true },
  });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };
  const previousAgentId = exists.agentId;

  const actorName = await getActorName(actor);

  if (input.agentId !== null) {
    const agent = await assertCanReceiveAssignment(input.agentId);

    const orderMeta = await prisma.order.findUnique({
      where: { id },
      select: { reference: true, customer: { select: { fullName: true } } },
    });

    await prisma.$transaction([
      prisma.order.update({
        where: { id },
        data: { agentId: input.agentId, assignedAt: new Date() },
      }),
      prisma.orderLog.create({
        data: {
          orderId: id,
          type: 'system',
          action: `Assigned to ${agent.name} by ${actorName}`,
          performedBy: actorName,
          userId: actor.sub,
        },
      }),
    ]);

    const assignedProduct = await fetchOrderProductMeta(id);
    emitToRoom(`agent:${input.agentId}`, 'order:assigned', {
      orderId: id,
      reference: orderMeta?.reference,
      customerName: orderMeta?.customer.fullName,
      assignedBy: actorName,
      product: assignedProduct,
    });
    void createNotification({
      userId: input.agentId,
      kind: 'order_assigned',
      title: `New order assigned #${orderMeta?.reference ?? ''}`.trim(),
      body: orderMeta?.customer.fullName
        ? `Customer: ${orderMeta.customer.fullName} · by ${actorName}`
        : `Assigned by ${actorName}`,
      href: '/call-center',
      orderId: id,
    });
  } else {
    await prisma.$transaction([
      prisma.order.update({ where: { id }, data: { agentId: null, assignedAt: null } }),
      prisma.orderLog.create({
        data: {
          orderId: id,
          type: 'system',
          action: `Unassigned by ${actorName}`,
          performedBy: actorName,
          userId: actor.sub,
        },
      }),
    ]);
  }

  // One emit reaches both old and new agent rooms so pipelines pick up /
  // drop the row — emitOrderUpdated handles the fan-out.
  emitOrderUpdated(id, {
    kpi: 'reassigned',
    agentId: input.agentId,
    previousAgentId,
  });
}

// ─── Service: Summary (for orders page KPI cards) ────────────────────────────

export async function getOrdersSummary(query: OrderQueryInput) {
  const where = buildOrderWhereClause(query);

  const [
    pendingTotal,
    pendingAssigned,
    confirmedTotal,
    outForDeliveryTotal,
    deliveredTotal,
    revenueAgg,
  ] = await Promise.all([
    prisma.order.count({ where: { ...where, confirmationStatus: 'pending' } }),
    prisma.order.count({ where: { ...where, confirmationStatus: 'pending', agentId: { not: null } } }),
    prisma.order.count({ where: { ...where, confirmationStatus: 'confirmed' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'out_for_delivery' } }),
    prisma.order.count({ where: { ...where, shippingStatus: 'delivered' } }),
    prisma.order.aggregate({ where: { ...where, shippingStatus: 'delivered' }, _sum: { total: true } }),
  ]);

  return {
    pending: {
      total: pendingTotal,
      assigned: pendingAssigned,
      unassigned: pendingTotal - pendingAssigned,
    },
    confirmed: { total: confirmedTotal },
    outForDelivery: { total: outForDeliveryTotal },
    delivered: {
      total: deliveredTotal,
      revenue: revenueAgg._sum.total ?? 0,
    },
  };
}

// ─── Service: Bulk Actions ────────────────────────────────────────────────────

export async function bulkAction(input: BulkActionInput, actor: JwtPayload) {
  const actorName = await getActorName(actor);

  let agentName: string | null = null;
  if (input.action === 'assign' && input.agentId) {
    const agent = await assertCanReceiveAssignment(input.agentId);
    agentName = agent.name;
  }

  // Chunked fan-out: at most BULK_CHUNK_SIZE concurrent per-order transactions
  // so a 100-order bulk never exhausts the Prisma connection pool.
  const BULK_CHUNK_SIZE = 10;
  const results: PromiseSettledResult<unknown>[] = [];

  const runOne = async (orderId: string) => {
    let updateData: Record<string, unknown>;
    let logAction: string;

    switch (input.action) {
      case 'assign':
        updateData = { agentId: input.agentId, assignedAt: new Date() };
        logAction = `Bulk assigned to ${agentName ?? input.agentId} by ${actorName}`;
        break;
      case 'unassign':
        updateData = { agentId: null, assignedAt: null };
        logAction = `Bulk unassigned by ${actorName}`;
        break;
      case 'archive':
        updateData = { isArchived: true };
        logAction = `Bulk archived by ${actorName}`;
        break;
      case 'unarchive':
        updateData = { isArchived: false };
        logAction = `Bulk unarchived by ${actorName}`;
        break;
      default:
        updateData = {};
        logAction = `Bulk action by ${actorName}`;
    }

    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: updateData }),
      prisma.orderLog.create({
        data: {
          orderId,
          type: 'system',
          action: logAction,
          performedBy: actorName,
          userId: actor.sub,
        },
      }),
    ]);

    // Per-row `order:assigned` emits used to fire here. They caused a refetch
    // storm — the receiving agent's KPI cards / pipeline subscribed to
    // `order:assigned` and did a full reload PER EVENT, so a 50-order bulk
    // assign triggered 50 simultaneous round-trips on the agent's machine.
    // The bulk_updated event below covers the same UI refresh in one shot.
  };

  for (let i = 0; i < input.orderIds.length; i += BULK_CHUNK_SIZE) {
    const chunk = input.orderIds.slice(i, i + BULK_CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(chunk.map(runOne));
    results.push(...chunkResults);
  }

  emitToRoom('orders:all', 'order:bulk_updated', {
    count: input.orderIds.length,
    action: input.action,
    ts: Date.now(),
  });

  // One targeted notification per bulk-assign so the receiving agent gets
  // a single "N orders assigned to you" toast + a single pipeline refetch,
  // instead of 50 of each. The orders:all bulk_updated above already
  // refreshes everyone's table; this is just for the personal toast +
  // KPI cards rebound in agent:<id> rooms.
  if (input.action === 'assign' && input.agentId && input.orderIds.length > 0) {
    emitToRoom(`agent:${input.agentId}`, 'order:bulk_assigned', {
      count: input.orderIds.length,
      assignedBy: actorName,
      ts: Date.now(),
    });
  }

  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  return { succeeded, failed, total: input.orderIds.length };
}

// ─── Service: Duplicate Detection ─────────────────────────────────────────────

export async function getDuplicatePendingOrders() {
  const grouped = await prisma.order.groupBy({
    by: ['customerId'],
    where: { confirmationStatus: 'pending', isArchived: false },
    _count: { _all: true },
    having: { customerId: { _count: { gt: 1 } } },
  });

  if (grouped.length === 0) return { groups: [] };

  const customerIds = grouped.map((g) => g.customerId);

  const orders = await prisma.order.findMany({
    where: {
      customerId: { in: customerIds },
      confirmationStatus: 'pending',
      isArchived: false,
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      reference: true,
      agentId: true,
      total: true,
      createdAt: true,
      customer: { select: { id: true, fullName: true, phoneDisplay: true, city: true } },
      agent: { select: { id: true, name: true } },
      items: {
        select: {
          quantity: true,
          variant: {
            select: {
              color: true,
              size: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  // Bucket by customerId
  const bucket = new Map<string, typeof orders>();
  for (const o of orders) {
    const arr = bucket.get(o.customer.id) ?? [];
    arr.push(o);
    bucket.set(o.customer.id, arr);
  }

  const groups = Array.from(bucket.entries()).map(([customerId, list]) => {
    const first = list[0];
    const agents = new Set(list.map((o) => o.agentId ?? '__unassigned__'));
    return {
      customerId,
      customer: first.customer,
      needsReassignment: agents.size > 1,
      orders: list,
    };
  });

  return { groups };
}

// Merge rules:
//  - All orders must belong to the same customer, be pending, and unarchived.
//  - Any agent-mismatch is auto-resolved: merged orders get reassigned to the
//    keeper's agent inside the same tx (so a call-center agent can merge a
//    sibling that's currently owned by someone else without needing a separate
//    unassign step).
//  - Stock is NOT adjusted: items were allocated at creation; merging just
//    consolidates that allocation into the keeper.
//  - Merged orders are soft-archived AND point at the keeper via mergedIntoId
//    so "% of orders merged" is a one-query stat.
export async function mergeOrders(input: MergeOrdersInput, actor: JwtPayload) {
  const allIds = [input.keepOrderId, ...input.mergeOrderIds];

  const orders = await prisma.order.findMany({
    where: { id: { in: allIds } },
    select: {
      id: true,
      reference: true,
      customerId: true,
      agentId: true,
      confirmationStatus: true,
      isArchived: true,
      discountType: true,
      discountAmount: true,
      shippingPrice: true,
      items: { select: { variantId: true, quantity: true, unitPrice: true } },
    },
  });

  if (orders.length !== allIds.length) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'One or more orders not found' };
  }

  for (const o of orders) {
    if (o.isArchived) {
      throw { statusCode: 400, code: 'ORDER_ARCHIVED', message: `Order ${o.reference} is archived` };
    }
    if (o.confirmationStatus !== 'pending') {
      throw {
        statusCode: 400,
        code: 'NOT_PENDING',
        message: `Order ${o.reference} is not pending — only pending orders can be merged`,
      };
    }
  }

  const customerIds = new Set(orders.map((o) => o.customerId));
  if (customerIds.size !== 1) {
    throw {
      statusCode: 400,
      code: 'CUSTOMER_MISMATCH',
      message: 'All orders must belong to the same customer',
    };
  }

  const keeper = orders.find((o) => o.id === input.keepOrderId);
  if (!keeper) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'Keeper order not found' };
  }

  // Combine items by variant — pick the keeper's unitPrice when duplicated
  const combined = new Map<string, { variantId: string; quantity: number; unitPrice: number }>();
  for (const it of keeper.items) {
    combined.set(it.variantId, { variantId: it.variantId, quantity: it.quantity, unitPrice: it.unitPrice });
  }
  for (const o of orders) {
    if (o.id === keeper.id) continue;
    for (const it of o.items) {
      const prev = combined.get(it.variantId);
      if (prev) {
        prev.quantity += it.quantity;
      } else {
        combined.set(it.variantId, { variantId: it.variantId, quantity: it.quantity, unitPrice: it.unitPrice });
      }
    }
  }

  const mergedItems = Array.from(combined.values());
  const subtotal = mergedItems.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const { total } = calculateTotals(
    [{ quantity: 1, unitPrice: subtotal }],
    keeper.discountType,
    keeper.discountAmount,
    keeper.shippingPrice,
  );

  const actorName = await getActorName(actor);

  const mergeRefs = orders.filter((o) => o.id !== keeper.id).map((o) => o.reference);

  await prisma.$transaction(async (tx) => {
    // Replace keeper's items with combined set
    await tx.orderItem.deleteMany({ where: { orderId: keeper.id } });
    await tx.orderItem.createMany({
      data: mergedItems.map((it) => ({
        orderId: keeper.id,
        variantId: it.variantId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.quantity * it.unitPrice,
      })),
    });

    await tx.order.update({
      where: { id: keeper.id },
      data: { subtotal, total },
    });

    // Archive merge orders; drop their items so stock isn't duplicated.
    // Reassign to keeper's agent so the merged row is attributable to whoever
    // ran the merge, and flag mergedIntoId so we can count merges cheaply.
    for (const o of orders) {
      if (o.id === keeper.id) continue;
      await tx.orderItem.deleteMany({ where: { orderId: o.id } });
      await tx.order.update({
        where: { id: o.id },
        data: {
          isArchived: true,
          mergedIntoId: keeper.id,
          agentId: keeper.agentId ?? null,
        },
      });
      await tx.orderLog.create({
        data: {
          orderId: o.id,
          type: 'system',
          action: `Merged into ${keeper.reference} by ${actorName}`,
          performedBy: actorName,
          userId: actor.sub,
          meta: { keeperOrderId: keeper.id, keeperReference: keeper.reference },
        },
      });
    }

    await tx.orderLog.create({
      data: {
        orderId: keeper.id,
        type: 'system',
        action: `Merged orders [${mergeRefs.join(', ')}] into this one by ${actorName}`,
        performedBy: actorName,
        userId: actor.sub,
        meta: { mergedOrderIds: input.mergeOrderIds, mergedReferences: mergeRefs },
      },
    });
  });

  emitOrderUpdated(keeper.id, { agentId: keeper.agentId ?? null });
  for (const id of input.mergeOrderIds) {
    emitOrderArchived(id);
  }

  const result = await prisma.order.findUnique({
    where: { id: keeper.id },
    include: ORDER_FULL_INCLUDE,
  });
  return result ? withStockWarning(result) : result;
}
