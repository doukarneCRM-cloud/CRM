import crypto from 'node:crypto';
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
  //   1. Shared-secret header — Evolution must send EVOLUTION_WEBHOOK_SECRET
  //      as the `x-webhook-secret` header. Required in production (validated
  //      at boot in shared/env.ts); dev accepts any value if the env var is
  //      unset.
  //   2. We only act on events whose `instance` matches a session we
  //      created (inside ingestWebhook / provider.parseWebhook).
  app.post('/webhook', async (req, reply) => {
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (secret) {
      const provided = req.headers['x-webhook-secret'];
      const providedStr = Array.isArray(provided) ? provided[0] : provided;
      const ok =
        typeof providedStr === 'string' &&
        providedStr.length === secret.length &&
        timingSafeEqualStr(providedStr, secret);
      if (!ok) {
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

// Constant-time string compare. Returns false on length mismatch without
// calling Buffer.equals to avoid leaking the secret length via timing.
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return crypto.timingSafeEqual(ab, bb);
}
