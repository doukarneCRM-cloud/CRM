/**
 * Salary service — list, pay, history.
 *
 * Salary rows are created/updated by the attendance service on every toggle.
 * This service handles the payment side: marking weeks as paid, listing
 * historical weeks for an employee, and returning a week-scoped payroll view.
 */

import { prisma } from '../../shared/prisma';
import { mondayOfWeekUTC } from './atelie.utils';
import type { PaySalaryInput } from './atelie.schema';

export async function listWeekSalaries(weekStartISO: string) {
  const weekStart = mondayOfWeekUTC(new Date(weekStartISO));
  const salaries = await prisma.salaryPayment.findMany({
    where: { weekStart },
    include: {
      employee: { select: { id: true, name: true, role: true, baseSalary: true, workingDays: true } },
      paidBy: { select: { id: true, name: true } },
    },
    orderBy: { employee: { name: 'asc' } },
  });
  return salaries.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    employee: s.employee,
    weekStart: s.weekStart.toISOString(),
    amount: s.amount,
    paidAmount: s.paidAmount,
    isPaid: s.isPaid,
    paidAt: s.paidAt?.toISOString() ?? null,
    paidBy: s.paidBy,
    notes: s.notes,
  }));
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
