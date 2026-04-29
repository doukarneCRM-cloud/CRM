/**
 * Append a `ShipmentEvent` and (atomically) reflect the diff onto the parent
 * `Shipment`. Used by both the webhook ingest worker and the poll worker.
 *
 * Idempotency: ShipmentEvent has a unique (shipmentId, dedupeHash) constraint.
 * Hash is sha256(rawState + occurredAt) so the same Coliix delivery payload
 * replayed twice writes one event row.
 */

import crypto from 'node:crypto';
import { Prisma, type ShipmentState, type ShipmentEventSource, type ShippingStatus } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { mapWording, upsertUnknownWording } from './mapping.cache';
import { emitToAll } from '../../../shared/socket';

const TERMINAL_STATES: ShipmentState[] = ['delivered', 'returned', 'refused', 'lost', 'cancelled'];

// V2 → V1 enum bridge. Used to keep Order.shippingStatus synced with the
// Shipment row so the orders list, KPIs, commission rules, and filters all
// reflect the V2 update. Without this, the V2 system tracks reality but the
// rest of the CRM keeps reading the stale V1 status.
const V2_TO_V1_STATUS: Record<ShipmentState, ShippingStatus> = {
  pending: 'not_shipped',
  push_failed: 'not_shipped',
  pushed: 'label_created',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  refused: 'return_refused',
  returned: 'returned',
  lost: 'lost',
  cancelled: 'not_shipped',
};

export function isTerminal(state: ShipmentState): boolean {
  return TERMINAL_STATES.includes(state);
}

// Adaptive next-poll cadence — terminal returns null. Worker reads this when
// scheduling the next poll for a parcel.
export function nextPollCadence(state: ShipmentState): Date | null {
  if (isTerminal(state)) return null;
  const minutes: Partial<Record<ShipmentState, number>> = {
    pending: 5,
    push_failed: 60,
    pushed: 5,
    picked_up: 15,
    in_transit: 30,
    out_for_delivery: 10,
  };
  const m = minutes[state] ?? 30;
  return new Date(Date.now() + m * 60_000);
}

export function buildDedupeHash(rawState: string, occurredAt: Date): string {
  return crypto
    .createHash('sha256')
    .update(`${rawState}|${occurredAt.toISOString()}`)
    .digest('hex');
}

export interface IngestInput {
  shipmentId: string;
  source: ShipmentEventSource;
  rawState: string;
  driverNote?: string | null;
  occurredAt: Date;
  // Loosely-typed inbound payload — cast to InputJsonValue at the DB seam
  // so callers can pass plain objects / unknowns without an outer cast.
  payload: unknown;
}

export interface IngestResult {
  changed: boolean;
  inserted: boolean;       // false = duplicate event silently swallowed
  newState: ShipmentState | null;
  prevState: ShipmentState;
  reason?: string;
}

/**
 * Ingest the FULL event history from a Coliix track response, not just
 * the latest. Used by poll + manual refresh so historical events (and
 * their original timestamps) populate the order timeline. The dedupeHash
 * unique constraint guarantees idempotency — second call on the same
 * track response is a no-op.
 *
 * Events are processed oldest-first so state transitions land in
 * chronological order. The final state on the Shipment ends up matching
 * the latest event after the loop.
 */
export async function ingestTrackHistory(input: {
  shipmentId: string;
  source: ShipmentEventSource;
  events: Array<{ state: string; occurredAt?: string; driverNote?: string; message?: string }>;
  rawPayload: unknown;
}): Promise<{ ingested: number; changed: number; latestState: ShipmentState | null }> {
  // Process oldest → newest so transitions are correct on the parent.
  const sorted = [...input.events].sort((a, b) => {
    const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return ta - tb;
  });
  let ingested = 0;
  let changed = 0;
  let latestState: ShipmentState | null = null;
  for (const e of sorted) {
    if (!e.state || e.state === 'Unknown') continue;
    const occurredAt = e.occurredAt ? new Date(e.occurredAt) : new Date();
    const r = await ingestEvent({
      shipmentId: input.shipmentId,
      source: input.source,
      rawState: e.state,
      driverNote: e.driverNote ?? null,
      occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      payload: input.rawPayload as Record<string, unknown>,
    });
    if (r.inserted) ingested++;
    if (r.changed) changed++;
    if (r.newState) latestState = r.newState;
  }
  return { ingested, changed, latestState };
}

/**
 * Apply one inbound event. Three layers of safety:
 *   1. Dedupe via (shipmentId, dedupeHash) unique index.
 *   2. Single transaction over event insert + shipment update.
 *   3. Unknown wording → register it (auto-discover) and skip enum diff so
 *      raw still surfaces but KPIs don't churn.
 */
