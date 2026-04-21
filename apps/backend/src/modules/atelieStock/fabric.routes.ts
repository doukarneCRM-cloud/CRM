import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './fabric.service';
import {
  CreateFabricTypeSchema,
  UpdateFabricTypeSchema,
  CreateFabricRollSchema,
  UpdateFabricRollSchema,
  AdjustFabricRollSchema,
} from './fabric.schema';

export async function fabricRoutes(app: FastifyInstance) {
  // ─── Fabric types ──────────────────────────────────────────────────────────
  app.get(
    '/types',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:view')] },
    async (req, reply) => {
      const q = req.query as { includeInactive?: string };
      const rows = await svc.listFabricTypes(q.includeInactive === 'true');
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/types',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      const input = CreateFabricTypeSchema.parse(req.body);
      const created = await svc.createFabricType(input);
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/types/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      const input = UpdateFabricTypeSchema.parse(req.body);
      const updated = await svc.updateFabricType(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/types/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      await svc.deactivateFabricType(req.params.id);
      return reply.send({ ok: true });
    },
  );

  // ─── Fabric rolls ──────────────────────────────────────────────────────────
  app.get(
    '/rolls/tree',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:view')] },
    async (_req, reply) => {
      const tree = await svc.fabricRollsTree();
      return reply.send({ data: tree });
    },
  );

  app.get(
    '/rolls',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:view')] },
    async (req, reply) => {
      const q = req.query as {
        fabricTypeId?: string;
        color?: string;
        depleted?: string;
      };
      const rows = await svc.listFabricRolls({
        fabricTypeId: q.fabricTypeId,
        color: q.color,
        depleted: q.depleted === undefined ? undefined : q.depleted === 'true',
      });
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/rolls',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      const input = CreateFabricRollSchema.parse(req.body);
      const result = await svc.createFabricRoll(input, req.user.sub);
      return reply.status(201).send(result);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/rolls/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      const input = UpdateFabricRollSchema.parse(req.body);
      const updated = await svc.updateFabricRoll(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/rolls/:id/adjust',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      const input = AdjustFabricRollSchema.parse(req.body);
      const updated = await svc.adjustFabricRoll(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/rolls/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:fabric:manage')] },
    async (req, reply) => {
      await svc.deleteFabricRoll(req.params.id);
      return reply.send({ ok: true });
    },
  );
}
