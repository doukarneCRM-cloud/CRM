/**
 * Sample (Échantillon) management — formerly "Product tests".
 *
 * A sample declares the BOM for one garment design: which fabrics
 * (main/lining/trim), the per-size tracing in meters, accessories with
 * per-piece quantity, plus admin-set labor/fees/markup. The service
 * recomputes `estimatedCostPerPiece` and `suggestedPrice` on every
 * mutation so list endpoints don't need to recalculate.
 *
 * Lifecycle: draft → tested → approved → archived. Only `approved`
 * samples can spawn a ProductionRun (enforced in the runs module, not
 * here).
 *
 * Video URL is gated by `atelie:tests:view_video`. The generic GET
 * endpoints strip videoUrl for callers without that permission.
 */

import type { SampleStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { stripHtml } from '../../utils/stripHtml';
import { persistSampleCost } from './sampleCost';
import type {
  CreateProductTestInput,
  UpdateProductTestInput,
  ReplaceSamplePhotosInput,
  SampleStatusInput,
} from './atelieTests.schema';

const TEST_INCLUDE = {
  fabrics: { include: { fabricType: true } },
  sizes: true,
  accessories: { include: { material: true } },
  photos: { orderBy: { position: 'asc' } },
  product: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} as const;

export async function listTests(opts: {
  includeVideo: boolean;
  status?: SampleStatus | SampleStatus[];
}) {
  const where = opts.status
    ? { status: Array.isArray(opts.status) ? { in: opts.status } : opts.status }
    : undefined;
  const rows = await prisma.productTest.findMany({
    where,
    include: TEST_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return opts.includeVideo ? rows : rows.map(({ videoUrl: _v, ...rest }) => rest);
}

export async function getTest(id: string, opts: { includeVideo: boolean }) {
  const row = await prisma.productTest.findUnique({
    where: { id },
    include: TEST_INCLUDE,
  });
  if (!row) return null;
  if (!opts.includeVideo) {
    const { videoUrl: _v, ...rest } = row;
    return rest;
  }
  return row;
}

export async function getTestVideo(id: string) {
  return prisma.productTest.findUnique({
    where: { id },
    select: { id: true, name: true, videoUrl: true },
  });
}

export async function createTest(input: CreateProductTestInput) {
  // Snapshot accessory unit costs in one query so we don't fire N material
  // lookups inside the transaction.
  const accessorySnapshots = await snapshotAccessories(input.accessories ?? []);

  const created = await prisma.$transaction(async (tx) => {
    const test = await tx.productTest.create({
      data: {
        name: input.name.trim(),
        productId: input.productId ?? null,
        videoUrl: input.videoUrl?.trim() || null,
        description: input.description ? stripHtml(input.description) || null : null,
        notes: input.notes?.trim() || null,
        // Cost-calc inputs — pass through as given.
        laborMadPerPiece: input.laborMadPerPiece ?? null,
        confirmationFee: input.confirmationFee ?? null,
        deliveryFee: input.deliveryFee ?? null,
        markupPercent: input.markupPercent ?? null,
        // estimatedCostPerPiece + suggestedPrice get rewritten by
        // persistSampleCost below; null here is fine.
      },
    });

    if (input.fabrics?.length) {
      await tx.productTestFabric.createMany({
        data: input.fabrics.map((f) => ({
          testId: test.id,
          fabricTypeId: f.fabricTypeId,
          role: f.role.trim(),
        })),
      });
    }
    if (input.sizes?.length) {
      await tx.productTestSize.createMany({
        data: input.sizes.map((s) => ({
          testId: test.id,
          size: s.size.trim(),
          tracingMeters: s.tracingMeters,
        })),
      });
    }
    if (input.accessories?.length) {
      await tx.productTestAccessory.createMany({
        data: input.accessories.map((a) => ({
          testId: test.id,
          materialId: a.materialId,
          quantityPerPiece: a.quantityPerPiece,
          unitCostSnapshot:
            a.unitCostSnapshot ?? accessorySnapshots.get(a.materialId) ?? null,
        })),
      });
    }

    return test;
  });

  await persistSampleCost(created.id);

  return prisma.productTest.findUnique({ where: { id: created.id }, include: TEST_INCLUDE });
}

export async function updateTest(id: string, input: UpdateProductTestInput) {
  // Same snapshot trick as create — gather any new accessory costs upfront.
  const accessorySnapshots = await snapshotAccessories(input.accessories ?? []);

  await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.productId !== undefined) data.productId = input.productId;
    if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl?.trim() || null;
    if (input.description !== undefined) {
      data.description = input.description ? stripHtml(input.description) || null : null;
    }
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
    if (input.laborMadPerPiece !== undefined) data.laborMadPerPiece = input.laborMadPerPiece;
    if (input.confirmationFee !== undefined) data.confirmationFee = input.confirmationFee;
    if (input.deliveryFee !== undefined) data.deliveryFee = input.deliveryFee;
    if (input.markupPercent !== undefined) data.markupPercent = input.markupPercent;

    if (Object.keys(data).length > 0) {
      await tx.productTest.update({ where: { id }, data });
    }

    // Replace-all for nested arrays when provided. Frontend always sends
    // the full current list on edit, which keeps the diff simple here.
    if (input.fabrics) {
      await tx.productTestFabric.deleteMany({ where: { testId: id } });
      if (input.fabrics.length) {
        await tx.productTestFabric.createMany({
          data: input.fabrics.map((f) => ({
            testId: id,
            fabricTypeId: f.fabricTypeId,
            role: f.role.trim(),
          })),
        });
      }
    }
    if (input.sizes) {
      await tx.productTestSize.deleteMany({ where: { testId: id } });
      if (input.sizes.length) {
        await tx.productTestSize.createMany({
          data: input.sizes.map((s) => ({
            testId: id,
            size: s.size.trim(),
            tracingMeters: s.tracingMeters,
          })),
        });
      }
    }
    if (input.accessories) {
      await tx.productTestAccessory.deleteMany({ where: { testId: id } });
      if (input.accessories.length) {
        await tx.productTestAccessory.createMany({
          data: input.accessories.map((a) => ({
            testId: id,
            materialId: a.materialId,
            quantityPerPiece: a.quantityPerPiece,
            unitCostSnapshot:
              a.unitCostSnapshot ?? accessorySnapshots.get(a.materialId) ?? null,
          })),
        });
      }
    }
  });

  await persistSampleCost(id);

  return prisma.productTest.findUnique({ where: { id }, include: TEST_INCLUDE });
}

