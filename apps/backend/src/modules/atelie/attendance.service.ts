/**
 * Attendance service — per-day tri-state toggle with auto-salary recalc.
 *
 * Each day is one of: absent / half / full. Internally we keep two 7-bit
 * masks (`daysMask` = full days, `halfDaysMask` = half days) so the UI can
 * render three distinct states with zero extra queries. Every cell toggle
 * upserts the WeeklyAttendance row AND its matching SalaryPayment row in a
 * single $transaction so the grid + salary table never disagree.
 */

import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
import {
  mondayOfWeekUTC,
  applyDayState,
  computeDaysWorked,
  computeWeekSalary,
} from './atelie.utils';
import type { ToggleDayInput } from './atelie.schema';

export async function toggleAttendanceDay(
  input: ToggleDayInput,
  recordedById: string,
) {
  const weekStart = mondayOfWeekUTC(new Date(input.weekStart));

  const employee = await prisma.atelieEmployee.findUnique({
    where: { id: input.employeeId },
  });
  if (!employee) throw new Error('Employee not found');

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.weeklyAttendance.findUnique({
      where: { employeeId_weekStart: { employeeId: input.employeeId, weekStart } },
    });

    const { daysMask: newMask, halfDaysMask: newHalfMask } = applyDayState(
      existing?.daysMask ?? 0,
      existing?.halfDaysMask ?? 0,
      input.dayIndex,
      input.state,
    );
    const newDaysWorked = computeDaysWorked(newMask, newHalfMask);

    const attendance = await tx.weeklyAttendance.upsert({
      where: { employeeId_weekStart: { employeeId: input.employeeId, weekStart } },
      create: {
        employeeId: input.employeeId,
        weekStart,
        daysMask: newMask,
        halfDaysMask: newHalfMask,
        daysWorked: newDaysWorked,
        recordedById,
      },
      update: {
        daysMask: newMask,
        halfDaysMask: newHalfMask,
        daysWorked: newDaysWorked,
        recordedById,
      },
    });

    const newAmount = computeWeekSalary(
      newDaysWorked,
      employee.baseSalary,
      employee.workingDays,
    );

    const salary = await tx.salaryPayment.upsert({
      where: { employeeId_weekStart: { employeeId: input.employeeId, weekStart } },
      create: {
        employeeId: input.employeeId,
        weekStart,
        amount: newAmount,
      },
      update: {
        // Don't clobber paidAmount/isPaid — only refresh the computed `amount`.
        amount: newAmount,
      },
    });

    return { attendance, salary };
  });

  emitToRoom('admin', 'atelie:attendance:updated', {
    employeeId: input.employeeId,
    weekStart: weekStart.toISOString(),
    daysMask: updated.attendance.daysMask,
    halfDaysMask: updated.attendance.halfDaysMask,
    daysWorked: updated.attendance.daysWorked,
    amount: updated.salary.amount,
  });

  return {
    weekStart: weekStart.toISOString(),
    daysMask: updated.attendance.daysMask,
    halfDaysMask: updated.attendance.halfDaysMask,
    daysWorked: updated.attendance.daysWorked,
    amount: updated.salary.amount,
    isPaid: updated.salary.isPaid,
    salaryId: updated.salary.id,
  };
}

export async function getWeeklyGrid(weekStartISO: string) {
  const weekStart = mondayOfWeekUTC(new Date(weekStartISO));
  const employees = await prisma.atelieEmployee.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
  const [attendance, salaries] = await Promise.all([
    prisma.weeklyAttendance.findMany({
      where: { weekStart, employeeId: { in: employees.map((e) => e.id) } },
    }),
    prisma.salaryPayment.findMany({
      where: { weekStart, employeeId: { in: employees.map((e) => e.id) } },
    }),
  ]);
  // Flat shape — the frontend grid consumes these fields directly without
  // needing to join employee + attendance on the client.
  return employees.map((e) => {
    const a = attendance.find((x) => x.employeeId === e.id);
    const s = salaries.find((x) => x.employeeId === e.id);
    return {
      employeeId: e.id,
      employeeName: e.name,
      role: e.role,
      baseSalary: e.baseSalary,
      workingDays: e.workingDays,
      daysMask: a?.daysMask ?? 0,
      halfDaysMask: a?.halfDaysMask ?? 0,
      daysWorked: a?.daysWorked ?? 0,
      amount: s?.amount ?? 0,
      isPaid: s?.isPaid ?? false,
      salaryId: s?.id ?? null,
    };
  });
}