export async function ingestEvent(input: IngestInput): Promise<IngestResult> {
  const dedupeHash = buildDedupeHash(input.rawState, input.occurredAt);

  // Map first (cheap, in-memory cache hit). null = unknown wording.
  const hit = await mapWording(input.rawState);
  if (!hit) {
    // Auto-discover: register so the admin sees it appear in the editor.
    // We keep the rawState on the shipment but don't bucket-flip the enum.
    await upsertUnknownWording(input.rawState).catch(() => {
      // Even if upsert fails (race), the event still records below.
    });
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.findUnique({
        where: { id: input.shipmentId },
        select: { id: true, state: true, rawState: true },
      });
      if (!shipment) {
        return {
          changed: false,
          inserted: false,
          newState: null,
          prevState: 'pending' as ShipmentState,
          reason: 'shipment_not_found',
        };
      }

      let inserted = true;
      try {
        await tx.shipmentEvent.create({
          data: {
            shipmentId: input.shipmentId,
            source: input.source,
            rawState: input.rawState,
            mappedState: hit?.internalState ?? null,
            driverNote: input.driverNote ?? null,
            occurredAt: input.occurredAt,
            payload: (input.payload ?? {}) as Prisma.InputJsonValue,
            dedupeHash,
          },
        });
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          inserted = false;
        } else {
          throw err;
        }
      }

      // Decide whether to flip the parent shipment state.
      const newState = hit?.internalState ?? null;
      const stateChanged = newState !== null && newState !== shipment.state;
      const rawChanged = input.rawState !== (shipment.rawState ?? '');

      if (!stateChanged && !rawChanged) {
        return {
          changed: false,
          inserted,
          newState: shipment.state,
          prevState: shipment.state,
          reason: 'no_diff',
        };
      }

      const data: Prisma.ShipmentUpdateInput = {
        rawState: input.rawState,
      };

      if (stateChanged && newState) {
        data.state = newState;
        data.nextPollAt = nextPollCadence(newState);
        if (newState === 'delivered') {
          data.deliveredAt = input.occurredAt;
        } else if (newState === 'returned' || newState === 'refused') {
          data.returnedAt = input.occurredAt;
        }
      }

      const updated = await tx.shipment.update({
        where: { id: input.shipmentId },
        data,
        select: { id: true, state: true, orderId: true },
      });

      // Bridge to the parent Order row so the rest of the CRM (orders list,
      // KPIs, commission, filters) reflects V2 updates without code change.
      // We always sync coliixRawState (literal wording) and lastTrackedAt;
      // shippingStatus only when the V2 enum actually moved AND the V1
      // mapping yields a different value than what's stored.
      const orderPatch: Prisma.OrderUpdateInput = {
        coliixRawState: input.rawState,
        lastTrackedAt: new Date(),
      };
      if (stateChanged && newState) {
        orderPatch.shippingStatus = V2_TO_V1_STATUS[newState];
        if (newState === 'delivered') orderPatch.deliveredAt = input.occurredAt;
      }
      try {
        await tx.order.update({
          where: { id: updated.orderId },
          data: orderPatch,
        });
      } catch (err) {
        // Order missing? Should never happen given FK, but don't fail the
        // whole event over it. Log and move on.
        console.warn(`[coliix-v2:events] order patch failed for ${updated.orderId}:`, err);
      }

      // Mirror the event into OrderLog (type='shipping') so the legacy
      // Order detail timeline shows V2 history — same column the V1 system
      // uses, so admins see the full lifecycle in one place. Driver note +
      // Coliix's own event timestamp are stashed in meta for the detail
      // panel.
      try {
        await tx.orderLog.create({
          data: {
            orderId: updated.orderId,
            type: 'shipping',
            action: stateChanged && newState
              ? `Coliix → "${input.rawState}" (${input.source}) — mapped to ${newState}`
              : `Coliix → "${input.rawState}" (${input.source})`,
            performedBy: 'System',
            meta: {
              provider: 'coliix_v2',
              shipmentId: updated.id,
              rawState: input.rawState,
              mappedState: newState,
              source: input.source,
              driverNote: input.driverNote ?? null,
              eventDate: input.occurredAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      } catch (err) {
        console.warn('[coliix-v2:events] orderLog write failed:', err);
      }

      // Real-time UX hook — fire-and-forget.
      try {
        emitToAll('shipment:updated', {
          shipmentId: updated.id,
          orderId: updated.orderId,
          state: updated.state,
          rawState: input.rawState,
        });
        // Mirror to the legacy `order:updated` channel so orders-list views
        // refresh their row without needing V2-specific socket plumbing.
        emitToAll('order:updated', {
          orderId: updated.orderId,
          shippingStatus: orderPatch.shippingStatus,
          coliixRawState: input.rawState,
        });
      } catch {
        /* socket not initialized yet (cold boot) — fine to drop */
      }

      return {
        changed: stateChanged,
        inserted,
        newState: updated.state,
        prevState: shipment.state,
      };
    });
  } catch (err) {
    return {
      changed: false,
      inserted: false,
      newState: null,
      prevState: 'pending',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