export async function deleteTest(id: string) {
  await prisma.productTest.delete({ where: { id } });
  return { ok: true };
}

// ─── Lifecycle transitions ──────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<SampleStatus, SampleStatus[]> = {
  draft:    ['tested', 'archived'],
  tested:   ['approved', 'draft', 'archived'],
  approved: ['archived', 'tested'],
  archived: ['draft'],
};

export async function transitionSample(
  id: string,
  to: SampleStatusInput,
  performedById: string,
) {
  const current = await prisma.productTest.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!current) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Sample not found' };

  const allowed = ALLOWED_TRANSITIONS[current.status];
  if (!allowed.includes(to)) {
    throw {
      statusCode: 400,
      code: 'INVALID_TRANSITION',
      message: `Cannot move sample from ${current.status} to ${to}`,
    };
  }

  // Stamp approval metadata on the forward edge to `approved`. Clearing
  // it on the back edge keeps the record honest — a re-approval gets a
  // fresh timestamp + user.
  const data: Record<string, unknown> = { status: to };
  if (to === 'approved') {
    data.approvedAt = new Date();
    data.approvedById = performedById;
  } else if (current.status === 'approved') {
    data.approvedAt = null;
    data.approvedById = null;
  }

  await prisma.productTest.update({ where: { id }, data });
  return prisma.productTest.findUnique({ where: { id }, include: TEST_INCLUDE });
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export async function replacePhotos(testId: string, input: ReplaceSamplePhotosInput) {
  const exists = await prisma.productTest.findUnique({
    where: { id: testId },
    select: { id: true },
  });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Sample not found' };

  await prisma.$transaction(async (tx) => {
    await tx.productTestPhoto.deleteMany({ where: { testId } });
    if (input.photos.length) {
      await tx.productTestPhoto.createMany({
        data: input.photos.map((p, i) => ({
          testId,
          url: p.url,
          caption: p.caption ?? null,
          // Use submitted position when present, otherwise array index *
          // 1000 so manual reorders later have room to splice between.
          position: p.position ?? i * 1000,
        })),
      });
    }
  });

  return prisma.productTestPhoto.findMany({
    where: { testId },
    orderBy: { position: 'asc' },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Pre-fetch each accessory's current AtelieMaterial.unitCost so the
 * snapshot defaults inside the transaction are O(1) lookups.
 */
async function snapshotAccessories(
  accessories: Array<{ materialId: string; unitCostSnapshot?: number | null }>,
): Promise<Map<string, number>> {
  const idsNeedingDefault = accessories
    .filter((a) => a.unitCostSnapshot == null)
    .map((a) => a.materialId);
  if (idsNeedingDefault.length === 0) return new Map();

  const materials = await prisma.atelieMaterial.findMany({
    where: { id: { in: idsNeedingDefault } },
    select: { id: true, unitCost: true },
  });
  const map = new Map<string, number>();
  for (const m of materials) {
    if (m.unitCost != null) map.set(m.id, Number(m.unitCost));
  }
  return map;
}
