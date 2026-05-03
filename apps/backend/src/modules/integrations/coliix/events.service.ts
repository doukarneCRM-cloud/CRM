/**
 * ingestEvent — the canonical "Coliix told us something happened" pipeline.
 *
 * Called from:
 *   - the webhook ingest worker (primary path)
 *   - the polling fallback worker (when webhooks miss)
 *   - the manual "patch shipment" admin endpoint (escape hatch)
 *
 * Steps:
 *   1. Resolve tracking → Shipment row. Miss → log webhook_unknown_tracking.
 *   2. Look up rawState in the mapping table; auto-discover unknowns.
 *   3. Append a ShipmentEvent (idempotent via dedupeHash unique constraint).
 *   4. If the wording maps to a known internalState different from the
 *      shipment's current state, update Shipment + mirror to Order.
 *   5. Emit socket events so the dashboard + order detail update live.
 *
 * The function is transactional from step 3 onwards — the event row + any
 * shipment/order writes commit together so the timeline never shows a
 * change that the dashboard doesn't reflect.
 */

import {
  ShipmentState,
  ShippingStatus,
  type ShipmentEventSource,
  Prisma,
} from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { emitToRoom, emitOrderUpdated } from '../../../shared/socket';
import * as mapping from './mapping.service';
import { logError } from './errors.service';

// ─── Friendly state labels for OrderLog rows ────────────────────────────────
// The action string on every OrderLog row is read as plain text in the
// timeline; the enum value (`picked_up`) reads awkward, so we render
// "Picked up" + the raw Coliix wording in parens. Operators care more
// about Coliix's literal wording than our enum.
export const STATE_LABEL: Record<ShipmentState, string> = {
  pending: 'Pending',
  pushed: 'Pushed',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  failed_delivery: 'Failed delivery',
  reported: 'Reported',
  delivered: 'Delivered',
  returned: 'Returned',
};

// ─── ShipmentState → ShippingStatus mirror ──────────────────────────────────
// The Order table tracks our canonical ShippingStatus enum. ShipmentState
// adds two CRM-internal values (pending, pushed) that don't have a
// ShippingStatus equivalent — both fold into 'not_shipped' on the order
// because the parcel hasn't been scanned yet from the operator's POV.
//
// Exported so mapping.service can reuse it when an admin reassigns a
// mapping and we re-bucket historical orders. `pending` (CRM-only,
// before the agent links a tracking) folds into `not_shipped`; every
// other ShipmentState has a 1:1 mirror.
export const STATE_TO_SHIPPING: Record<ShipmentState, ShippingStatus> = {
  pending: 'not_shipped',
  pushed: 'pushed',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  failed_delivery: 'failed_delivery',
  reported: 'reported',
  delivered: 'delivered',
  returned: 'returned',
};

// Adaptive polling cadence — when state is non-terminal, schedule the
// next poll. Terminal states clear nextPollAt so the polling worker
// skips them. Webhook-driven shipments rarely actually need polling, but
// we want a fallback so a single dropped webhook doesn't strand a parcel.
const TERMINAL_STATES = new Set<ShipmentState>(['delivered', 'returned']);

function nextPollFor(state: ShipmentState): Date | null {
  if (TERMINAL_STATES.has(state)) return null;
  // Cadence in SECONDS. `pushed` and `out_for_delivery` are the "operator
  // is watching the dashboard" states — short cadence keeps the timeline
  // fresh for accounts without a working webhook configured. Other states
  // are slower since updates are sparse.
  const secondsAhead = (
    {
      pending: 15 * 60,
      pushed: 60, // 1 min — covers Nouveau Colis → Attente De Ramassage flips
      picked_up: 30 * 60,
      in_transit: 60 * 60,
      out_for_delivery: 5 * 60,
      failed_delivery: 60 * 60,
      reported: 240 * 60, // 4h — courier explicitly asked to come back later
    } as Record<ShipmentState, number>
  )[state] ?? 60 * 60;
  return new Date(Date.now() + secondsAhead * 1000);
}

// ─── Public entry point ─────────────────────────────────────────────────────

export interface IngestEventInput {
  source: ShipmentEventSource;
  tracking: string;
  rawState: string;
  driverNote: string | null;
  eventDate: Date | null; // when Coliix reports the event happened
  dedupeHash: string;
  payload: Record<string, unknown>;
}

export type IngestResult =
  | { matched: false; reason: string }
  | { matched: true; replay: true }
  | {
      matched: true;
      replay: false;
      shipmentId: string;
      orderId: string;
      stateChanged: boolean;
      newState: ShipmentState | null; // null = unknown wording, no enum bucket
    };

