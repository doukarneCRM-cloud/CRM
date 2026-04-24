/**
 * Returns Verification routes — /api/v1/returns.
 *
 * READ endpoints require `returns:verify`. Verification write requires the
 * same permission (single gate — the warehouse role is the only one that
 * touches this section).
 */

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import { prisma } from '../../shared/prisma';
import {
  listReturns,
  findByScan,
  verifyReturn,
  getReturnStats,
  pushScanToUser,
} from './returns.service';

const VerifySchema = z.object({
  outcome: z.enum(['good', 'damaged', 'wrong']),
  note: z.string().max(1000).nullable().optional(),
});

const ScanPushSchema = z.object({
  code: z.string().trim().min(1).max(200),
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

export async function returnsRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('returns:verify')] },
    async (request, reply) => {
      const q = request.query as Record<string, string | undefined>;
      const payload = await listReturns({
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
        scope: (q.scope as 'pending' | 'verified' | 'all' | undefined) ?? 'pending',
        search: q.search,
      });
      return reply.send(payload);
    },
  );

  app.get(
    '/stats',
    { preHandler: [verifyJWT, requirePermission('returns:verify')] },
    async (_request, reply) => {
      const stats = await getReturnStats();
      return reply.send(stats);
    },
  );

  app.get<{ Params: { query: string } }>(
    '/scan/:query',
    { preHandler: [verifyJWT, requirePermission('returns:verify')] },
    async (request, reply) => {
      const order = await findByScan(request.params.query);
      if (!order) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'No order matches this tracking ID or reference',
            statusCode: 404,
          },
        });
      }
      return reply.send(order);
    },
  );

  // Phone device posts a scanned code here — backend resolves it and pushes
  // the full order payload to this same user's laptop over socket.io. The
  // phone just needs a found/not-found acknowledgement to give the agent
  // haptic/visual feedback so they can move on to the next parcel.
  app.post(
    '/scan/push',
    { preHandler: [verifyJWT, requirePermission('returns:verify')] },
    async (request, reply) => {
      const parsed = ScanPushSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid payload',
            statusCode: 400,
            issues: parsed.error.issues,
          },
        });
      }
      const result = await pushScanToUser(request.user.sub, parsed.data.code);
      if (!result.found) {
        return reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'No order matches this tracking ID or reference',
            statusCode: 404,
            code_scanned: result.code,
          },
        });
      }
      return reply.send({ found: true, reference: result.order.reference });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/verify',
    { preHandler: [verifyJWT, requirePermission('returns:verify')] },
    async (request, reply) => {
      const parsed = VerifySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', statusCode: 400, issues: parsed.error.issues },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { id: true, name: true },
      });
      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found', statusCode: 401 },
        });
      }

      try {
        const updated = await verifyReturn(request.params.id, parsed.data, user);
        return reply.send(updated);
      } catch (err) {
        return replyError(reply, err);
      }
    },
  );
}
