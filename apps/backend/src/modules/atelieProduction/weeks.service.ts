/**
 * Weekly cost-split groups for production runs.
 *
 * Workshop labor for a week (= Σ employees of WeeklyAttendance.daysWorked
 * × baseSalary / workingDays) is fixed by attendance. When 2-3 runs
 * share that week, we split the labor across them by one of three modes:
 *
 *   - by_pieces      : weight = pieces produced this week (default)
 *   - by_complexity  : weight = Σ(actualPieces × tracingMeters)
 *   - manual         : admin sets `laborManualShare` per run, must sum 100
 *
 * Until the week is `closed`, runs read laborCost = 0 and the UI shows
 * "pending split". Closing the week computes each run's share, writes it
 * to ProductionRun.laborCost, and stamps the week.
 */

import { prisma } from '../../shared/prisma';
import { logProduction } from './productionLog';

// Snap a date to Monday 00:00 UTC of its week (matches WeeklyAttendance.weekStart).
export function weekStartFor(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  // getUTCDay: 0 = Sunday … 6 = Saturday. Convert to Monday-based offset.
  const dayMon0 = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayMon0);
  return d;
}

/**
 * Find or create the ProductionWeek row for the week containing `date`.
 * Idempotent — safe to call from createRun even when the week exists.
 */
export async function ensureWeek(date: Date): Promise<{ id: string; weekStart: Date }> {
  const weekStart = weekStartFor(date);
  return prisma.productionWeek.upsert({
    where: { weekStart },
    update: {},
    create: { weekStart, updatedAt: new Date() },
    select: { id: true, weekStart: true },
  });
}

/**
 * Sum the workshop's labor cost for a given Monday-aligned week from the
 * existing WeeklyAttendance + AtelieEmployee records — no new data
 * needed. `daysWorked` is denormalized on attendance; combine with the
 * employee's daily rate (baseSalary / workingDays).
 */
async function computeLaborTotalForWeek(weekStart: Date): Promise<number> {
  const rows = await prisma.weeklyAttendance.findMany({
    where: { weekStart },
    include: {
      employee: { select: { baseSalary: true, workingDays: true, isActive: true } },
    },
  });
  let total = 0;
  for (const row of rows) {
    if (!row.employee.isActive) continue;
    const baseSalary = Number(row.employee.baseSalary);
    const workingDays = Math.max(1, row.employee.workingDays);
    const dailyRate = baseSalary / workingDays;
    total += row.daysWorked * dailyRate;
  }
  return total;
}

/**
 * Compute each run's projected share of the week's labor cost without
 * persisting anything. The week-detail UI calls this on every render so
 * the admin sees exactly what `closeWeek` will write.
 */
export async function projectWeekShares(weekStart: Date) {
  const week = await prisma.productionWeek.findUnique({
    where: { weekStart },
    include: {
      runs: {
        select: {
          id: true,
          reference: true,
          status: true,
          actualPieces: true,
          expectedPieces: true,
          laborAllocation: true,
          laborManualShare: true,
          laborCost: true,
          sizes: { select: { actualPieces: true, tracingMeters: true } },
          test: { select: { name: true } },
        },
      },
    },
  });
  if (!week) return null;

  const laborTotal = await computeLaborTotalForWeek(weekStart);

  // Three weights tracked per run; the admin's `laborAllocation` choice
  // picks which one drives the share. Manual mode skips the auto math.
  const weights = week.runs.map((run) => {
    const piecesWeight = run.actualPieces;
    const complexityWeight = run.sizes.reduce(
      (s, sz) => s + sz.actualPieces * sz.tracingMeters,
      0,
    );
    return { runId: run.id, piecesWeight, complexityWeight };
  });

  const totalPieces = weights.reduce((s, w) => s + w.piecesWeight, 0);
  const totalComplexity = weights.reduce((s, w) => s + w.complexityWeight, 0);

  const shares = week.runs.map((run, i) => {
    const w = weights[i];
    let share = 0;
    let mode = run.laborAllocation;
    if (mode === 'manual') {
      const pct = run.laborManualShare ? Number(run.laborManualShare) : 0;
      share = laborTotal * (pct / 100);
    } else if (mode === 'by_complexity' && totalComplexity > 0) {
      share = laborTotal * (w.complexityWeight / totalComplexity);
    } else if (mode === 'by_pieces' && totalPieces > 0) {
      // Default path — falls through to 0 when nothing has been produced
      // yet (week mid-sew). Closing then captures whatever has landed.
      share = laborTotal * (w.piecesWeight / totalPieces);
    }
    return {
      runId: run.id,
      reference: run.reference,
      status: run.status,
      sampleName: run.test?.name ?? null,
      actualPieces: run.actualPieces,
      expectedPieces: run.expectedPieces,
      mode,
      share: round2(share),
      currentLaborCost: Number(run.laborCost),
    };
  });

  // Manual-mode sanity check — admin must total 100 to close.
  const manualSum = week.runs
    .filter((r) => r.laborAllocation === 'manual')
    .reduce((s, r) => s + (r.laborManualShare ? Number(r.laborManualShare) : 0), 0);
  const manualValid =
    week.runs.every((r) => r.laborAllocation !== 'manual') ||
    Math.abs(manualSum - 100) < 0.01;

  return {
    weekId: week.id,
    weekStart: week.weekStart,
    closed: week.closed,
    closedAt: week.closedAt,
    laborTotal: round2(laborTotal),
    runs: shares,
    manualValid,
    manualSum: round2(manualSum),
  };
}