export async function ingestEvent(input: IngestEventInput): Promise<IngestResult> {
  // ── 1. Resolve the shipment by tracking code ──────────────────────────
  const shipment = await prisma.shipment.findUnique({
    where: { trackingCode: input.tracking },
    select: {
      id: true,
      orderId: true,
      accountId: true,
      state: true,
      rawState: true,
      deliveredAt: true,
      returnedAt: true,
    },
  });
  if (!shipment) {
    await logError({
      type: 'webhook_unknown_tracking',
      message: `No shipment matches tracking "${input.tracking}"`,
      meta: { tracking: input.tracking, rawState: input.rawState, source: input.source },
    });
    return { matched: false, reason: 'tracking not found' };
  }

  // ── 2. Look up mapping (auto-discover unknowns) ───────────────────────
  const lookup = await mapping.lookupWording(input.rawState);
  if (!lookup.matched) {
    await mapping.upsertUnknownWording(input.rawState, {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
    });
  }

  const occurredAt = input.eventDate ?? new Date();

  // ── 3. Append ShipmentEvent (idempotent via dedupeHash) ───────────────
  // Wrapping in $transaction so the event insert + downstream updates
  // commit together. On a duplicate, the unique violation rolls back —
  // we catch P2002 and short-circuit as "replay".
  let stateChanged = false;
  let newState: ShipmentState | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.shipmentEvent.create({
        data: {
          shipmentId: shipment.id,
          source: input.source,
          rawState: input.rawState,
          mappedState: lookup.internalState,
          driverNote: input.driverNote,
          occurredAt,
          payload: input.payload as never,
          dedupeHash: input.dedupeHash,
        },
      });

      // ── 4. Update Shipment + Order if the wording mapped to something ──
      newState = lookup.internalState;
      const willChangeState = newState !== null && newState !== shipment.state;
      stateChanged = willChangeState;

      // Always refresh rawState (so the UI shows the latest Coliix wording
      // even when the enum bucket didn't change). Update nextPollAt to
      // adapt the polling cadence either way.
      const shipmentUpdate: Prisma.ShipmentUpdateInput = {
        rawState: input.rawState,
        lastPolledAt: input.source === 'poll' ? new Date() : undefined,
      };
      if (willChangeState && newState) {
        shipmentUpdate.state = newState;
        if (newState === 'delivered' && !shipment.deliveredAt) {
          shipmentUpdate.deliveredAt = occurredAt;
        }
        if (newState === 'returned' && !shipment.returnedAt) {
          shipmentUpdate.returnedAt = occurredAt;
        }
      }
      const effectiveState = newState ?? shipment.state;
      shipmentUpdate.nextPollAt = nextPollFor(effectiveState);

      await tx.shipment.update({ where: { id: shipment.id }, data: shipmentUpdate });

      // Mirror to Order — both shippingStatus and the appropriate
      // timestamp column (used by the dashboard's per-metric date filter).
      if (willChangeState && newState) {
        const newShippingStatus = STATE_TO_SHIPPING[newState];
        const orderUpdate: Prisma.OrderUpdateInput = {
          shippingStatus: newShippingStatus,
        };
        if (newState === 'delivered') {
          orderUpdate.deliveredAt = occurredAt;
        }
        await tx.order.update({ where: { id: shipment.orderId }, data: orderUpdate });
      }

      // OrderLog: append on every NEW Coliix wording, not just on internal
      // bucket changes. Coliix often emits multiple sub-statuses that fold
      // into the same CRM bucket (e.g. "Nouveau Colis" → "Attente De
      // Ramassage" both map to `pushed`). Operators want each transition
      // visible in the order timeline. Format: "<crm_label> : <coliix_wording>"
      // — the colon style the team requested over the previous parens form.
      const wordingChanged = input.rawState !== shipment.rawState;
      if (wordingChanged) {
        // Use the resulting state's label so the prefix matches what the
        // shipping status badge will show after this event lands.
        const labelState: ShipmentState = newState ?? shipment.state;
        await tx.orderLog.create({
          data: {
            orderId: shipment.orderId,
            type: 'shipping',
            action: `${STATE_LABEL[labelState]} : ${input.rawState}`,
            performedBy: input.source === 'webhook' ? 'Coliix webhook' : input.source,
            meta: {
              source: input.source,
              rawState: input.rawState,
              mappedState: newState,
              previousRawState: shipment.rawState,
              previousState: shipment.state,
              stateChanged: willChangeState,
              eventDate: occurredAt.toISOString(),
            } as never,
          },
        });
      }
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray(err.meta?.target) &&
      (err.meta.target as string[]).includes('dedupeHash')
    ) {
      // Replay — same tracking + state + datereported already ingested.
      return { matched: true, replay: true };
    }
    throw err;
  }

  // ── 5. Socket fan-out (outside the transaction so a slow listener
  //       never holds the DB connection). The order list and dashboard
  //       both subscribe to order:updated, so a single emit triggers
  //       surgical refetches everywhere.
  emitOrderUpdated(shipment.orderId, {
    kpi: stateChanged && newState === 'delivered' ? 'delivered' : 'shipped',
  });
  emitToRoom('admin', 'shipment:updated', {
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    accountId: shipment.accountId,
    state: newState ?? shipment.state,
    rawState: input.rawState,
    source: input.source,
    ts: Date.now(),
  });
  if (stateChanged && newState === 'delivered') {
    emitToRoom('admin', 'order:delivered', { orderId: shipment.orderId });
  }

  return {
    matched: true,
    replay: false,
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    stateChanged,
    newState,
  };
}
