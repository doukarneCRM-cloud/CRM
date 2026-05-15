/**
 * Coliix integration error log — every failure path writes a row here so
 * the Errors tab in the UI surfaces what went wrong instead of swallowing
 * it. Errors are also broadcast on the socket so admins get a live toast.
 */

import type { ColiixErrorType } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { emitToRoom } from '../../../shared/socket';

export interface LogErrorInput {
  type: ColiixErrorType;
  message: string;
  shipmentId?: string | null;
  orderId?: string | null;
  accountId?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function logError(input: LogErrorInput) {
  const row = await prisma.coliixIntegrationError.create({
    data: {
      type: input.type,
      message: input.message,
      shipmentId: input.shipmentId ?? null,
      orderId: input.orderId ?? null,
      accountId: input.accountId ?? null,
      meta: (input.meta ?? null) as never,
    },
  });
  // Toast + live-list payload. Send the full row so the Errors tab can
  // prepend it surgically without an extra fetch round-trip. The frontend
  // filters by integrations:view permission before showing.
  emitToRoom('admin', 'coliix:error', {
    ...row,
    ts: Date.now(),
  });
  return row;
}

export interface ListErrorsParams {
  type?: ColiixErrorType;
  resolved?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listErrors(params: ListErrorsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
  const where = {
    ...(params.type ? { type: params.type } : {}),
    ...(params.resolved !== undefined ? { resolved: params.resolved } : {}),
  };
  const [rows, total, unresolved] = await Promise.all([
    prisma.coliixIntegrationError.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.coliixIntegrationError.count({ where }),
    prisma.coliixIntegrationError.count({ where: { resolved: false } }),
  ]);
  return {
    data: rows,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    unresolvedTotal: unresolved,
  };
}

export async function resolveError(id: string, actorId: string) {
  const row = await prisma.coliixIntegrationError.update({
    where: { id },
    data: { resolved: true, resolvedAt: new Date(), resolvedById: actorId },
  });
  // Tell every admin listener (sub-tab badge, sidebar pill, dashboards…)
  // that one fewer error is unresolved. Frontend decrements its local
  // counter without a count refetch.
  emitToRoom('admin', 'coliix:error:resolved', {
    id: row.id,
    ts: Date.now(),
  });
  return row;
}

export async function unresolvedCount(): Promise<number> {
  return prisma.coliixIntegrationError.count({ where: { resolved: false } });
}

/**
 * Bulk-resolve every still-unresolved error, optionally narrowed to a
 * single type (so the "Clear all" toolbar button can either nuke
 * everything or wipe just the noisy bucket the admin is filtering on).
 * Emits a single socket event so every connected admin's Errors tab
 * resets its counters without re-fetching.
 */
export async function resolveAllErrors(
  actorId: string,
  opts: { type?: ColiixErrorType } = {},
): Promise<{ count: number }> {
  const result = await prisma.coliixIntegrationError.updateMany({
    where: {
      resolved: false,
      ...(opts.type ? { type: opts.type } : {}),
    },
    data: { resolved: true, resolvedAt: new Date(), resolvedById: actorId },
  });
  emitToRoom('admin', 'coliix:error:bulk_resolved', {
    count: result.count,
    type: opts.type ?? null,
    ts: Date.now(),
  });
  return { count: result.count };
}
