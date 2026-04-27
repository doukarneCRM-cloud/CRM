/**
 * Stage tracking on a production run. Stages are fixed:
 *   cut → sew → finish → qc → packed
 *
 * Rows are created lazily — `getOrInitStages` returns all five for the
 * UI even when only the first has been touched. `advanceStage` writes
 * input/output/rejected counts and stamps timestamps + an audit-log row.
 *
 * Yield carries forward: when a stage is marked complete, the NEXT
 * stage's `inputPieces` snaps to `outputPieces - rejectedPieces` so the
 * timeline visualises wastage at every step.
 */

import { ProductionStage } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { logProduction } from './productionLog';
import { emitToRoom } from '../../shared/socket';

export const STAGE_ORDER: ProductionStage[] = [
  'cut',
  'sew',
  'finish',
  'qc',
  'packed',
];

export async function getOrInitStages(runId: string) {
  // One round trip: fetch existing rows, find which stages are missing,
  // create them in a single createMany. Cheaper than five upserts.
  const existing = await prisma.productionRunStage.findMany({
    where: { runId },
    orderBy: { stage: 'asc' },
  });
  const have = new Set(existing.map((s) => s.stage));
  const missing = STAGE_ORDER.filter((s) => !have.has(s));
  if (missing.length > 0) {
    await prisma.productionRunStage.createMany({
      data: missing.map((stage) => ({ runId, stage })),
      skipDuplicates: true,
    });
  }
  return prisma.productionRunStage.findMany({
    where: { runId },
    // Force the canonical pipeline order regardless of insert order.
    orderBy: { stage: 'asc' },
  });
}

interface AdvanceInput {
  inputPieces?: number;
  outputPieces?: number;
  rejectedPieces?: number;
  notes?: string | null;
  // When true, marks completedAt and snaps the next stage's input.
  complete?: boolean;
}

export async function advanceStage(
  runId: string,
  stage: ProductionStage,
  input: AdvanceInput,
  performedBy: { id: string; name: string },
) {
  // Make sure the row exists before we update.
  await getOrInitStages(runId);

  const before = await prisma.productionRunStage.findUnique({
    where: { runId_stage: { runId, stage } },
  });
  if (!before) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'Stage row missing after init' };
  }

  const data: Record<string, unknown> = {};
  if (input.inputPieces !== undefined) data.inputPieces = input.inputPieces;
  if (input.outputPieces !== undefined) data.outputPieces = input.outputPieces;
  if (input.rejectedPieces !== undefined) data.rejectedPieces = input.rejectedPieces;
  if (input.notes !== undefined) data.notes = input.notes ?? null;

  // First write to a stage that was untouched starts the clock.
  if (!before.startedAt && Object.keys(data).length > 0) {
    data.startedAt = new Date();
  }

  if (input.complete) {
    data.completedAt = new Date();
  }

  await prisma.productionRunStage.update({
    where: { runId_stage: { runId, stage } },
    data,
  });

  // Yield carry-forward — only when actually completing this stage.
  if (input.complete) {
    const finalOutput =
      (input.outputPieces ?? before.outputPieces) -
      (input.rejectedPieces ?? before.rejectedPieces);
    const idx = STAGE_ORDER.indexOf(stage);
    const next = STAGE_ORDER[idx + 1];
    if (next && finalOutput > 0) {
      await prisma.productionRunStage.update({
        where: { runId_stage: { runId, stage: next } },
        data: { inputPieces: Math.max(0, finalOutput) },
      });
    }

    // Final stage hit → reflect total good pieces on the parent run so
    // KPI/list pages don't have to JOIN the stages table for this number.
    if (stage === 'packed') {
      await prisma.productionRun.update({
        where: { id: runId },
        data: { actualPieces: Math.max(0, finalOutput) },
      });
    }
  }

  // Audit log captures the meaningful diff. Yield (output - rejected) is
  // what the supervisor cares about; raw input is implied.
  const yieldGood =
    (input.outputPieces ?? before.outputPieces) -
    (input.rejectedPieces ?? before.rejectedPieces);
  await logProduction({
    runId,
    type: 'stage',
    action: input.complete
      ? `Stage '${stage}' completed: ${yieldGood} good (${input.rejectedPieces ?? before.rejectedPieces} rejected)`
      : `Stage '${stage}' updated: input=${input.inputPieces ?? before.inputPieces} · output=${input.outputPieces ?? before.outputPieces} · rejected=${input.rejectedPieces ?? before.rejectedPieces}`,
    performedBy: performedBy.name,
    performedById: performedBy.id,
    meta: {
      stage,
      before: {
        inputPieces: before.inputPieces,
        outputPieces: before.outputPieces,
        rejectedPieces: before.rejectedPieces,
      },
      after: {
        inputPieces: input.inputPieces ?? before.inputPieces,
        outputPieces: input.outputPieces ?? before.outputPieces,
        rejectedPieces: input.rejectedPieces ?? before.rejectedPieces,
      },
      complete: !!input.complete,
    },
  });

  // Real-time push so a supervisor watching the dashboard sees stage
  // moves immediately. Same socket layer the YouCan order import uses.
  emitToRoom('orders:all', 'production:stage', {
    runId,
    stage,
    complete: !!input.complete,
  });

  return prisma.productionRunStage.findMany({
    where: { runId },
    orderBy: { stage: 'asc' },
  });
}
