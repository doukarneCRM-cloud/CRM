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

  // Evolution calls this back with connection/message events. Two-layer auth:
  //   1. If EVOLUTION_WEBHOOK_SECRET is set, require it in the
  //      `x-webhook-secret` header — configure Evolution to send this header
  //      and forged webhooks get rejected.
  //   2. We still only act on events whose `instance` matches a session we
  //      created (inside ingestWebhook / provider.parseWebhook).
  // Leaving the env var unset preserves the previous behaviour so existing
  // deployments keep working, but a startup warning is logged in index.ts.
  app.post('/webhook', async (req, reply) => {
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-webhook-secret'];
      const providedStr = Array.isArray(provided) ? provided[0] : provided;
      if (providedStr !== secret) {
        return reply.status(401).send({
          error: {
            code: 'INVALID_WEBHOOK_SECRET',
            message: 'Webhook secret mismatch',
            statusCode: 401,
          },
        });
      }
    }
    await svc.ingestWebhook(req.body as Record<string, unknown>);
    return reply.send({ ok: true });
  });
}
