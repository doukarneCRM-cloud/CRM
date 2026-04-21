import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './atelieTests.service';
import { CreateProductTestSchema, UpdateProductTestSchema } from './atelieTests.schema';
import { prisma } from '../../shared/prisma';

async function canViewVideo(userId: string) {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { users: { some: { id: userId } } } },
    include: { permission: true },
  });
  return rows.some((rp) => rp.permission.key === 'atelie:tests:view_video');
}

export async function atelieTestsRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view')] },
    async (req, reply) => {
      const includeVideo = await canViewVideo(req.user.sub);
      const rows = await svc.listTests({ includeVideo });
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const input = CreateProductTestSchema.parse(req.body);
      const created = await svc.createTest(input);
      return reply.status(201).send(created);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view')] },
    async (req, reply) => {
      const includeVideo = await canViewVideo(req.user.sub);
      const row = await svc.getTest(req.params.id, { includeVideo });
      if (!row) return reply.status(404).send({ error: { message: 'Not found' } });
      return reply.send(row);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id/video',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view_video')] },
    async (req, reply) => {
      const row = await svc.getTestVideo(req.params.id);
      if (!row) return reply.status(404).send({ error: { message: 'Not found' } });
      return reply.send(row);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const input = UpdateProductTestSchema.parse(req.body);
      const updated = await svc.updateTest(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      await svc.deleteTest(req.params.id);
      return reply.send({ ok: true });
    },
  );
}
