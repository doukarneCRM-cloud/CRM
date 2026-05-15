/**
 * Money → Commission. Lists per-agent commission owed (reusing the canonical
 * computeAgentCommission helper), records payouts, and locks in amounts on
 * the affected orders so the same pending amount never gets paid twice.
 */

import { prisma } from '../../shared/prisma';
import { computeAgentCommissionByIds } from '../../utils/kpiCalculator';
import { dispatchCommissionPaid } from '../automation/dispatcher';

export interface AgentCommissionRow {
  agentId: string;
  name: string;
  email: string;
  roleLabel: string;
  deliveredCount: number;
  paidCount: number;
  pendingCount: number;
  paidTotal: number;
  pendingTotal: number;
  total: number;
  perOrderRate: number;
}

/**
 * List every user with `confirmation:view` (i.e. agents) together with their
 * commission snapshot. Each row is one card on the Commission tab.
 */
export async function listAgentCommissions(): Promise<AgentCommissionRow[]> {
  const agents = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { permissions: { some: { permission: { key: 'confirmation:view' } } } },
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: { select: { label: true } },
    },
    orderBy: { name: 'asc' },
  });

  const commissionMap = await computeAgentCommissionByIds(agents.map((a) => a.id));

  return agents.map((a) => {
    const c = commissionMap.get(a.id)!;
    return {
      agentId: a.id,
      name: a.name,
      email: a.email,
      roleLabel: a.role.label,
      deliveredCount: c.deliveredCount,
      paidCount: c.paidCount,
      pendingCount: c.pendingCount,
      paidTotal: c.paidTotal,
      pendingTotal: c.pendingTotal,
      total: c.total,
      perOrderRate: c.perOrderRate,
    } satisfies AgentCommissionRow;
  });
}

export interface AgentPendingOrder {
  id: string;
  reference: string;
  deliveredAt: string | null;
  commissionAmount: number;
  customer: { fullName: string; city: string };
}

/**
 * Orders that contribute to the agent's PENDING commission bucket — what the
 * "Record payment" drawer lists so the admin can see exactly what they're
 * paying for. Delivered, not yet paid. Legacy orders (pre-rule, no stored
 * commissionAmount) are valued at the agent's current per-order rate.
 */
export async function listAgentPendingOrders(agentId: string): Promise<AgentPendingOrder[]> {
  const [orders, rules] = await Promise.all([
    prisma.order.findMany({
      where: {
        agentId,
        isArchived: false,
        shippingStatus: 'delivered',
        commissionPaid: false,
      },
      select: {
        id: true,
        reference: true,
        deliveredAt: true,
        commissionAmount: true,
        customer: { select: { fullName: true, city: true } },
      },
      orderBy: { deliveredAt: 'desc' },
    }),
    prisma.commissionRule.findMany({
      where: { agentId },
      select: { type: true, value: true },
    }),
  ]);

  const perOrderRate =
    (rules.find((r) => r.type === 'onConfirm')?.value ?? 0) +
    (rules.find((r) => r.type === 'onDeliver')?.value ?? 0);

  return orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    deliveredAt: o.deliveredAt ? o.deliveredAt.toISOString() : null,
    commissionAmount: o.commissionAmount ?? perOrderRate,
    customer: { fullName: o.customer.fullName, city: o.customer.city },
  }));
}

export interface RecordPaymentInput {
  agentId: string;
  amount: number;
  orderIds?: string[];
  notes?: string | null;
  fileUrl?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  method?: 'cash' | 'bank_transfer' | 'card' | 'other' | null;
}

/**
 * Records a CommissionPayment and — in the same transaction — flips
 * `commissionPaid = true` on every order listed in `orderIds`, locking in
 * `commissionAmount` for legacy orders that had no ledger value yet.
 */
export async function recordCommissionPayment(
  input: RecordPaymentInput,
  recordedById?: string,
) {
  const perOrderRate = await (async () => {
    const rules = await prisma.commissionRule.findMany({
      where: { agentId: input.agentId },
      select: { type: true, value: true },
    });
    return (
      (rules.find((r) => r.type === 'onConfirm')?.value ?? 0) +
      (rules.find((r) => r.type === 'onDeliver')?.value ?? 0)
    );
  })();

  const orderIds = input.orderIds ?? [];

  const actorName = recordedById
    ? (await prisma.user.findUnique({ where: { id: recordedById }, select: { name: true } }))?.name ?? 'admin'
    : 'admin';

  return prisma.$transaction(async (tx) => {
    // Lock in commissionAmount for any legacy order being cleared.
    if (orderIds.length > 0) {
      const legacy = await tx.order.findMany({
        where: { id: { in: orderIds }, agentId: input.agentId, commissionAmount: null },
        select: { id: true },
      });
      if (legacy.length > 0) {
        await tx.order.updateMany({
          where: { id: { in: legacy.map((o) => o.id) } },
          data: { commissionAmount: perOrderRate },
        });
      }
      await tx.order.updateMany({
        where: { id: { in: orderIds }, agentId: input.agentId, commissionPaid: false },
        data: { commissionPaid: true, commissionPaidAt: new Date() },
      });

      await tx.orderLog.createMany({
        data: orderIds.map((orderId) => ({
          orderId,
          type: 'system' as const,
          action: `Commission paid by ${actorName}`,
          performedBy: actorName,
          userId: recordedById ?? null,
        })),
      });
    }

    const payment = await tx.commissionPayment.create({
      data: {
        agentId: input.agentId,
        amount: input.amount,
        orderIds,
        notes: input.notes?.trim() || null,
        fileUrl: input.fileUrl ?? null,
        periodFrom: input.periodFrom ? new Date(input.periodFrom) : null,
        periodTo: input.periodTo ? new Date(input.periodTo) : null,
        method: input.method ?? null,
        recordedById: recordedById ?? null,
      },
      include: {
        agent: { select: { id: true, name: true, email: true } },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    return payment;
  }).then(async (payment) => {
    // Automation — commission-paid WhatsApp DM to the agent (fire-and-forget).
    void dispatchCommissionPaid(payment.id);
    return payment;
  });
}

export async function listPaymentHistory(agentId?: string) {
  return prisma.commissionPayment.findMany({
    where: agentId ? { agentId } : undefined,
    orderBy: { paidAt: 'desc' },
    include: {
      agent: { select: { id: true, name: true, email: true } },
      recordedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });
}

export async function deletePayment(id: string, actorId?: string) {
  const actorName = actorId
    ? (await prisma.user.findUnique({ where: { id: actorId }, select: { name: true } }))?.name ?? 'admin'
    : 'admin';

  return prisma.$transaction(async (tx) => {
    const payment = await tx.commissionPayment.findUnique({
      where: { id },
      select: { agentId: true, orderIds: true },
    });
    if (!payment) return { ok: false };

    if (payment.orderIds.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: payment.orderIds }, agentId: payment.agentId },
        data: { commissionPaid: false, commissionPaidAt: null },
      });
      await tx.orderLog.createMany({
        data: payment.orderIds.map((orderId) => ({
          orderId,
          type: 'system' as const,
          action: `Commission payment reversed by ${actorName}`,
          performedBy: actorName,
          userId: actorId ?? null,
        })),
      });
    }
    await tx.commissionPayment.delete({ where: { id } });
    return { ok: true };
  });
}
