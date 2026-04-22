import type { AutomationTrigger, ConfirmationStatus, ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { render } from './templateEngine';

// Map a status transition to the automation trigger that should fire (or null).
// Only fires on the *transition into* the target state, never on re-saves of
// the same status — callers pass both prev and next.
export function triggerForOrderTransition(
  prev: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
  next: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
): AutomationTrigger | null {
  if (next.confirmation !== prev.confirmation) {
    if (next.confirmation === 'confirmed') return 'confirmation_confirmed';
    if (next.confirmation === 'cancelled') return 'confirmation_cancelled';
    if (next.confirmation === 'unreachable') return 'confirmation_unreachable';
  }
  if (next.shipping !== prev.shipping) {
    if (next.shipping === 'picked_up') return 'shipping_picked_up';
    if (next.shipping === 'in_transit') return 'shipping_in_transit';
    if (next.shipping === 'out_for_delivery') return 'shipping_out_for_delivery';
    if (next.shipping === 'delivered') return 'shipping_delivered';
    if (next.shipping === 'returned') return 'shipping_returned';
    if (next.shipping === 'return_validated') return 'shipping_return_validated';
  }
  return null;
}

// Load the full context needed to render any order-side template. Uses the
// first item for product/variant — multi-item orders are rare and this matches
// how the OrderLog and existing notification system describe orders.
async function loadOrderContext(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      agent: { select: { id: true, name: true, phone: true } },
      items: {
        include: {
          variant: {
            include: { product: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!order) return null;

  const firstItem = order.items[0];
  const product = firstItem?.variant.product.name ?? '';
  const size = firstItem?.variant.size ?? '';
  const color = firstItem?.variant.color ?? '';

  return {
    order,
    ctx: {
      customer: {
        name: order.customer.fullName,
        phone: order.customer.phoneDisplay ?? order.customer.phone,
        city: order.customer.city,
      },
      order: {
        reference: order.reference,
        total: Math.round(order.total),
        shippingPrice: Math.round(order.shippingPrice),
        itemCount: order.items.length,
      },
      product: { name: product },
      variant: { size, color },
      agent: {
        name: order.agent?.name ?? '',
        phone: order.agent?.phone ?? '',
      },
    } as Record<string, unknown>,
  };
}

// Shared enqueue helper — creates a MessageLog row (idempotent via dedupeKey)
// and pushes a Bull job that the worker will pick up. Called from all three
// trigger sites.
async function enqueueMessage(params: {
  trigger: AutomationTrigger;
  dedupeKey: string;
  orderId?: string | null;
  agentId?: string | null;
  recipientPhone: string;
  body: string;
}) {
  try {
    const log = await prisma.messageLog.create({
      data: {
        trigger: params.trigger,
        dedupeKey: params.dedupeKey,
        orderId: params.orderId ?? null,
        agentId: params.agentId ?? null,
        recipientPhone: params.recipientPhone,
        body: params.body,
        status: 'queued',
      },
    });
    await whatsappQueue.add({ messageLogId: log.id });
  } catch (err: unknown) {
    // Unique constraint on dedupeKey → this transition was already dispatched.
    const code = (err as { code?: string }).code;
    if (code === 'P2002') return;
    throw err;
  }
}

// ─── Public dispatcher entry points ────────────────────────────────────────

export async function dispatchOrderStatusChange(
  orderId: string,
  transition: {
    prev: { confirmation: ConfirmationStatus; shipping: ShippingStatus };
    next: { confirmation: ConfirmationStatus; shipping: ShippingStatus };
  },
): Promise<void> {
  const trigger = triggerForOrderTransition(transition.prev, transition.next);
  if (!trigger) return;

  const template = await prisma.messageTemplate.findUnique({ where: { trigger } });
  if (!template || !template.enabled) return;

  const loaded = await loadOrderContext(orderId);
  if (!loaded) return;
  const { order, ctx } = loaded;

  const body = render(template.body, ctx);
  await enqueueMessage({
    trigger,
    dedupeKey: `${orderId}:${trigger}`,
    orderId,
    agentId: order.agentId,
    recipientPhone: order.customer.phone,
    body,
  });
}

export async function dispatchCommissionPaid(paymentId: string): Promise<void> {
  const template = await prisma.messageTemplate.findUnique({
    where: { trigger: 'commission_paid' },
  });
  if (!template || !template.enabled) return;

  const payment = await prisma.commissionPayment.findUnique({
    where: { id: paymentId },
    include: { agent: { select: { id: true, name: true, phone: true } } },
  });
  if (!payment || !payment.agent?.phone) return;

  const ctx: Record<string, unknown> = {
    agent: { name: payment.agent.name, phone: payment.agent.phone },
    commission: {
      amount: Math.round(payment.amount),
      orderCount: payment.orderIds.length,
      periodFrom: payment.periodFrom?.toISOString().slice(0, 10) ?? '',
      periodTo: payment.periodTo?.toISOString().slice(0, 10) ?? '',
    },
  };

  const body = render(template.body, ctx);
  await enqueueMessage({
    trigger: 'commission_paid',
    dedupeKey: `${paymentId}:${payment.agent.id}`,
    agentId: payment.agent.id,
    recipientPhone: payment.agent.phone,
    body,
  });
}
