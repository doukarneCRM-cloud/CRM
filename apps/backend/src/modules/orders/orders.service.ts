import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
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
async function generateReference(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const key = `order_ref_${year}`;
  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `ORD-${year}-${String(counter.value).padStart(5, '0')}`;
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

/** Find or create a customer from order creation payload. Returns customerId. */
async function resolveCustomer(input: {
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerCity?: string;
  customerAddress?: string;
}): Promise<string> {
  if (input.customerId) return input.customerId;

  const { normalized, display } = normalizePhone(input.customerPhone!);
  const existing = await prisma.customer.findUnique({ where: { phone: normalized } });
  if (existing) {
    // Update name/city in case they changed (upsert-like)
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        fullName: input.customerName ?? existing.fullName,
        city: input.customerCity ?? existing.city,
        address: input.customerAddress ?? existing.address,
      },
    });
    return existing.id;
  }

  const created = await prisma.customer.create({
    data: {
      fullName: input.customerName!,
      phone: normalized,
      phoneDisplay: display,
      city: input.customerCity!,
      address: input.customerAddress,
    },
  });
  return created.id;
}

/** Full include shape used for single-order responses */
const ORDER_FULL_INCLUDE = {
  customer: {
    select: { id: true, fullName: true, phoneDisplay: true, city: true, address: true, tag: true },
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
} as const;

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
        customer: { select: { id: true, fullName: true, phoneDisplay: true, city: true, address: true, tag: true } },
        agent: { select: { id: true, name: true } },
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

  return paginatedResponse(data, total, page, pageSize);
}

// ─── Service: Single ──────────────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: ORDER_FULL_INCLUDE });
  if (!order) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };
  return order;
}

export async function getOrderLogs(orderId: string) {
  const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Order not found' };

  return prisma.orderLog.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}

// ─── Service: Create ──────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput, actor: JwtPayload) {
  const customerId = await resolveCustomer(input);
  const reference = await generateReference();
  const { subtotal, total } = calculateTotals(
    input.items,
    input.discountType,
    input.discountAmount,
    input.shippingPrice,
  );

  const actorName = await getActorName(actor);

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        reference,
        customerId,
        source: input.source,
        storeId: input.storeId,
        agentId: input.agentId,
        assignedAt: input.agentId ? new Date() : undefined,
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
            ...(input.agentId
              ? [
                  {
                    type: 'system' as const,
                    action: `Assigned to agent on creation`,
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

    // Gated decrement — DB refuses to go negative under concurrent creates.
    for (const item of input.items) {
      const res = await tx.productVariant.updateMany({
        where: { id: item.variantId, stock: { gte: item.quantity } },
        data: { stock: { decrement: item.quantity } },
      });
      if (res.count === 0) {
        throw {
          statusCode: 400,
          code: 'INSUFFICIENT_STOCK',
          message: 'Not enough stock for one of the selected variants',
        };
      }
    }

    return created;
  });

  // Trigger out-of-stock check outside transaction (needs fresh reads)
  await Promise.all(input.items.map((item) => triggerOutOfStock(item.variantId)));

  emitToRoom('orders:all', 'order:created', { orderId: order.id, reference: order.reference });
  emitToRoom('dashboard', 'kpi:refresh', {});

  // Auto-assign if no agent was set on creation — fire-and-forget so order
  // creation stays fast even if the engine is slow / the lock is busy.
  if (!input.agentId) {
    autoAssign(order.id).catch(() => {
      // Swallow — order exists unassigned, and the engine logs its own reasons.
    });
  }

  return order;
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

  // Build stock-delta map: +oldQty restored, -newQty deducted (net per variant)
  const stockDelta = new Map<string, number>();
  if (newItems) {
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

  // Post-transaction: trigger out-of-stock cascade for any variant that hit 0
  if (newItems) {
    const touched = Array.from(stockDelta.keys());
    await Promise.all(touched.map((variantId) => triggerOutOfStock(variantId)));
  }

  emitToRoom('orders:all', 'order:updated', { orderId: id });
  emitToRoom('dashboard', 'kpi:refresh', {});

  return updated;
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

  emitToRoom('orders:all', 'order:archived', { orderId: id });
  emitToRoom('dashboard', 'kpi:refresh', {});
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
    await tx.order.update({ where: { id }, data: updateData });
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
  });

  const updatedOrder = await prisma.order.findUnique({ where: { id }, include: ORDER_FULL_INCLUDE });

  emitToRoom('orders:all', 'order:updated', { orderId: id });
  if (order.agent?.id) {
    emitToRoom(`agent:${order.agent.id}`, 'order:updated', { orderId: id });
  }
  emitToRoom('dashboard', 'kpi:refresh', {});

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

  return updatedOrder;
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
    // Old agent lost this order — notify them so their pipeline refreshes
    if (previousAgentId && previousAgentId !== input.agentId) {
      emitToRoom(`agent:${previousAgentId}`, 'order:updated', { orderId: id });
    }
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
    if (previousAgentId) {
      emitToRoom(`agent:${previousAgentId}`, 'order:updated', { orderId: id });
    }
  }

  emitToRoom('orders:all', 'order:updated', { orderId: id });
  emitToRoom('dashboard', 'kpi:refresh', {});
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

    if (input.action === 'assign' && input.agentId) {
      emitToRoom(`agent:${input.agentId}`, 'order:assigned', { orderId });
    }
  };

  for (let i = 0; i < input.orderIds.length; i += BULK_CHUNK_SIZE) {
    const chunk = input.orderIds.slice(i, i + BULK_CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(chunk.map(runOne));
    results.push(...chunkResults);
  }

  emitToRoom('orders:all', 'order:bulk_updated', { count: input.orderIds.length });
  emitToRoom('dashboard', 'kpi:refresh', {});

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
//  - All orders must share the same agentId (or all unassigned) — caller
//    reassigns first if not.
//  - Stock is NOT adjusted: items were allocated at creation; merging just
//    consolidates that allocation into the keeper.
//  - Merged orders are soft-archived with a log pointing to the keeper.
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

  const agentIds = new Set(orders.map((o) => o.agentId ?? '__unassigned__'));
  if (agentIds.size !== 1) {
    throw {
      statusCode: 409,
      code: 'AGENT_MISMATCH',
      message: 'Orders are assigned to different agents — reassign to one agent first',
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

    // Archive merge orders; drop their items so stock isn't duplicated
    for (const o of orders) {
      if (o.id === keeper.id) continue;
      await tx.orderItem.deleteMany({ where: { orderId: o.id } });
      await tx.order.update({ where: { id: o.id }, data: { isArchived: true } });
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

  emitToRoom('orders:all', 'order:updated', { orderId: keeper.id });
  for (const id of input.mergeOrderIds) {
    emitToRoom('orders:all', 'order:archived', { orderId: id });
  }
  emitToRoom('dashboard', 'kpi:refresh', {});

  const result = await prisma.order.findUnique({
    where: { id: keeper.id },
    include: ORDER_FULL_INCLUDE,
  });
  return result;
}
