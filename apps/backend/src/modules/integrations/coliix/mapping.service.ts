/**
 * Coliix status mapping — translates the literal wording Coliix sends on
 * its webhook (e.g. "Ramassé", "Livré", "Hub Casablanca") into our
 * internal ShipmentState enum.
 *
 * The table is admin-editable. Every webhook arrival looks up its raw
 * wording here:
 *   - hit with internalState set → bucket the shipment into that state
 *   - hit with internalState=null → leave shipment.state alone, but log
 *     the raw wording on the shipment so the admin can see what Coliix
 *     said and assign a state retroactively
 *   - miss → upsert a row with internalState=null + log the unknown so
 *     it appears on the Mappings tab with an orange "needs review" badge
 *
 * The lookup is hot — every webhook hits it — so we keep a 60-second
 * in-memory cache, invalidated explicitly on every write.
 */

import type { ShipmentState } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { emitToRoom, emitOrderUpdated } from '../../../shared/socket';
import { logError } from './errors.service';
import { STATE_LABEL, STATE_TO_SHIPPING } from './events.service';

// ─── In-memory cache ────────────────────────────────────────────────────────

interface CachedRow {
  internalState: ShipmentState | null;
  isTerminal: boolean;
}

const CACHE_TTL_MS = 60_000;
let cache: { loadedAt: number; byLowerWording: Map<string, CachedRow> } | null = null;

async function getCache() {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) return cache.byLowerWording;
  const rows = await prisma.coliixStatusMapping.findMany({
    select: { rawWording: true, internalState: true, isTerminal: true },
  });
  const map = new Map<string, CachedRow>();
  for (const r of rows) {
    map.set(r.rawWording.toLowerCase(), {
      internalState: r.internalState,
      isTerminal: r.isTerminal,
    });
  }
  cache = { loadedAt: now, byLowerWording: map };
  return map;
}

function invalidateCache() {
  cache = null;
}

// ─── Lookup (hot path, used by webhook ingest) ──────────────────────────────

export interface LookupResult {
  matched: boolean; // false = wording not in table at all
  internalState: ShipmentState | null;
  isTerminal: boolean;
}

export async function lookupWording(rawWording: string): Promise<LookupResult> {
  const trimmed = rawWording.trim();
  if (!trimmed) return { matched: false, internalState: null, isTerminal: false };
  const map = await getCache();
  const hit = map.get(trimmed.toLowerCase());
  if (!hit) return { matched: false, internalState: null, isTerminal: false };
  return { matched: true, internalState: hit.internalState, isTerminal: hit.isTerminal };
}

/**
 * Auto-discover: a wording arrived via webhook that we've never seen.
 * Insert it with internalState=null + log the unknown so an admin sees
 * the orange badge on the Mappings tab and can assign the right enum
 * value when convenient.
 */
export async function upsertUnknownWording(
  rawWording: string,
  meta?: { shipmentId?: string; orderId?: string },
) {
  const trimmed = rawWording.trim();
  if (!trimmed) return;
  // upsert is keyed on rawWording (unique). If admin already mapped it
  // between cache-load and now, we won't overwrite their internalState
  // because we only set fields on `create`.
  await prisma.coliixStatusMapping.upsert({
    where: { rawWording: trimmed },
    create: { rawWording: trimmed, internalState: null, isTerminal: false },
    update: {}, // no-op if it already exists
  });
  invalidateCache();
  await logError({
    type: 'mapping_unknown_wording',
    message: `Coliix sent an unmapped status wording: "${trimmed}"`,
    shipmentId: meta?.shipmentId ?? null,
    orderId: meta?.orderId ?? null,
    meta: { rawWording: trimmed },
  });
}

// ─── List + filters (Mappings tab) ──────────────────────────────────────────

