import type { FastifyInstance } from 'fastify';
import type { SampleStatus } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './atelieTests.service';
import { computeSampleCost } from './sampleCost';
import {
  CreateProductTestSchema,
  UpdateProductTestSchema,
  TransitionSampleSchema,
  ReplaceSamplePhotosSchema,
  SampleStatusEnum,
} from './atelieTests.schema';
import { prisma } from '../../shared/prisma';

async function canViewVideo(userId: string) {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { users: { some: { id: userId } } } },
    include: { permission: true },
  });
  return rows.some((rp) => rp.permission.key === 'atelie:tests:view_video');
}

export async function atelieTestsRoutes(app: FastifyInstance) {
  // ── List ────────────────────────────────────────────────────────────────
  // Optional `?status=draft` (or comma-separated `?status=draft,tested`)
  // filter so the new Samples UI can scope to the active tab without
  // re-fetching the world.
  app.get<{ Querystring: { status?: string } }>(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view')] },
    async (req, reply) => {
      const includeVideo = await canViewVideo(req.user.sub);
      const statusParam = req.query.status?.trim();
      let status: SampleStatus | SampleStatus[] | undefined;
      if (statusParam) {
        const parts = statusParam.split(',').map((s) => s.trim()).filter(Boolean);
        const parsed = parts
          .map((p) => SampleStatusEnum.safeParse(p))
          .filter((r) => r.success)
          .map((r) => (r as { success: true; data: SampleStatus }).data);
        status = parsed.length === 1 ? parsed[0] : parsed.length ? parsed : undefined;
      }
      const rows = await svc.listTests({ includeVideo, status });
      return reply.send({ data: rows });
    },
  );

  // ── Create ──────────────────────────────────────────────────────────────
  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const input = CreateProductTestSchema.parse(req.body);
      const created = await svc.createTest(input);
      return reply.status(201).send(created);
    },
  );

  // ── Single ──────────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view')] },
    async (req, reply) => {
      const includeVideo = await canViewVideo(req.user.sub);
      const row = await svc.getTest(req.params.id, { includeVideo });
      if (!row) return reply.status(404).send({ error: { message: 'Sample not found' } });
      return reply.send(row);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/:id/video',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view_video')] },
    async (req, reply) => {
      const row = await svc.getTestVideo(req.params.id);
      if (!row) return reply.status(404).send({ error: { message: 'Sample not found' } });
      return reply.send(row);
    },
  );

  // ── Cost breakdown — exposed separately so the UI side panel can
  // refresh after every nested edit without paying the full sample fetch.
  app.get<{ Params: { id: string } }>(
    '/:id/cost',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:view')] },
    async (req, reply) => {
      const breakdown = await computeSampleCost({ testId: req.params.id });
      return reply.send(breakdown);
    },
  );

  // ── Update ──────────────────────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const input = UpdateProductTestSchema.parse(req.body);
      const updated = await svc.updateTest(req.params.id, input);
      return reply.send(updated);
    },
  );

  // ── Lifecycle transitions (draft → tested → approved → archived) ────────
  app.post<{ Params: { id: string } }>(
    '/:id/transition',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const { to } = TransitionSampleSchema.parse(req.body);
      const updated = await svc.transitionSample(req.params.id, to, req.user.sub);
      return reply.send(updated);
    },
  );

  // ── Photos (bulk replace) ───────────────────────────────────────────────
  app.put<{ Params: { id: string } }>(
    '/:id/photos',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      const input = ReplaceSamplePhotosSchema.parse(req.body);
      const photos = await svc.replacePhotos(req.params.id, input);
      return reply.send({ data: photos });
    },
  );

  // ── Delete ──────────────────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:tests:manage')] },
    async (req, reply) => {
      await svc.deleteTest(req.params.id);
      return reply.send({ ok: true });
    },
  );
}
