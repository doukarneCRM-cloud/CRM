/**
 * Salary service — list, pay, history.
 *
 * Salary rows are created/updated by the attendance service on every toggle.
 * This service handles the payment side: marking weeks as paid, listing
 * historical weeks for an employee, and returning a week-scoped payroll view.
 */

import { prisma } from '../../shared/prisma';
import { computeDaysWorked, mondayOfWeekUTC } from './atelie.utils';
import type { PaySalaryInput, UpdateSalaryExtrasInput } from './atelie.schema';

export async function listWeekSalaries(weekStartISO: string) {
  const weekStart = mondayOfWeekUTC(new Date(weekStartISO));
  const [salaries, attendance] = await Promise.all([
    prisma.salaryPayment.findMany({
      where: { weekStart },
      include: {
        employee: { select: { id: true, name: true, role: true, baseSalary: true, workingDays: true } },
        paidBy: { select: { id: true, name: true } },
      },
      orderBy: { employee: { name: 'asc' } },
    }),
    prisma.weeklyAttendance.findMany({
      where: { weekStart },
      select: { employeeId: true, daysMask: true, halfDaysMask: true },
    }),
  ]);
  const attMap = new Map(attendance.map((a) => [a.employeeId, a]));
  return salaries.map((s) => {
    const att = attMap.get(s.employeeId);
    const daysWorked = att ? computeDaysWorked(att.daysMask, att.halfDaysMask) : 0;
    // Prisma's Decimal type serializes to string in JSON. Coerce to number
    // here so the frontend can do arithmetic without a Number() boundary
    // wrapper everywhere.
    return {
      id: s.id,
      employeeId: s.employeeId,
      employee: s.employee,
      weekStart: s.weekStart.toISOString(),
      amount: Number(s.amount),
      paidAmount: Number(s.paidAmount),
      isPaid: s.isPaid,
      paidAt: s.paidAt?.toISOString() ?? null,
      paidBy: s.paidBy,
      notes: s.notes,
      commission: Number(s.commission),
      supplementHours: Number(s.supplementHours),
      daysWorked,
    };
  });
}

export async function paySalary(
  id: string,
  input: PaySalaryInput,
  paidById: string,
) {
  const existing = await prisma.salaryPayment.findUnique({ where: { id } });
  if (!existing) throw new Error('Salary record not found');
  return prisma.salaryPayment.update({
    where: { id },
    data: {
      isPaid: true,
      paidAmount: input.paidAmount ?? existing.amount,
      paidAt: new Date(),
      paidById,
      notes: input.notes ?? existing.notes,
    },
  });
}

export async function updateSalaryExtras(id: string, input: UpdateSalaryExtrasInput) {
  const existing = await prisma.salaryPayment.findUnique({ where: { id } });
  if (!existing) throw new Error('Salary record not found');
  return prisma.salaryPayment.update({
    where: { id },
    data: {
      ...(input.commission !== undefined ? { commission: input.commission } : {}),
      ...(input.supplementHours !== undefined ? { supplementHours: input.supplementHours } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
}

export async function unpaySalary(id: string) {
  return prisma.salaryPayment.update({
    where: { id },
    data: { isPaid: false, paidAmount: 0, paidAt: null, paidById: null },
  });
}

export async function getEmployeeSalaryHistory(employeeId: string, limit = 12) {
  const payments = await prisma.salaryPayment.findMany({
    where: { employeeId },
    orderBy: { weekStart: 'desc' },
    take: limit,
    include: { paidBy: { select: { id: true, name: true } } },
  });
  return payments.map((p) => ({
    id: p.id,
    weekStart: p.weekStart.toISOString(),
    amount: p.amount,
    paidAmount: p.paidAmount,
    isPaid: p.isPaid,
    paidAt: p.paidAt?.toISOString() ?? null,
    paidBy: p.paidBy,
  }));
}