export interface MappingRow {
  id: string;
  rawWording: string;
  internalState: ShipmentState | null;
  isTerminal: boolean;
  note: string | null;
  // How many shipments + events use this wording — drives the "in use"
  // column on the Mappings tab so admin sees what they'll affect when
  // they save.
  usageShipments: number;
  usageEvents: number;
  updatedAt: Date;
  updatedById: string | null;
}

export interface ListMappingsParams {
  search?: string;
  // All | only-mapped | only-unknown (auto-discovered, internalState null)
  filter?: 'all' | 'mapped' | 'unknown';
}

export async function listMappings(params: ListMappingsParams = {}): Promise<MappingRow[]> {
  const where = {
    ...(params.search && params.search.trim()
      ? { rawWording: { contains: params.search.trim(), mode: 'insensitive' as const } }
      : {}),
    ...(params.filter === 'mapped' ? { internalState: { not: null } } : {}),
    ...(params.filter === 'unknown' ? { internalState: null } : {}),
  };
  const rows = await prisma.coliixStatusMapping.findMany({
    where,
    orderBy: [{ internalState: 'asc' }, { rawWording: 'asc' }],
  });

  // Usage counts — one query per axis, deduped on rawWording so we don't
  // do a separate query per row. Admin lists are small enough (tens of
  // rows) that this is faster than per-row aggregates.
  const wordings = rows.map((r) => r.rawWording);
  const [shipmentGroups, eventGroups] = wordings.length
    ? await Promise.all([
        prisma.shipment.groupBy({
          by: ['rawState'],
          where: { rawState: { in: wordings } },
          _count: { _all: true },
        }),
        prisma.shipmentEvent.groupBy({
          by: ['rawState'],
          where: { rawState: { in: wordings } },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const shipmentCount = new Map<string, number>();
  for (const g of shipmentGroups) {
    if (g.rawState) shipmentCount.set(g.rawState, g._count._all);
  }
  const eventCount = new Map<string, number>();
  for (const g of eventGroups) {
    if (g.rawState) eventCount.set(g.rawState, g._count._all);
  }

  return rows.map((r) => ({
    id: r.id,
    rawWording: r.rawWording,
    internalState: r.internalState,
    isTerminal: r.isTerminal,
    note: r.note,
    usageShipments: shipmentCount.get(r.rawWording) ?? 0,
    usageEvents: eventCount.get(r.rawWording) ?? 0,
    updatedAt: r.updatedAt,
    updatedById: r.updatedById,
  }));
}

// ─── Manual create / update / delete ────────────────────────────────────────

export interface UpsertMappingInput {
  rawWording: string;
  internalState?: ShipmentState | null;
  isTerminal?: boolean;
  note?: string | null;
  updatedById: string;
}

export async function createMapping(input: UpsertMappingInput) {
  const trimmed = input.rawWording.trim();
  if (!trimmed) {
    throw Object.assign(new Error('Raw wording required'), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  }
  const row = await prisma.coliixStatusMapping.create({
    data: {
      rawWording: trimmed,
      internalState: input.internalState ?? null,
      isTerminal: input.isTerminal ?? false,
      note: input.note ?? null,
      updatedById: input.updatedById,
    },
  });
  invalidateCache();
  // If admin pre-mapped it, apply to any historical events that already
  // have this wording (rare but possible — the same wording could have
  // been auto-discovered minutes earlier on a different event row).
  if (row.internalState) {
    await applyHistorical(row.rawWording, row.internalState);
  }
  return row;
}

export interface UpdateMappingInput {
  internalState?: ShipmentState | null;
  isTerminal?: boolean;
  note?: string | null;
  updatedById: string;
}

export async function updateMapping(id: string, input: UpdateMappingInput) {
  const before = await prisma.coliixStatusMapping.findUnique({ where: { id } });
  if (!before) {
    throw Object.assign(new Error('Mapping not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  const data: Record<string, unknown> = { updatedById: input.updatedById };
  if (input.internalState !== undefined) data.internalState = input.internalState;
  if (input.isTerminal !== undefined) data.isTerminal = input.isTerminal;
  if (input.note !== undefined) data.note = input.note;

  const row = await prisma.coliixStatusMapping.update({ where: { id }, data });
  invalidateCache();

  // Apply to historical when the internalState transitions from null →
  // something OR changes between two non-null values. Skips re-bucketing
  // when only the note/terminal flag changed.
  const stateChanged =
    input.internalState !== undefined && input.internalState !== before.internalState;
  if (stateChanged && row.internalState) {
    await applyHistorical(row.rawWording, row.internalState);
  }
  return row;
}

export async function deleteMapping(id: string) {
  await prisma.coliixStatusMapping.delete({ where: { id } });
  invalidateCache();
}

/**
 * Re-bucket every Shipment + ShipmentEvent that already used this raw
 * wording so the new mapping is reflected in historical data. Without
 * this, mapping a previously-unknown wording would only affect FUTURE
 * webhook events; the operator expects "save mapping" to fix the table.
 *
 * Also mirrors the new state to each parent Order — without that the
 * dashboard + Orders list would still show the old status until the
 * next webhook ticked. The mirror uses STATE_TO_SHIPPING so
 * pending/pushed correctly fold into not_shipped.
 *
 * Returns counts (shipments + events + orders) so the UI can show
 * "Saved — 12 shipments + 35 events updated" after a save.
 */
export async function applyHistorical(rawWording: string, newState: ShipmentState) {
  const newShippingStatus = STATE_TO_SHIPPING[newState];
  const now = new Date();

  // Find shipments first so we can update their parent Orders too. We
  // skip rows whose state is already newState — saves 90% of the
  // updates on the common case where the admin just re-confirms an
  // existing mapping.
  const affected = await prisma.shipment.findMany({
    where: { rawState: rawWording, NOT: { state: newState } },
    select: {
      id: true,
      orderId: true,
      accountId: true,
      deliveredAt: true,
      returnedAt: true,
    },
  });

  const result = await prisma.$transaction(async (tx) => {
    // Events first — append-only history needs to reflect the latest
    // mapping decision on every prior occurrence.
    const events = await tx.shipmentEvent.updateMany({
      where: { rawState: rawWording },
      data: { mappedState: newState },
    });

    let shipmentsUpdated = 0;
    let ordersUpdated = 0;

    for (const s of affected) {
      const shipmentData: Record<string, unknown> = { state: newState };
      if (newState === 'delivered' && !s.deliveredAt) shipmentData.deliveredAt = now;
      if (newState === 'returned' && !s.returnedAt) shipmentData.returnedAt = now;
      await tx.shipment.update({ where: { id: s.id }, data: shipmentData });
      shipmentsUpdated++;

      const orderData: Record<string, unknown> = { shippingStatus: newShippingStatus };
      if (newState === 'delivered') orderData.deliveredAt = now;
      await tx.order.update({ where: { id: s.orderId }, data: orderData });
      ordersUpdated++;

      await tx.orderLog.create({
        data: {
          orderId: s.orderId,
          type: 'shipping',
          action: `${STATE_LABEL[newState]} (${rawWording})`,
          performedBy: 'Admin',
          meta: {
            source: 'manual',
            rawState: rawWording,
            mappedState: newState,
            via: 'applyHistorical',
          } as never,
        },
      });
    }

    return {
      shipments: shipmentsUpdated,
      events: events.count,
      orders: ordersUpdated,
    };
  });

  // Socket fan-out outside the transaction so a slow listener doesn't
  // hold the DB connection. Each affected order surfaces in the Orders
  // list + Dashboard immediately.
  if (result.orders > 0) {
    for (const s of affected) {
      emitOrderUpdated(s.orderId, { kpi: newState === 'delivered' ? 'delivered' : 'shipped' });
      emitToRoom('admin', 'shipment:updated', {
        shipmentId: s.id,
        orderId: s.orderId,
        accountId: s.accountId,
        state: newState,
        ts: Date.now(),
      });
    }
  }

  return result;
}
