import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import type { MaterialCategory } from '@prisma/client';
import * as svc from './atelieStock.service';
import {
  CreateMaterialSchema,
  UpdateMaterialSchema,
  MovementSchema,
} from './atelieStock.schema';

export async function atelieStockRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { category?: string; lowOnly?: string; includeInactive?: string };
      const rows = await svc.listMaterials({
        category: q.category ? (q.category as MaterialCategory) : undefined,
        lowOnly: q.lowOnly === 'true',
        includeInactive: q.includeInactive === 'true',
      });
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = CreateMaterialSchema.parse(req.body);
      const created = await svc.createMaterial(input);
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = UpdateMaterialSchema.parse(req.body);
      const updated = await svc.updateMaterial(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      await svc.deactivateMaterial(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/movement',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = MovementSchema.parse(req.body);
      const result = await svc.recordMovement(req.params.id, input, req.user.sub);
      return reply.send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id/movements',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { limit?: string };
      const limit = q.limit ? Number(q.limit) : 50;
      const rows = await svc.listMovements(req.params.id, limit);
      return reply.send({ data: rows });
    },
  );
}
