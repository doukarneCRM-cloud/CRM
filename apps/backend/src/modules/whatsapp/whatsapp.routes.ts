import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './whatsapp.service';

export async function whatsappRoutes(app: FastifyInstance) {
  app.get(
    '/sessions',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (_req, reply) => {
      const rows = await svc.listSessions();
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/sessions',
    { preHandler: [verifyJWT, requirePermission('whatsapp:connect')] },
    async (req, reply) => {
      const body = req.body as { userId?: string | null };
      const session = await svc.createSession(body.userId ?? null);
      return reply.status(201).send(session);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/sessions/:id/qr',
    { preHandler: [verifyJWT, requirePermission('whatsapp:connect')] },
    async (req, reply) => {
      const result = await svc.getSessionQr(req.params.id);
      return reply.send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/sessions/:id/disconnect',
    { preHandler: [verifyJWT, requirePermission('whatsapp:connect')] },
    async (req, reply) => {
      const result = await svc.disconnectSession(req.params.id);
      return reply.send(result);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/sessions/:id',
    { preHandler: [verifyJWT, requirePermission('whatsapp:connect')] },
    async (req, reply) => {
      const result = await svc.deleteSession(req.params.id);
      return reply.send(result);
    },
  );

  // Evolution calls this back with connection/message events. Auth-via-payload:
  // we only act on events whose `instance` matches a session we created.
  // Evolution sends its own per-instance hash in the `apikey` header, not our
  // admin key, so header-based auth would reject every real webhook.
  app.post('/webhook', async (req, reply) => {
    await svc.ingestWebhook(req.body as Record<string, unknown>);
    return reply.send({ ok: true });
  });
}
