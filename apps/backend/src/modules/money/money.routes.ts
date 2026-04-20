/**
 * Money routes — /api/v1/money.
 *
 * READ endpoints require `money:view`. WRITE endpoints (create/edit/delete
 * expenses, record payments, toggle carrier-paid) require `money:manage`.
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';

import {
  listExpenses,
  createExpense,
  updateExpense,
  deleteExpense,
} from './expenses.service';
import {
  listAgentCommissions,
  listAgentPendingOrders,
  recordCommissionPayment,
  listPaymentHistory,
  deletePayment,
} from './commission.service';
import {
  listDeliveryInvoice,
  setOrderCarrierPaid,
} from './deliveryInvoice.service';
import { uploadMoneyFile } from './money.upload';

// ─── Schemas ────────────────────────────────────────────────────────────────

const ExpenseCreateSchema = z.object({
  description: z.string().min(1).max(300),
  amount: z.number().positive(),
  date: z.string().min(8),
  fileUrl: z.string().nullable().optional(),
});

const ExpensePatchSchema = z.object({
  description: z.string().min(1).max(300).optional(),
  amount: z.number().positive().optional(),
  date: z.string().min(8).optional(),
  fileUrl: z.string().nullable().optional(),
});

const RecordPaymentSchema = z.object({
  agentId: z.string().min(1),
  amount: z.number().positive(),
  orderIds: z.array(z.string()).optional(),
  notes: z.string().max(1000).nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  periodFrom: z.string().nullable().optional(),
  periodTo: z.string().nullable().optional(),
});

const SetCarrierPaidSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1),
  paid: z.boolean(),
});

function replyError(reply: FastifyReply, err: unknown): FastifyReply {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const e = err as { statusCode: number; code: string; message: string };
    return reply.status(e.statusCode).send({
      error: { code: e.code, message: e.message, statusCode: e.statusCode },
    });
  }
  throw err;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function moneyRoutes(app: FastifyInstance) {
  // ── Expenses ──────────────────────────────────────────────────────────

  app.get(
    '/expenses',
    { preHandler: [verifyJWT, requirePermission('money:view')] },
    async (request, reply) => {
      const q = request.query as Record<string, string | undefined>;
      const result = await listExpenses({
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        search: q.search,
      });
      return reply.send(result);
    },
  );

  app.post(
    '/expenses',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      const parsed = ExpenseCreateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', statusCode: 400, issues: parsed.error.issues },
        });
      }
      try {
        const created = await createExpense(parsed.data, request.user.sub);
        return reply.status(201).send(created);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/expenses/:id',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      const parsed = ExpensePatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', statusCode: 400, issues: parsed.error.issues },
        });
      }
      try {
        const updated = await updateExpense(request.params.id, parsed.data);
        return reply.send(updated);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/expenses/:id',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      try {
        await deleteExpense(request.params.id);
        return reply.status(204).send();
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  app.post(
    '/expenses/upload',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => uploadMoneyFile('expenses', request, reply),
  );

  // ── Commission ────────────────────────────────────────────────────────

  app.get(
    '/commission/agents',
    { preHandler: [verifyJWT, requirePermission('money:view')] },
    async (_request, reply) => {
      const rows = await listAgentCommissions();
      return reply.send({ data: rows });
    },
  );

  app.get<{ Params: { agentId: string } }>(
    '/commission/agents/:agentId/pending-orders',
    { preHandler: [verifyJWT, requirePermission('money:view')] },
    async (request, reply) => {
      const orders = await listAgentPendingOrders(request.params.agentId);
      return reply.send({ data: orders });
    },
  );

  app.get(
    '/commission/payments',
    { preHandler: [verifyJWT, requirePermission('money:view')] },
    async (request, reply) => {
      const q = request.query as { agentId?: string };
      const rows = await listPaymentHistory(q.agentId);
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/commission/payments',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      const parsed = RecordPaymentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', statusCode: 400, issues: parsed.error.issues },
        });
      }
      try {
        const payment = await recordCommissionPayment(parsed.data, request.user.sub);
        return reply.status(201).send(payment);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/commission/payments/:id',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      try {
        const result = await deletePayment(request.params.id, request.user.sub);
        return reply.send(result);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );

  app.post(
    '/commission/upload',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => uploadMoneyFile('commission', request, reply),
  );

  // ── Delivery Invoice ──────────────────────────────────────────────────

  app.get(
    '/delivery-invoice',
    { preHandler: [verifyJWT, requirePermission('money:view')] },
    async (request, reply) => {
      const q = request.query as Record<string, string | undefined>;
      const payload = await listDeliveryInvoice({
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        paidOnly: (q.paidOnly as 'paid' | 'unpaid' | 'all' | undefined) ?? 'all',
        search: q.search,
      });
      return reply.send(payload);
    },
  );

  app.post(
    '/delivery-invoice/mark-paid',
    { preHandler: [verifyJWT, requirePermission('money:manage')] },
    async (request, reply) => {
      const parsed = SetCarrierPaidSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', statusCode: 400, issues: parsed.error.issues },
        });
      }
      try {
        const result = await setOrderCarrierPaid(
          parsed.data.orderIds,
          parsed.data.paid,
          request.user.sub,
        );
        return reply.send(result);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );
}
