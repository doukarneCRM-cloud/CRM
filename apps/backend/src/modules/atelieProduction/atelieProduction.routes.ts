import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './atelieProduction.service';
import {
  CreateRunSchema,
  UpdateRunSchema,
  ConsumeSchema,
} from './atelieProduction.schema';

export async function atelieProductionRoutes(app: FastifyInstance) {
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (req, reply) => {
      const q = req.query as { status?: string; from?: string; to?: string };
      const rows = await svc.listRuns(q);
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const input = CreateRunSchema.parse(req.body);
      const created = await svc.createRun(input);
      return reply.status(201).send(created);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (req, reply) => {
      const row = await svc.getRun(req.params.id);
      if (!row) return reply.status(404).send({ error: { message: 'Not found' } });
      return reply.send(row);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const input = UpdateRunSchema.parse(req.body);
      const updated = await svc.updateRun(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/consume',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const input = ConsumeSchema.parse(req.body);
      const result = await svc.consume(req.params.id, input, req.user.sub);
      return reply.send(result);
    },
  );

  app.post<{ Params: { id: string; employeeId: string } }>(
    '/:id/workers/:employeeId',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const result = await svc.addWorker(req.params.id, req.params.employeeId);
      return reply.send(result);
    },
  );

  app.delete<{ Params: { id: string; employeeId: string } }>(
    '/:id/workers/:employeeId',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const result = await svc.removeWorker(req.params.id, req.params.employeeId);
      return reply.send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/finish',
    { preHandler: [verifyJWT, requirePermission('production:finish')] },
    async (req, reply) => {
      const result = await svc.finishRun(req.params.id);
      return reply.send(result);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id/cost-breakdown',
    { preHandler: [verifyJWT, requirePermission('production:cost:view')] },
    async (req, reply) => {
      const result = await svc.costBreakdown(req.params.id);
      return reply.send(result);
    },
  );
}
