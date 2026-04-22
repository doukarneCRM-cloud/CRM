import type { FastifyInstance } from 'fastify';
import type { WhatsAppThreadStatus } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as inbox from './inbox.service';

// Agents see their own threads; anyone with whatsapp:view can see all (admin,
// supervisor). Scope is enforced in-route rather than at the middleware so
// agents don't need a separate permission for "mine vs all".
export async function inboxRoutes(app: FastifyInstance) {
  app.get(
    '/threads',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const q = req.query as {
        status?: WhatsAppThreadStatus;
        scope?: 'mine' | 'all';
        agentId?: string;
      };
      const scope = q.scope ?? 'mine';
      // Explicit agentId wins over scope so admin can drill into a specific
      // agent's threads; mine keeps its own-id shortcut for non-admins.
      const agentId = q.agentId ? q.agentId : scope === 'mine' ? req.user.sub : undefined;
      const rows = await inbox.listThreads({
        agentId,
        status: q.status,
      });
      return reply.send({ data: rows });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/threads/:id/messages',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const rows = await inbox.listMessages(req.params.id);
      return reply.send({ data: rows });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/threads/:id/read',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      await inbox.markThreadRead(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/threads/:id',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const body = req.body as { status?: WhatsAppThreadStatus; assignedAgentId?: string | null };
      const updated = await inbox.updateThread(req.params.id, body);
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/threads/:id/reply',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const body = req.body as { body: string };
      if (!body.body || !body.body.trim()) {
        return reply.status(400).send({ error: { code: 'EMPTY_BODY', message: 'Message body is required' } });
      }
      const result = await inbox.sendReply({
        threadId: req.params.id,
        body: body.body,
        authorUserId: req.user.sub,
      });
      return reply.status(201).send(result);
    },
  );
}
