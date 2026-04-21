/**
 * Product tests = prototypes. They declare which fabrics a design needs
 * (main/lining/trim), the per-size tracing in meters, and which accessories
 * are consumed per piece — so a Production Run can be built from this spec
 * and the cost estimator has a baseline.
 *
 * Video URL is gated: `GET /:id/video` requires `atelie:tests:view_video`.
 * The generic GET endpoints strip videoUrl for callers without that perm.
 */

import { prisma } from '../../shared/prisma';
import type {
  CreateProductTestInput,
  UpdateProductTestInput,
} from './atelieTests.schema';

const TEST_INCLUDE = {
  fabrics: { include: { fabricType: true } },
  sizes: true,
  accessories: { include: { material: true } },
  product: { select: { id: true, name: true } },
} as const;

export async function listTests(opts: { includeVideo: boolean }) {
  const rows = await prisma.productTest.findMany({
    include: TEST_INCLUDE,
    orderBy: { createdAt: 'desc' },
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
  const row = await prisma.productTest.findUnique({
    where: { id },
    select: { id: true, name: true, videoUrl: true },
  });
  return row;
}

export async function createTest(input: CreateProductTestInput) {
  return prisma.$transaction(async (tx) => {
    const test = await tx.productTest.create({
      data: {
        name: input.name.trim(),
        productId: input.productId ?? null,
        videoUrl: input.videoUrl?.trim() || null,
        estimatedCostPerPiece: input.estimatedCostPerPiece ?? null,
        notes: input.notes?.trim() || null,
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
        })),
      });
    }

    return tx.productTest.findUnique({ where: { id: test.id }, include: TEST_INCLUDE });
  });
}

export async function updateTest(id: string, input: UpdateProductTestInput) {
  return prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.productId !== undefined) data.productId = input.productId;
    if (input.videoUrl !== undefined) data.videoUrl = input.videoUrl?.trim() || null;
    if (input.estimatedCostPerPiece !== undefined)
      data.estimatedCostPerPiece = input.estimatedCostPerPiece;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    if (Object.keys(data).length > 0) {
      await tx.productTest.update({ where: { id }, data });
    }

    // Replace-all for the nested arrays when the caller sends them — keeps
    // edit flows simple (front-end sends the full current list).
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
          })),
        });
      }
    }

    return tx.productTest.findUnique({ where: { id }, include: TEST_INCLUDE });
  });
}

export async function deleteTest(id: string) {
  await prisma.productTest.delete({ where: { id } });
  return { ok: true };
}
