/**
 * Money → Expenses. Canonical home for expense CRUD. Replaces the
 * former Analytics expenses endpoints — Profit analytics still reads
 * the same Expense table, but CRUD lives here.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';

export interface ListExpensesParams {
  page?: number;
  pageSize?: number;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  date: string;
  fileUrl?: string | null;
}

export interface UpdateExpenseInput {
  description?: string;
  amount?: number;
  date?: string;
  fileUrl?: string | null;
}

function dateRangeFilter(from?: string, to?: string): Prisma.ExpenseWhereInput {
  if (!from && !to) return {};
  const where: Prisma.ExpenseWhereInput = {};
  const f: Prisma.DateTimeFilter = {};
  if (from) f.gte = new Date(from);
  if (to) {
    const d = new Date(to);
    d.setHours(23, 59, 59, 999);
    f.lte = d;
  }
  where.date = f;
  return where;
}

export async function listExpenses(params: ListExpensesParams) {
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 25)));
  const where: Prisma.ExpenseWhereInput = {
    ...dateRangeFilter(params.dateFrom, params.dateTo),
    ...(params.search
      ? { description: { contains: params.search, mode: 'insensitive' as const } }
      : {}),
  };

  const [rows, total, sumAgg] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { addedBy: { select: { id: true, name: true } } },
    }),
    prisma.expense.count({ where }),
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    data: rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    totalAmount: sumAgg._sum.amount ?? 0,
  };
}

export async function createExpense(input: CreateExpenseInput, userId?: string) {
  const created = await prisma.expense.create({
    data: {
      description: input.description.trim(),
      amount: input.amount,
      date: new Date(input.date),
      fileUrl: input.fileUrl ?? null,
      addedById: userId ?? null,
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });
  // Notify admin/supervisor rooms — Money page is admin-only.
  emitToRoom('admin', 'expense:created', { id: created.id, ts: Date.now() });
  return created;
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const data: Prisma.ExpenseUpdateInput = {};
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.date !== undefined) data.date = new Date(input.date);
  if (input.fileUrl !== undefined) data.fileUrl = input.fileUrl;
  const updated = await prisma.expense.update({
    where: { id },
    data,
    include: { addedBy: { select: { id: true, name: true } } },
  });
  emitToRoom('admin', 'expense:updated', { id, ts: Date.now() });
  return updated;
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
  emitToRoom('admin', 'expense:deleted', { id, ts: Date.now() });
  return { ok: true };
}
