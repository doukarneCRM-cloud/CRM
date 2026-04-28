/**
 * Admin-editable Coliix mapping service.
 *
 * The list endpoint surfaces every known Coliix wording with live order
 * counts so the admin can see impact before clicking. The update endpoint
 * runs a single transaction that rewrites every affected order's
 * shippingStatus + deliveredAt to match the new mapping, writes per-order
 * audit logs, invalidates the in-memory cache, and emits a dashboard
 * refresh socket so KPIs re-render live.
 */

import type { Prisma, ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
import { invalidateColiixMappingCache } from './coliixMappingCache';

export interface MappingListEntry {
  coliixWording: string;
  internalStatus: ShippingStatus | null;
  note: string | null;
  updatedAt: Date;
  // Total orders whose coliixRawState equals this wording.
  orderCount: number;
  // How many of those orders are currently in each shippingStatus bucket.
  // Surfaces drift when an old wording maps to one bucket but historical
  // orders sit in another (admin can spot it and click Re-map all).
  currentBucketCounts: Record<string, number>;
}

export async function listMappings(): Promise<MappingListEntry[]> {
  const [mappings, counts] = await Promise.all([
    prisma.coliixStatusMapping.findMany({
      select: {
        coliixWording: true,
        internalStatus: true,
        note: true,
        updatedAt: true,
      },
    }),
    prisma.order.groupBy({
      by: ['coliixRawState', 'shippingStatus'],
      where: { coliixRawState: { not: null } },
      _count: { _all: true },
    }),
  ]);

  // Build a wording → { total, bucketCounts } map from the groupBy rows.
  const byWording = new Map<
    string,
    { total: number; buckets: Record<string, number> }
  >();
  for (const row of counts) {
    const key = (row.coliixRawState ?? '').trim();
    if (!key) continue;
    const entry = byWording.get(key) ?? { total: 0, buckets: {} };
    entry.total += row._count._all;
    entry.buckets[row.shippingStatus] = (entry.buckets[row.shippingStatus] ?? 0) + row._count._all;
    byWording.set(key, entry);
  }

  return mappings
    .map((m) => {
      const stats = byWording.get(m.coliixWording.trim()) ?? { total: 0, buckets: {} };
      return {
        coliixWording: m.coliixWording,
        internalStatus: m.internalStatus,
        note: m.note,
        updatedAt: m.updatedAt,
        orderCount: stats.total,
        currentBucketCounts: stats.buckets,
      };
    })
    .sort((a, b) => {
      // Most-impactful wordings first. Tie-break alphabetically so the
      // list stays stable across renders for unchanged data.
      if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
      return a.coliixWording.localeCompare(b.coliixWording);
    });
}

export interface UpdateMappingResult {
  mapping: {
    coliixWording: string;
    internalStatus: ShippingStatus | null;
    note: string | null;
    updatedAt: Date;
  };
  // Number of Order rows whose shippingStatus actually changed as a
  // result of this save. UI shows this as "Re-bucketed N orders".
  affected: number;
}

/**
 * Update a single mapping and re-bucket every order with that wording.
 *
 * The CASE statement handles all four transitions atomically:
 *   - null → enum         (admin newly maps a wording)
 *   - enum A → enum B     (admin re-maps to a different bucket)
 *   - enum → null + delivered   → demote to 'picked_up', clear deliveredAt
 *   - enum → null + non-delivered → leave shippingStatus alone (the wording
 *                                    is going back to "stay raw" but its
 *                                    current bucket is still defensible)
 *
 * The migration that does the same thing as a one-shot
 * (20260428200000_demote_stale_delivered_orders) becomes obsolete going
 * forward — admins now drive demotes through the UI.
 */
export async function updateMapping(
  rawWording: string,
  internalStatus: ShippingStatus | null,
  actorId: string,
  note?: string | null,
): Promise<UpdateMappingResult> {
  const wording = rawWording.trim();
  if (!wording) {
    throw new Error('coliixWording must be a non-empty string');
  }

  // Single transaction so the mapping flip and the order-bucket rewrite
  // can't disagree halfway through.
  const result = await prisma.$transaction(async (tx) => {
    // Upsert so the first save on a previously-unseen wording (rare —
    // ingestStatus seeds them — but keeps the API forgiving) just works.
    const upserted = await tx.coliixStatusMapping.upsert({
      where: { coliixWording: wording },
      create: {
        coliixWording: wording,
        internalStatus,
        note: note ?? null,
        updatedById: actorId,
      },
      update: {
        internalStatus,
        ...(note !== undefined ? { note } : {}),
        updatedById: actorId,
      },
    });

    // Bulk re-bucket. We use $executeRaw with a single CASE so all four
    // transitions are atomic at the row level.
    const affectedRows = await tx.$executeRaw`
      UPDATE "Order"
      SET
        "shippingStatus" = CASE
          WHEN ${internalStatus}::"ShippingStatus" IS NULL
            AND "shippingStatus" = 'delivered'
              THEN 'picked_up'::"ShippingStatus"
          WHEN ${internalStatus}::"ShippingStatus" IS NULL
              THEN "shippingStatus"
          ELSE ${internalStatus}::"ShippingStatus"
        END,
        "deliveredAt" = CASE
          WHEN ${internalStatus}::"ShippingStatus" = 'delivered'
            AND "deliveredAt" IS NULL
              THEN NOW()
          WHEN ${internalStatus}::"ShippingStatus" IS DISTINCT FROM 'delivered'::"ShippingStatus"
            AND "shippingStatus" = 'delivered'
              THEN NULL
          ELSE "deliveredAt"
        END,
        "lastTrackedAt" = NOW()
      WHERE "coliixRawState" = ${wording}
        AND (
          "shippingStatus" IS DISTINCT FROM
            CASE
              WHEN ${internalStatus}::"ShippingStatus" IS NULL
                AND "shippingStatus" = 'delivered'
                  THEN 'picked_up'::"ShippingStatus"
              WHEN ${internalStatus}::"ShippingStatus" IS NULL
                  THEN "shippingStatus"
              ELSE ${internalStatus}::"ShippingStatus"
            END
        );
    `;

    return { upserted, affected: Number(affectedRows ?? 0) };
  });

  // Invalidate the cache AFTER commit so concurrent webhooks during the
  // transaction don't repopulate stale data. Worst-case race: a webhook
  // landing ~1 ms before the invalidation reads the old rule and writes
  // the old enum on the order; the next webhook 5 min later corrects it.
  invalidateColiixMappingCache();

  if (result.affected > 0) {
    // Audit row per affected order — same shape as remap so the order-
    // history modal renders these alongside future re-maps.
    const affectedOrders = await prisma.order.findMany({
      where: { coliixRawState: wording },
      select: { id: true, shippingStatus: true },
    });
    if (affectedOrders.length > 0) {
      await prisma.orderLog.createMany({
        data: affectedOrders.map((o) => ({
          orderId: o.id,
          type: 'shipping' as const,
          action: `Coliix mapping change: "${wording}" → ${internalStatus ?? '(stay raw)'}`,
          performedBy: 'System',
          meta: {
            provider: 'coliix',
            rawState: wording,
            newMapping: internalStatus,
            currentStatus: o.shippingStatus,
            source: 'mapping_save',
          } as Prisma.InputJsonValue,
        })),
      });
    }
    emitToRoom('orders:all', 'order:bulk_updated', { coliixRawState: wording });
    emitToRoom('dashboard', 'kpi:refresh', {});
  }

  return {
    mapping: {
      coliixWording: result.upserted.coliixWording,
      internalStatus: result.upserted.internalStatus,
      note: result.upserted.note,
      updatedAt: result.upserted.updatedAt,
    },
    affected: result.affected,
  };
}
