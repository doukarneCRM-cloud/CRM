import type { AutomationTrigger, ConfirmationStatus, ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { render } from './templateEngine';
import { evaluate, type RuleConditions, type EvalContext } from './conditionEvaluator';
import { normalizePhone } from '../../utils/phoneNormalize';

// Map a status transition to the automation trigger that should fire (or
// null). Only fires on the transition INTO the target state.
//
// Note: shipping_* triggers are no longer mapped here. Every shipping
// notification now flows through ColiixStateTemplate (keyed on Coliix's
// literal wording) via dispatchColiixStateChange. The shipping_* values
// remain in the AutomationTrigger enum so legacy MessageLog rows still
// have a valid foreign key, but they're effectively dormant — the
// dispatcher won't return them, so no rule keyed on them can ever fire.
export function triggerForOrderTransition(
  prev: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
  next: { confirmation: ConfirmationStatus; shipping: ShippingStatus },
): AutomationTrigger | null {
  if (next.confirmation !== prev.confirmation) {
    if (next.confirmation === 'confirmed') return 'confirmation_confirmed';
    if (next.confirmation === 'cancelled') return 'confirmation_cancelled';
    if (next.confirmation === 'unreachable') return 'confirmation_unreachable';
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

// Fires when Coliix reports a NEW raw-state wording for an order. Looks
// up a ColiixStateTemplate keyed on that exact wording — this is the
// path that lets the operator automate around any Coliix state without
// extending the AutomationTrigger enum (e.g. "Hub Casablanca",
// "Tentative 2", anything Coliix invents).
//
// One template per rawState, no rules / conditions stack — keeps the
// feature obvious for non-engineers. Dedup on (orderId, rawState) so
// the same state seen twice in a row only sends once even if a webhook
// retries.
export async function dispatchColiixStateChange(
  orderId: string,
  prevRawState: string | null,
  nextRawState: string,
): Promise<void> {
  const trimmed = nextRawState.trim();
  if (!trimmed) return;
  if (prevRawState && prevRawState.trim() === trimmed) return;

  const template = await prisma.coliixStateTemplate.findUnique({
    where: { coliixRawState: trimmed },
  });
  if (!template || !template.enabled) return;

  const loaded = await loadOrderContext(orderId);
  if (!loaded) return;
  const { order, ctx } = loaded;

  const customer = order.customer as typeof order.customer & { whatsappOptOut?: boolean };
  if (customer.whatsappOptOut) return;

  const body = render(template.body, ctx);
  // Re-use the existing message log table — pick the closest enum-based
  // trigger purely so the existing schema's foreign keys + Bull queue
  // pipeline work without adding columns. The dedupeKey uniquely names
  // the rawState so this can't collide with the legacy enum dispatchers.
  await enqueueMessage({
    trigger: 'shipping_label_created' as AutomationTrigger, // closest enum bucket — see comment above
    dedupeKey: `${orderId}:coliix-state:${trimmed}`,
    orderId,
    agentId: order.agentId,
    recipientPhone: order.customer.phone,
    body,
  });
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
