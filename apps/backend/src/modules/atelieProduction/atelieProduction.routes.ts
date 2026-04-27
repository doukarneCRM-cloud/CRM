import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ProductionStage, LaborAllocationMode } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './atelieProduction.service';
import {
  CreateRunSchema,
  UpdateRunSchema,
  ConsumeSchema,
} from './atelieProduction.schema';
import { advanceStage, getOrInitStages, STAGE_ORDER } from './stages.service';
import { listProductionLogs } from './productionLog';
import { prisma } from '../../shared/prisma';

const StageEnum = z.nativeEnum(ProductionStage);

const AdvanceStageSchema = z.object({
  inputPieces: z.number().int().min(0).max(100_000).optional(),
  outputPieces: z.number().int().min(0).max(100_000).optional(),
  rejectedPieces: z.number().int().min(0).max(100_000).optional(),
  notes: z.string().max(1000).nullable().optional(),
  complete: z.boolean().optional(),
});

const UpdateLaborAllocationSchema = z.object({
  laborAllocation: z.nativeEnum(LaborAllocationMode),
  laborManualShare: z.number().min(0).max(100).nullable().optional(),
});

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

  // ── Stages (cut → sew → finish → qc → packed) ──────────────────────────
  // GET initializes the five rows lazily so the timeline always renders.
  app.get<{ Params: { id: string } }>(
    '/:id/stages',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (req, reply) => {
      const rows = await getOrInitStages(req.params.id);
      return reply.send({ data: rows, order: STAGE_ORDER });
    },
  );

  app.patch<{ Params: { id: string; stage: string } }>(
    '/:id/stages/:stage',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const stage = StageEnum.parse(req.params.stage);
      const input = AdvanceStageSchema.parse(req.body);
      // Resolve the user's display name once so the audit log is human-
      // readable without joining User on every render.
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, name: true },
      });
      const rows = await advanceStage(req.params.id, stage, input, {
        id: req.user.sub,
        name: user?.name ?? 'Unknown',
      });
      return reply.send({ data: rows });
    },
  );

  // ── Logs feed ───────────────────────────────────────────────────────────
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; pageSize?: string };
  }>(
    '/:id/logs',
    { preHandler: [verifyJWT, requirePermission('production:view')] },
    async (req, reply) => {
      const page = req.query.page ? Number(req.query.page) : 1;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;
      const result = await listProductionLogs(req.params.id, { page, pageSize });
      return reply.send(result);
    },
  );

  // ── Labor allocation mode (per run) ─────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/:id/labor-allocation',
    { preHandler: [verifyJWT, requirePermission('production:manage')] },
    async (req, reply) => {
      const input = UpdateLaborAllocationSchema.parse(req.body);
      const updated = await prisma.productionRun.update({
        where: { id: req.params.id },
        data: {
          laborAllocation: input.laborAllocation,
          // Manual mode requires the share; clear it for the auto modes
          // so a stale value can't surprise the next week-close.
          laborManualShare:
            input.laborAllocation === 'manual'
              ? input.laborManualShare ?? null
              : null,
        },
      });
      return reply.send(updated);
    },
  );
}