export async function listWeeks() {
  const weeks = await prisma.productionWeek.findMany({
    orderBy: { weekStart: 'desc' },
    include: {
      runs: {
        select: {
          id: true,
          status: true,
          actualPieces: true,
          laborCost: true,
        },
      },
    },
  });
  return weeks.map((w) => ({
    id: w.id,
    weekStart: w.weekStart,
    closed: w.closed,
    closedAt: w.closedAt,
    laborTotal: Number(w.laborTotal),
    runCount: w.runs.length,
    totalPieces: w.runs.reduce((s, r) => s + r.actualPieces, 0),
  }));
}

/**
 * Finalize the week — compute each run's share, write it to
 * ProductionRun.laborCost + recompute totalCost + costPerPiece, log
 * everything, then mark the week closed.
 */
export async function closeWeek(
  weekStart: Date,
  performedBy: { id: string; name: string },
) {
  const projection = await projectWeekShares(weekStart);
  if (!projection) {
    throw { statusCode: 404, code: 'NOT_FOUND', message: 'Week not found' };
  }
  if (projection.closed) {
    throw { statusCode: 400, code: 'ALREADY_CLOSED', message: 'Week already closed' };
  }
  if (!projection.manualValid) {
    throw {
      statusCode: 400,
      code: 'MANUAL_SHARE_MISMATCH',
      message: `Manual shares sum to ${projection.manualSum}%, expected 100%`,
    };
  }

  // Single transaction: write each run's labor + roll up totalCost +
  // costPerPiece, then close the week. If any step fails, the whole
  // close aborts so payroll never sees a half-applied split.
  await prisma.$transaction(async (tx) => {
    for (const r of projection.runs) {
      const run = await tx.productionRun.findUnique({
        where: { id: r.runId },
        select: { materialsCost: true, actualPieces: true },
      });
      if (!run) continue;
      const newLabor = r.share;
      const newTotal = Number(run.materialsCost) + newLabor;
      const newPerPiece = run.actualPieces > 0 ? newTotal / run.actualPieces : 0;
      await tx.productionRun.update({
        where: { id: r.runId },
        data: {
          laborCost: newLabor,
          totalCost: newTotal,
          costPerPiece: newPerPiece,
        },
      });
    }
    await tx.productionWeek.update({
      where: { weekStart },
      data: {
        closed: true,
        closedAt: new Date(),
        closedById: performedBy.id,
        laborTotal: projection.laborTotal,
      },
    });
  });

  // Audit-log every affected run so each run's history reflects the
  // labor split (not just the week page). Done outside the transaction
  // so a logging failure can't roll back payroll.
  for (const r of projection.runs) {
    await logProduction({
      runId: r.runId,
      type: 'labor',
      action: `Labor split (${r.mode}): ${r.share.toFixed(2)} MAD assigned (${
        projection.laborTotal > 0
          ? ((r.share / projection.laborTotal) * 100).toFixed(1)
          : '0'
      }% of week total ${projection.laborTotal.toFixed(2)} MAD)`,
      performedBy: performedBy.name,
      performedById: performedBy.id,
      meta: {
        weekStart: projection.weekStart,
        mode: r.mode,
        share: r.share,
        weekTotal: projection.laborTotal,
      },
    });
  }

  return projectWeekShares(weekStart);
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
