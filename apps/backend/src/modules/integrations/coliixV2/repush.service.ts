/**
 * Detect + re-push parcels created with the [id:<idem>] Commentaire bug
 * and the missing-variant Marchandise bug (commit ca056a9 fix).
 *
 * Detection: any Shipment whose `note` starts with `[id:` is a fingerprint
 * of the buggy push path. We list them in a preview call, then for each
 * one (when execute=true):
 *   1. Mark the old Shipment as `cancelled` locally + write a manual event
 *      so the timeline carries the reason.
 *   2. Reset Order.labelSent → false so the V2 push path can re-create
 *      a fresh Shipment.
 *   3. Call createShipmentFromOrder which now produces clean Commentaire
 *      + variant-aware Marchandise.
 *
 * Caveat: we cannot cancel the parcel on Coliix's side (their API has no
 * parcel-cancel endpoint). The old broken parcel will still exist there
 * with its tracking code. Operators must contact Coliix support to cancel
 * those manually if they want to avoid double-charge for delivery.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { createShipmentFromOrder } from './shipments.service';

export interface RepushCandidate {
  shipmentId: string;
  orderId: string;
  orderReference: string;
  trackingCode: string | null;
  state: string;
  note: string | null;
  goodsLabel: string;
  pushedAt: Date | null;
  customerName: string;
  city: string;
}

export interface RepushPreview {
  candidates: RepushCandidate[];
  total: number;
}

export interface RepushOutcome {
  shipmentId: string;
  orderId: string;
  orderReference: string;
  ok: boolean;
  newShipmentId?: string;
  error?: string;
}

export interface RepushResult {
  total: number;
  ok: number;
  failed: number;
  results: RepushOutcome[];
}

const BROKEN_NOTE_PREFIX = '[id:';

export async function previewBrokenParcels(accountId: string): Promise<RepushPreview> {
  const candidates = await prisma.shipment.findMany({
    where: {
      accountId,
      note: { startsWith: BROKEN_NOTE_PREFIX },
      // Only re-push shipments that weren't already manually cancelled.
      state: { notIn: ['cancelled'] },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orderId: true,
      trackingCode: true,
      state: true,
      note: true,
      goodsLabel: true,
      pushedAt: true,
      city: true,
      recipientName: true,
      order: { select: { reference: true } },
    },
  });

  return {
    total: candidates.length,
    candidates: candidates.map((c) => ({
      shipmentId: c.id,
      orderId: c.orderId,
      orderReference: c.order.reference,
      trackingCode: c.trackingCode,
      state: c.state,
      note: c.note,
      goodsLabel: c.goodsLabel,
      pushedAt: c.pushedAt,
      customerName: c.recipientName,
      city: c.city,
    })),
  };
}

export async function repushBrokenParcels(
  accountId: string,
  // Optional whitelist — re-push ONLY these shipment ids. When empty, re-push
  // every detected candidate. Lets the operator pick + re-push selectively
  // from the modal.
  shipmentIds?: string[],
): Promise<RepushResult> {
  const preview = await previewBrokenParcels(accountId);
  const targets = shipmentIds && shipmentIds.length > 0
    ? preview.candidates.filter((c) => shipmentIds.includes(c.shipmentId))
    : preview.candidates;

  const results: RepushOutcome[] = [];
  for (const c of targets) {
    try {
      // 1. Mark old shipment cancelled locally + add a manual event so the
      //    timeline shows why. This DOES NOT cancel at Coliix — operator
      //    must handle that out-of-band.
      await prisma.$transaction([
        prisma.shipment.update({
          where: { id: c.shipmentId },
          data: {
            state: 'cancelled',
            nextPollAt: null,
            note: `${c.note ?? ''} — REPUSHED on ${new Date().toISOString()}`,
          },
        }),
        prisma.shipmentEvent.create({
          data: {
            shipmentId: c.shipmentId,
            source: 'manual',
            rawState: 'Cancelled (repush)',
            mappedState: 'cancelled',
            driverNote:
              'Auto-cancelled to allow re-push with corrected Commentaire + Marchandise. Old Coliix parcel still exists; cancel it via Coliix support if needed.',
            occurredAt: new Date(),
            payload: { reason: 'repush_broken_parcel' } as Prisma.InputJsonValue,
            dedupeHash: `repush:${c.shipmentId}:${Date.now()}`,
          },
        }),
        // Reset legacy bridge so createShipmentFromOrder doesn't refuse with
        // "already_sent" — this Order needs to be eligible for a fresh push.
        prisma.order.update({
          where: { id: c.orderId },
          data: { labelSent: false, coliixTrackingId: null, trackingProvider: null },
        }),
      ]);

      // 2. Push fresh — uses the corrected client + buildMerchandise.
      const fresh = await createShipmentFromOrder({ orderId: c.orderId, accountId });
      results.push({
        shipmentId: c.shipmentId,
        orderId: c.orderId,
        orderReference: c.orderReference,
        ok: true,
        newShipmentId: fresh.shipmentId,
      });
    } catch (err) {
      results.push({
        shipmentId: c.shipmentId,
        orderId: c.orderId,
        orderReference: c.orderReference,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    total: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
