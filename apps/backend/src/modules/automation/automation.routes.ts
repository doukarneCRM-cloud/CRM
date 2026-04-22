import type { FastifyInstance } from 'fastify';
import type { AutomationTrigger, MessageLogStatus } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './automation.service';
import * as rules from './rules.service';
import { ALLOWED_FIELDS } from './conditionEvaluator';

export async function automationRoutes(app: FastifyInstance) {
  app.get(
    '/templates',
    { preHandler: [verifyJWT, requirePermission('automation:view')] },
    async (_req, reply) => {
      const rows = await svc.listTemplates();
      return reply.send({ data: rows });
    },
  );

  app.patch<{ Params: { trigger: AutomationTrigger } }>(
    '/templates/:trigger',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      const body = req.body as { enabled?: boolean; body?: string };
      const updated = await svc.updateTemplate(req.params.trigger, body, req.user.sub);
      return reply.send(updated);
    },
  );

  app.get(
    '/logs',
    { preHandler: [verifyJWT, requirePermission('automation:view')] },
    async (req, reply) => {
      const q = req.query as {
        trigger?: AutomationTrigger;
        status?: MessageLogStatus;
        from?: string;
        to?: string;
        orderId?: string;
        agentId?: string;
        limit?: string;
        offset?: string;
      };
      const result = await svc.listLogs({
        trigger: q.trigger,
        status: q.status,
        from: q.from,
        to: q.to,
        orderId: q.orderId,
        agentId: q.agentId,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
      return reply.send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/logs/:id/retry',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      const result = await svc.retryLog(req.params.id);
      return reply.send(result);
    },
  );

  app.get(
    '/system-session',
    { preHandler: [verifyJWT, requirePermission('automation:view')] },
    async (_req, reply) => {
      const sessionId = await svc.getSystemSessionId();
      return reply.send({ sessionId });
    },
  );

  app.post(
    '/system-session',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      const body = req.body as { sessionId: string | null };
      await svc.setSystemSessionId(body.sessionId ?? null);
      return reply.send({ ok: true });
    },
  );

  // ── Rules ────────────────────────────────────────────────────────────
  app.get(
    '/rules',
    { preHandler: [verifyJWT, requirePermission('automation:view')] },
    async (req, reply) => {
      const q = req.query as { trigger?: AutomationTrigger };
      const rows = await rules.listRules(q.trigger);
      return reply.send({ data: rows, allowedFields: ALLOWED_FIELDS });
    },
  );

  app.post(
    '/rules',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      const body = req.body as {
        trigger: AutomationTrigger;
        name: string;
        priority?: number;
        enabled?: boolean;
        overlap?: string;
        conditions?: unknown;
        templateId: string;
        sendFromSystem?: boolean;
      };
      const created = await rules.createRule({ ...body, createdById: req.user.sub });
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/rules/:id',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      const body = req.body as Parameters<typeof rules.updateRule>[1];
      const updated = await rules.updateRule(req.params.id, body);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/rules/:id',
    { preHandler: [verifyJWT, requirePermission('automation:manage')] },
    async (req, reply) => {
      await rules.deleteRule(req.params.id);
      return reply.send({ ok: true });
    },
  );
}
