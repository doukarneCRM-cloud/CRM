/**
 * Weekly attendance seeder — ensures every active employee has a
 * WeeklyAttendance row for the current ISO week, created with daysMask=0.
 *
 * Runs on boot and then hourly. Idempotent via the [employeeId, weekStart]
 * unique index — re-running costs only one findMany + some no-op upserts.
 */

import { prisma } from '../../shared/prisma';
import { mondayOfWeekUTC, computeWeekSalary } from './atelie.utils';

const CRON_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function seedCurrentWeekForAllEmployees() {
  const weekStart = mondayOfWeekUTC(new Date());
  const employees = await prisma.atelieEmployee.findMany({
    where: { isActive: true },
    select: { id: true, baseSalary: true, workingDays: true },
  });
  if (employees.length === 0) return;

  await Promise.all(
    employees.flatMap((e) => [
      prisma.weeklyAttendance.upsert({
        where: { employeeId_weekStart: { employeeId: e.id, weekStart } },
        create: { employeeId: e.id, weekStart, daysMask: 0, daysWorked: 0 },
        update: {}, // no-op — don't touch existing attendance
      }),
      prisma.salaryPayment.upsert({
        where: { employeeId_weekStart: { employeeId: e.id, weekStart } },
        create: {
          employeeId: e.id,
          weekStart,
          amount: computeWeekSalary(0, e.baseSalary, e.workingDays),
        },
        update: {}, // no-op — attendance toggles own the running amount
      }),
    ]),
  );
}

export function startAttendanceCron() {
  seedCurrentWeekForAllEmployees().catch((err) => {
    console.error('[Atelie] initial attendance seed failed', err);
  });
  setInterval(() => {
    seedCurrentWeekForAllEmployees().catch((err) => {
      console.error('[Atelie] hourly attendance seed failed', err);
    });
  }, CRON_INTERVAL_MS);
}
