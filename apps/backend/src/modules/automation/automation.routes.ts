import type { FastifyInstance } from 'fastify';
import type { AutomationTrigger, MessageLogStatus } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './automation.service';

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
}
