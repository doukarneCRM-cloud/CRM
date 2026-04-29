/**
 * Append a `ShipmentEvent` and (atomically) reflect the diff onto the parent
 * `Shipment`. Used by both the webhook ingest worker and the poll worker.
 *
 * Idempotency: ShipmentEvent has a unique (shipmentId, dedupeHash) constraint.
 * Hash is sha256(rawState + occurredAt) so the same Coliix delivery payload
 * replayed twice writes one event row.
 */

import crypto from 'node:crypto';
import { Prisma, type ShipmentState, type ShipmentEventSource } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { mapWording, upsertUnknownWording } from './mapping.cache';
import { emitToAll } from '../../../shared/socket';

const TERMINAL_STATES: ShipmentState[] = ['delivered', 'returned', 'refused', 'lost', 'cancelled'];

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

      // Real-time UX hook — fire-and-forget.
      try {
        emitToAll('shipment:updated', {
          shipmentId: updated.id,
          orderId: updated.orderId,
          state: updated.state,
          rawState: input.rawState,
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
