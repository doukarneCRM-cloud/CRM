import type { AutomationTrigger, ConfirmationStatus, ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { render } from './templateEngine';
import { evaluate, type RuleConditions, type EvalContext } from './conditionEvaluator';
import { normalizePhone } from '../../utils/phoneNormalize';

// Map a status transition to the automation trigger that should fire (or
// null). Only fires on the transition INTO the target state.
export function triggerForOrderTransition(
  prev: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
  next: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
): AutomationTrigger | null {
  if (next.confirmation !== prev.confirmation) {
    if (next.confirmation === 'confirmed') return 'confirmation_confirmed';
    if (next.confirmation === 'cancelled') return 'confirmation_cancelled';
    if (next.confirmation === 'unreachable') return 'confirmation_unreachable';
    if (next.confirmation === 'callback') return 'confirmation_callback';
    if (next.confirmation === 'reported') return 'confirmation_reported';
  }
  if (next.shipping !== prev.shipping) {
    if (next.shipping === 'pushed') return 'shipping_pushed';
    if (next.shipping === 'picked_up') return 'shipping_picked_up';
    if (next.shipping === 'in_transit') return 'shipping_in_transit';
    if (next.shipping === 'out_for_delivery') return 'shipping_out_for_delivery';
    if (next.shipping === 'failed_delivery') return 'shipping_failed_delivery';
    if (next.shipping === 'reported') return 'shipping_reported';
    if (next.shipping === 'delivered') return 'shipping_delivered';
    if (next.shipping === 'returned') return 'shipping_returned';
  }
  return null;
}

type LoadedOrderRow = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

interface LoadedOrder {
  order: LoadedOrderRow;
  ctx: Record<string, unknown>;
}

async function loadOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      agent: { select: { id: true, name: true, phone: true } },
      items: {
        include: { variant: { include: { product: { select: { name: true } } } } },
      },
    },
  });
}

async function loadOrderContext(orderId: string): Promise<LoadedOrder | null> {
  const order = await loadOrder(orderId);
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
        tag: order.customer.tag,
      },
      order: {
        reference: order.reference,
        total: Math.round(order.total),
        shippingPrice: Math.round(order.shippingPrice),
        itemCount: order.items.length,
        confirmationStatus: order.confirmationStatus,
        shippingStatus: order.shippingStatus,
        source: order.source,
      },
      product: { name: product },
      variant: { size, color },
      agent: {
        id: order.agentId ?? '',
        name: order.agent?.name ?? '',
        phone: order.agent?.phone ?? '',
      },
    },
  };
}

async function enqueueMessage(params: {
  trigger: AutomationTrigger;
  ruleId?: string | null;
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
        ruleId: params.ruleId ?? null,
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

  const rules = await prisma.automationRule.findMany({
    where: { trigger, enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { template: true },
  });
  if (rules.length === 0) return;

  const loaded = await loadOrderContext(orderId);
  if (!loaded) return;
  const { order, ctx } = loaded;

  // Respect opt-out — cast: Prisma client may not reflect the new field yet
  // until the next generate, but the migration ships it.
  const customer = order.customer as typeof order.customer & { whatsappOptOut?: boolean };
  if (customer.whatsappOptOut) return;

  for (const rule of rules) {
    if (!rule.template.enabled) continue;
    const passes = evaluate(rule.conditions as unknown as RuleConditions, ctx as EvalContext);
    if (!passes) continue;

    const body = render(rule.template.body, ctx);
    await enqueueMessage({
      trigger,
      ruleId: rule.id,
      dedupeKey: `${orderId}:${trigger}:${rule.id}`,
      orderId,
      agentId: order.agentId,
      recipientPhone: order.customer.phone,
      body,
    });

    if (rule.overlap !== 'all') break;
  }
}

export async function dispatchCommissionPaid(paymentId: string): Promise<void> {
  const rules = await prisma.automationRule.findMany({
    where: { trigger: 'commission_paid', enabled: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    include: { template: true },
  });
  if (rules.length === 0) return;

  const payment = await prisma.commissionPayment.findUnique({
    where: { id: paymentId },
    include: { agent: { select: { id: true, name: true, phone: true } } },
  });
  if (!payment || !payment.agent?.phone) return;

  // User.phone is stored raw (unlike Customer.phone). Normalize to +212… so
  // Evolution's toJid yields a valid WhatsApp JID (bare `06…` → 400).
  let agentPhoneE164: string;
  try {
    agentPhoneE164 = normalizePhone(payment.agent.phone).normalized;
  } catch {
    return;
  }

  const ctx: Record<string, unknown> = {
    agent: { id: payment.agent.id, name: payment.agent.name, phone: payment.agent.phone },
    commission: {
      amount: Math.round(payment.amount),
      orderCount: payment.orderIds.length,
      periodFrom: payment.periodFrom?.toISOString().slice(0, 10) ?? '',
      periodTo: payment.periodTo?.toISOString().slice(0, 10) ?? '',
    },
  };

  for (const rule of rules) {
    if (!rule.template.enabled) continue;
    const passes = evaluate(rule.conditions as unknown as RuleConditions, ctx as EvalContext);
    if (!passes) continue;

    const body = render(rule.template.body, ctx);
    await enqueueMessage({
      trigger: 'commission_paid',
      ruleId: rule.id,
      dedupeKey: `${paymentId}:${payment.agent.id}:${rule.id}`,
      agentId: payment.agent.id,
      recipientPhone: agentPhoneE164,
      body,
    });

    if (rule.overlap !== 'all') break;
  }
}
