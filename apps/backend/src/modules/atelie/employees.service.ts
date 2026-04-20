/**
 * Atelie employees service — CRUD + aggregated KPIs.
 *
 * Soft delete (isActive=false) is preferred so historical attendance/salary
 * records remain joinable. Hard delete is not exposed.
 */

import { prisma } from '../../shared/prisma';
import { mondayOfWeekUTC, computeWeekSalary } from './atelie.utils';
import type { CreateEmployeeInput, UpdateEmployeeInput } from './atelie.schema';

export async function listEmployees(opts: { activeOnly?: boolean } = {}) {
  const employees = await prisma.atelieEmployee.findMany({
    where: opts.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  });

  // Attach current-week attendance + salary row for each, so the UI can render
  // the grid + salary summary in one round-trip.
  const weekStart = mondayOfWeekUTC(new Date());
  const [attendance, salaries] = await Promise.all([
    prisma.weeklyAttendance.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) }, weekStart },
    }),
    prisma.salaryPayment.findMany({
      where: { employeeId: { in: employees.map((e) => e.id) }, weekStart },
    }),
  ]);

  return employees.map((e) => {
    const a = attendance.find((x) => x.employeeId === e.id);
    const s = salaries.find((x) => x.employeeId === e.id);
    const daysWorked = a?.daysWorked ?? 0;
    return {
      ...e,
      currentWeek: {
        weekStart: weekStart.toISOString(),
        daysMask: a?.daysMask ?? 0,
        halfDaysMask: a?.halfDaysMask ?? 0,
        daysWorked,
        amount: s?.amount ?? computeWeekSalary(daysWorked, e.baseSalary, e.workingDays),
        isPaid: s?.isPaid ?? false,
        salaryId: s?.id ?? null,
      },
    };
  });
}

export async function createEmployee(input: CreateEmployeeInput) {
  return prisma.atelieEmployee.create({
    data: {
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      role: input.role.trim(),
      baseSalary: input.baseSalary,
      workingDays: input.workingDays ?? 6,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.phone !== undefined) data.phone = input.phone?.trim() || null;
  if (input.role !== undefined) data.role = input.role.trim();
  if (input.baseSalary !== undefined) data.baseSalary = input.baseSalary;
  if (input.workingDays !== undefined) data.workingDays = input.workingDays;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.atelieEmployee.update({ where: { id }, data });
}

export async function deactivateEmployee(id: string) {
  return prisma.atelieEmployee.update({
    where: { id },
    data: { isActive: false },
  });
}

/**
 * Aggregated KPIs across the employee's full attendance + payment history.
 * Also returns the last 12 weeks as a sparkline series for the UI.
 */
export async function getEmployeeKpis(id: string) {
  const employee = await prisma.atelieEmployee.findUnique({ where: { id } });
  if (!employee) throw new Error('Employee not found');

  const [attendance, payments] = await Promise.all([
    prisma.weeklyAttendance.findMany({
      where: { employeeId: id },
      orderBy: { weekStart: 'desc' },
    }),
    prisma.salaryPayment.findMany({
      where: { employeeId: id },
      orderBy: { weekStart: 'desc' },
    }),
  ]);

  const totalWeeks = attendance.length;
  const totalDaysPresent = attendance.reduce((s, a) => s + a.daysWorked, 0);
  const avgDaysPerWeek = totalWeeks > 0 ? totalDaysPresent / totalWeeks : 0;
  const attendanceRate =
    totalWeeks > 0 ? totalDaysPresent / (totalWeeks * employee.workingDays) : 0;

  const totalEarned = payments.reduce((s, p) => s + p.amount, 0);
  const totalPaid = payments.reduce((s, p) => s + p.paidAmount, 0);
  const outstanding = Math.max(0, totalEarned - totalPaid);

  // Longest streak of "full" weeks (daysWorked >= workingDays).
  const sortedAsc = [...attendance].sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
  );
  let longestStreak = 0;
  let current = 0;
  for (const w of sortedAsc) {
    if (w.daysWorked >= employee.workingDays) {
      current += 1;
      longestStreak = Math.max(longestStreak, current);
    } else {
      current = 0;
    }
  }

  // Last 12 weeks — zip attendance with salaries for a sparkline.
  const weekly = attendance.slice(0, 12).map((a) => {
    const pay = payments.find((p) => p.weekStart.getTime() === a.weekStart.getTime());
    return {
      weekStart: a.weekStart.toISOString(),
      daysWorked: a.daysWorked,
      amount: pay?.amount ?? 0,
      isPaid: pay?.isPaid ?? false,
    };
  });

  return {
    employee,
    totalWeeks,
    totalDaysPresent,
    avgDaysPerWeek: Math.round(avgDaysPerWeek * 100) / 100,
    attendanceRate: Math.round(attendanceRate * 1000) / 1000,
    totalEarned,
    totalPaid,
    outstanding,
    longestStreak,
    weekly,
  };
}
