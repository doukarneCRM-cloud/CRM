/**
 * Cost-per-piece calculator.
 *
 *   materialsCost = Σ (consumption.quantity × consumption.unitCost)
 *
 *   laborCost     = Σ over each day of the run window,
 *                     for each assigned employee,
 *                       (baseSalary / workingDays) / #runs the employee is
 *                        active on that day, weighted by attendance
 *                        (full day = 1.0, half day = 0.5, absent = 0).
 *
 *   totalCost     = materialsCost + laborCost
 *   costPerPiece  = totalCost / max(actualPieces, 1)
 *
 * The result is persisted back on the run. `ProductVariant.costPrice` is
 * NOT auto-updated — the admin keeps that field manual so analytics COGS
 * doesn't shift under them.
 */

import { prisma } from '../../shared/prisma';

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay(); // 0=Sun … 6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  x.setDate(x.getDate() - diff);
  return x;
}

function bitIndex(date: Date): number {
  // Our mask uses bit 0=Mon … bit 6=Sun (see WeeklyAttendance schema comment).
  const dow = date.getDay();
  return (dow + 6) % 7;
}

function eachDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  while (cursor <= stop) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export interface DailyLaborRow {
  date: string;
  employeeId: string;
  employeeName: string;
  dailyRate: number;
  overlapCount: number;
  share: number;
  weight: number; // 1, 0.5, or 0
  contribution: number;
}

export interface CostBreakdown {
  materialsCost: number;
  laborCost: number;
  totalCost: number;
  costPerPiece: number;
  actualPieces: number;
  materials: Array<{
    sourceType: 'fabric_roll' | 'accessory';
    name: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
  }>;
  laborDaily: DailyLaborRow[];
}

export async function computeRunCost(runId: string): Promise<CostBreakdown> {
  const run = await prisma.productionRun.findUnique({
    where: { id: runId },
    include: {
      consumptions: {
        include: {
          fabricRoll: { include: { fabricType: true } },
          material: true,
        },
      },
      workers: { include: { employee: true } },
    },
  });
  if (!run) throw new Error('Run not found');

  // ── Materials cost ───────────────────────────────────────────────────────
  let materialsCost = 0;
  const materials = run.consumptions.map((c) => {
    const subtotal = c.quantity * c.unitCost;
    materialsCost += subtotal;
    const name =
      c.sourceType === 'fabric_roll'
        ? `${c.fabricRoll?.fabricType.name ?? 'Fabric'} / ${c.fabricRoll?.color ?? ''}`
        : c.material?.name ?? 'Accessory';
    return {
      sourceType: c.sourceType as 'fabric_roll' | 'accessory',
      name,
      quantity: c.quantity,
      unitCost: c.unitCost,
      subtotal,
    };
  });

  // ── Labor cost ───────────────────────────────────────────────────────────
  const start = run.startDate;
  const end = run.endDate ?? new Date();
  const days = eachDay(start, end);
  const laborDaily: DailyLaborRow[] = [];
  let laborCost = 0;

  // Pre-load attendance for all workers, across the weeks covered by the run.
  const weekStarts = Array.from(new Set(days.map((d) => mondayOf(d).toISOString())));
  const workerIds = run.workers.map((w) => w.employeeId);
  const attendanceRows = workerIds.length
    ? await prisma.weeklyAttendance.findMany({
        where: {
          employeeId: { in: workerIds },
          weekStart: { in: weekStarts.map((iso) => new Date(iso)) },
        },
      })
    : [];
  const attendanceMap = new Map<string, { days: number; halfs: number }>();
  for (const a of attendanceRows) {
    attendanceMap.set(`${a.employeeId}|${a.weekStart.toISOString()}`, {
      days: a.daysMask,
      halfs: a.halfDaysMask,
    });
  }

  for (const day of days) {
    const weekStartIso = mondayOf(day).toISOString();
    const idx = bitIndex(day);

    for (const w of run.workers) {
      const e = w.employee;
      const workingDays = Math.max(1, e.workingDays);
      const dailyRate = e.baseSalary / workingDays;

      // How many runs is this employee "active on" that day?
      const overlapCount = await prisma.productionRun.count({
        where: {
          status: { in: ['active', 'finished'] },
          workers: { some: { employeeId: e.id } },
          startDate: { lte: day },
          OR: [{ endDate: null }, { endDate: { gte: day } }],
        },
      });
      if (overlapCount === 0) continue;
      const share = dailyRate / overlapCount;

      const att = attendanceMap.get(`${e.id}|${weekStartIso}`);
      let weight = 0;
      if (att) {
        if ((att.days & (1 << idx)) !== 0) weight = 1;
        else if ((att.halfs & (1 << idx)) !== 0) weight = 0.5;
      }
      if (weight === 0) continue;
      const contribution = share * weight;
      laborCost += contribution;
      laborDaily.push({
        date: day.toISOString().slice(0, 10),
        employeeId: e.id,
        employeeName: e.name,
        dailyRate,
        overlapCount,
        share,
        weight,
        contribution,
      });
    }
  }

  const totalCost = materialsCost + laborCost;
  const actualPieces = Math.max(1, run.actualPieces);
  const costPerPiece = totalCost / actualPieces;

  // Persist the snapshot so listing endpoints don't need to recompute.
  await prisma.productionRun.update({
    where: { id: runId },
    data: {
      materialsCost,
      laborCost,
      totalCost,
      costPerPiece,
    },
  });

  return {
    materialsCost,
    laborCost,
    totalCost,
    costPerPiece,
    actualPieces: run.actualPieces,
    materials,
    laborDaily,
  };
}
