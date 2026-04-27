/**
 * Tiny helper around ProductionLog inserts. Centralized so service code
 * doesn't repeat the same `prisma.productionLog.create` boilerplate, and
 * so all production-side audit entries follow one shape.
 *
 * `performedBy` / `performedById` are optional — system-driven actions
 * (auto-finalization on week close, etc.) pass null and read as "System"
 * in the UI.
 */

import type { ProductionLogType, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';

interface LogInput {
  runId: string;
  type: ProductionLogType;
  action: string;
  performedBy?: string | null;
  performedById?: string | null;
  meta?: Prisma.InputJsonValue | null;
}

export async function logProduction(input: LogInput): Promise<void> {
  await prisma.productionLog.create({
    data: {
      runId: input.runId,
      type: input.type,
      action: input.action,
      performedBy: input.performedBy ?? null,
      performedById: input.performedById ?? null,
      // Prisma's Json field doesn't accept null directly — must use
      // Prisma.JsonNull when the caller wants to clear it.
      meta:
        input.meta == null
          ? undefined
          : (input.meta as Prisma.InputJsonValue),
    },
  });
}

export async function listProductionLogs(
  runId: string,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, opts.pageSize ?? 50));
  const [data, total] = await Promise.all([
    prisma.productionLog.findMany({
      where: { runId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.productionLog.count({ where: { runId } }),
  ]);
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}
