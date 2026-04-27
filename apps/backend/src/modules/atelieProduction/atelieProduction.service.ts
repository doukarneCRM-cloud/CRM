/**
 * Production runs — the active build stage. A run consumes specific fabric
 * rolls (decrementing remainingLength) and accessories (via MaterialMovement),
 * tracks employees assigned, and rolls up into a cost-per-piece snapshot.
 *
 * `reference` is generated from a Counter row (PR-YY-XXXXX).
 * `ProductVariant.costPrice` is NEVER auto-updated — the admin keeps that
 * manual so existing analytics / profit numbers don't shift silently.
 */

import { prisma } from '../../shared/prisma';
import { computeRunCost } from './costCalc';
import { ensureWeek } from './weeks.service';
import { logProduction } from './productionLog';
import type {
  CreateRunInput,
  UpdateRunInput,
  ConsumeInput,
} from './atelieProduction.schema';

const RUN_INCLUDE = {
  test: { select: { id: true, name: true } },
  product: { select: { id: true, name: true } },
  fabrics: { include: { fabricType: true } },
  sizes: true,
  workers: { include: { employee: { select: { id: true, name: true, role: true } } } },
  consumptions: {
    include: {
      fabricRoll: { include: { fabricType: true } },
      material: { select: { id: true, name: true, unit: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} as const;

async function generateRunReference(): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const key = `production_run_ref_${year}`;
  const counter = await prisma.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `PR-${year}-${String(counter.value).padStart(5, '0')}`;
}

export async function listRuns(opts: { status?: string; from?: string; to?: string }) {
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.from || opts.to) {
    const startDate: Record<string, Date> = {};
    if (opts.from) startDate.gte = new Date(opts.from);
    if (opts.to) {
      const d = new Date(opts.to);
      d.setHours(23, 59, 59, 999);
      startDate.lte = d;
    }
    where.startDate = startDate;
  }
  return prisma.productionRun.findMany({
    where,
    include: RUN_INCLUDE,
    orderBy: { startDate: 'desc' },
  });
}

export async function getRun(id: string) {
  return prisma.productionRun.findUnique({ where: { id }, include: RUN_INCLUDE });
}

export async function createRun(input: CreateRunInput) {
  const reference = await generateRunReference();

  const expectedPieces = (input.sizes ?? []).reduce((s, x) => s + x.expectedPieces, 0);

  // Pin the run to a ProductionWeek so the week-close cost split has a
  // membership query. We do this OUTSIDE the transaction because
  // ensureWeek's upsert on a separate connection would deadlock against
  // a long-running tx — and it's idempotent so a retry is harmless.
  const startDate = new Date(input.startDate);
  const week = await ensureWeek(startDate);

  const run = await prisma.$transaction(async (tx) => {
    const created = await tx.productionRun.create({
      data: {
        reference,
        testId: input.testId ?? null,
        productId: input.productId ?? null,
        status: 'draft',
        startDate,
        endDate: input.endDate ? new Date(input.endDate) : null,
        notes: input.notes?.trim() || null,
        expectedPieces,
        weekId: week.id,
      },
    });

    if (input.fabrics?.length) {
      await tx.productionRunFabric.createMany({
        data: input.fabrics.map((f) => ({
          runId: created.id,
          fabricTypeId: f.fabricTypeId,
          role: f.role.trim(),
        })),
      });
    }
    if (input.sizes?.length) {
      await tx.productionRunSize.createMany({
        data: input.sizes.map((s) => ({
          runId: created.id,
          size: s.size.trim(),
          tracingMeters: s.tracingMeters,
          expectedPieces: s.expectedPieces,
          actualPieces: s.actualPieces ?? 0,
          variantId: s.variantId ?? null,
        })),
      });
    }
    if (input.workerIds?.length) {
      await tx.productionRunWorker.createMany({
        data: input.workerIds.map((employeeId) => ({
          runId: created.id,
          employeeId,
        })),
      });
    }

    return tx.productionRun.findUnique({ where: { id: created.id }, include: RUN_INCLUDE });
  });

  // Audit-log run creation outside the transaction. Failure here is
  // non-blocking — the run exists, the log is best effort.
  if (run) {
    void logProduction({
      runId: run.id,
      type: 'system',
      action: `Run ${run.reference} created (week starting ${week.weekStart.toISOString().slice(0, 10)})`,
      meta: { weekId: week.id, weekStart: week.weekStart },
    }).catch(() => undefined);
  }

  return run;
}

export async function updateRun(id: string, input: UpdateRunInput) {
  const existing = await prisma.productionRun.findUnique({ where: { id } });
  if (!existing) throw new Error('Run not found');
  if (existing.status === 'finished') {
    throw new Error('Finished runs are locked');
  }

  const result = await prisma.$transaction(async (tx) => {
    const data: Record<string, unknown> = {};
    if (input.startDate !== undefined) data.startDate = new Date(input.startDate);
    if (input.endDate !== undefined)
      data.endDate = input.endDate ? new Date(input.endDate) : null;
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = input.notes?.trim() || null;

    if (input.sizes) {
      const expectedPieces = input.sizes.reduce((s, x) => s + x.expectedPieces, 0);
      const actualPieces = input.sizes.reduce((s, x) => s + (x.actualPieces ?? 0), 0);
      data.expectedPieces = expectedPieces;
      data.actualPieces = actualPieces;
    }

    if (Object.keys(data).length > 0) {
      await tx.productionRun.update({ where: { id }, data });
    }

    if (input.fabrics) {
      await tx.productionRunFabric.deleteMany({ where: { runId: id } });
      if (input.fabrics.length) {
        await tx.productionRunFabric.createMany({
          data: input.fabrics.map((f) => ({
            runId: id,
            fabricTypeId: f.fabricTypeId,
            role: f.role.trim(),
          })),
        });
      }
    }
    if (input.sizes) {
      await tx.productionRunSize.deleteMany({ where: { runId: id } });
      if (input.sizes.length) {
        await tx.productionRunSize.createMany({
          data: input.sizes.map((s) => ({
            runId: id,
            size: s.size.trim(),
            tracingMeters: s.tracingMeters,
            expectedPieces: s.expectedPieces,
            actualPieces: s.actualPieces ?? 0,
            variantId: s.variantId ?? null,
          })),
        });
      }
    }

    return tx.productionRun.findUnique({ where: { id }, include: RUN_INCLUDE });
  });

  // Recompute when anything material / date / actuals changed.
  await computeRunCost(id);
  return result;
}

export async function addWorker(runId: string, employeeId: string) {
  await prisma.productionRunWorker.upsert({
    where: { runId_employeeId: { runId, employeeId } },
    create: { runId, employeeId },
    update: {},
  });
  await computeRunCost(runId);
  return getRun(runId);
}

export async function removeWorker(runId: string, employeeId: string) {
  await prisma.productionRunWorker.deleteMany({ where: { runId, employeeId } });
  await computeRunCost(runId);
  return getRun(runId);
}

export async function consume(runId: string, input: ConsumeInput, userId: string) {
  if (input.sourceType === 'fabric_roll' && !input.fabricRollId) {
    throw new Error('fabricRollId required for fabric_roll consumption');
  }
  if (input.sourceType === 'accessory' && !input.materialId) {
    throw new Error('materialId required for accessory consumption');
  }

  await prisma.$transaction(async (tx) => {
    const run = await tx.productionRun.findUnique({ where: { id: runId } });
    if (!run) throw new Error('Run not found');
    if (run.status === 'finished' || run.status === 'cancelled') {
      throw new Error('Run is locked');
    }

    if (input.sourceType === 'fabric_roll' && input.fabricRollId) {
      const roll = await tx.fabricRoll.findUnique({ where: { id: input.fabricRollId } });
      if (!roll) throw new Error('Fabric roll not found');
      if (roll.remainingLength < input.quantity) {
        throw new Error(
          `Cannot consume ${input.quantity}m — only ${roll.remainingLength}m left on this roll`,
        );
      }
      const newRemaining = roll.remainingLength - input.quantity;
      await tx.fabricRoll.update({
        where: { id: roll.id },
        data: {
          remainingLength: newRemaining,
          isDepleted: newRemaining <= 0,
        },
      });
      await tx.productionConsumption.create({
        data: {
          runId,
          sourceType: 'fabric_roll',
          fabricRollId: roll.id,
          quantity: input.quantity,
          unitCost: roll.unitCostPerMeter,
          createdById: userId,
        },
      });
    } else if (input.sourceType === 'accessory' && input.materialId) {
      const material = await tx.atelieMaterial.findUnique({ where: { id: input.materialId } });
      if (!material) throw new Error('Accessory not found');
      if (material.stock < input.quantity) {
        throw new Error(
          `Cannot consume ${input.quantity} ${material.unit} — only ${material.stock} left`,
        );
      }
      await tx.atelieMaterial.update({
        where: { id: material.id },
        data: { stock: material.stock - input.quantity },
      });
      const movement = await tx.materialMovement.create({
        data: {
          materialId: material.id,
          type: 'out',
          quantity: input.quantity,
          reason: `Production run ${run.reference}`,
          userId,
        },
      });
      await tx.productionConsumption.create({
        data: {
          runId,
          sourceType: 'accessory',
          materialId: material.id,
          movementId: movement.id,
          quantity: input.quantity,
          unitCost: material.unitCost ?? 0,
          createdById: userId,
        },
      });
    }
  });

  await computeRunCost(runId);
  return getRun(runId);
}

export async function finishRun(runId: string) {
  const run = await prisma.productionRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error('Run not found');
  if (run.status === 'finished') return run;

  await prisma.productionRun.update({
    where: { id: runId },
    data: {
      status: 'finished',
      endDate: run.endDate ?? new Date(),
    },
  });
  const breakdown = await computeRunCost(runId);

  void logProduction({
    runId,
    type: 'status',
    action: `Run finished — materials ${breakdown.materialsCost.toFixed(2)} MAD, ${breakdown.actualPieces} pieces (labor pending week close)`,
    meta: {
      materialsCost: breakdown.materialsCost,
      actualPieces: breakdown.actualPieces,
    },
  }).catch(() => undefined);

  return { ...(await getRun(runId)), breakdown };
}

export async function costBreakdown(runId: string) {
  return computeRunCost(runId);
}
