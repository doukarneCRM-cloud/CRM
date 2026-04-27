import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import { listWeeks, projectWeekShares, closeWeek, weekStartFor } from './weeks.service';
import { prisma } from '../../shared/prisma';

export async function atelieWeeksRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (_req, reply) => {
      const data = await listWeeks();
      return reply.send({ data });
    },
  );

  // /:weekStart accepts either a Monday ISO date (2026-04-27) or any
  // date in the week — weekStartFor normalises to Monday 00:00 UTC so
  // the URL is forgiving.
  app.get<{ Params: { weekStart: string } }>(
    '/:weekStart',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (req, reply) => {
      const date = new Date(req.params.weekStart);
      if (Number.isNaN(date.getTime())) {
        return reply.status(400).send({ error: { message: 'Invalid date' } });
      }
      const projection = await projectWeekShares(weekStartFor(date));
      if (!projection) return reply.status(404).send({ error: { message: 'Week not found' } });
      return reply.send(projection);
    },
  );

  app.post<{ Params: { weekStart: string } }>(
    '/:weekStart/close',
    { preHandler: [verifyJWT, requirePermission('production:close_week')] },
    async (req, reply) => {
      const date = new Date(req.params.weekStart);
      if (Number.isNaN(date.getTime())) {
        return reply.status(400).send({ error: { message: 'Invalid date' } });
      }
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, name: true },
      });
      const result = await closeWeek(weekStartFor(date), {
        id: req.user.sub,
        name: user?.name ?? 'Unknown',
      });
      return reply.send(result);
    },
  );
}
