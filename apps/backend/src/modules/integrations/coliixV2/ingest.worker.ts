/**
 * Webhook ingest worker. The webhook controller responds to Coliix in <50 ms
 * by enqueueing the payload here; this worker does the lookup + event write
 * + KPI broadcast.
 *
 * Why decouple? A slow DB / socket / cache during a delivery wave would
 * otherwise hold the HTTP handler open and Coliix would either timeout or
 * retry-storm us. By the time we run here, the carrier already got their 200.
 */

import { coliixV2IngestQueue } from '../../../shared/queue';
import { prisma } from '../../../shared/prisma';
import { ingestEvent } from './events.service';

coliixV2IngestQueue.process(async (job) => {
  const { accountId, tracking, rawState, driverNote, eventDateIso, payload } = job.data;

  // Match shipment by (trackingCode, accountId). Account scoping is critical
  // when an org runs both Agadir + Casablanca hubs — a tracking-code clash
  // across hubs is rare but not impossible.
  const shipment = await prisma.shipment.findFirst({
    where: { trackingCode: tracking, accountId },
    select: { id: true },
  });
  if (!shipment) {
    // Fallback: try cross-account match. If unique, accept it (Coliix usually
    // doesn't reuse codes across accounts; this catches mid-migration edge cases).
    const crossAccount = await prisma.shipment.findMany({
      where: { trackingCode: tracking },
      select: { id: true },
      take: 2,
    });
    if (crossAccount.length !== 1) {
      console.warn(
        `[coliix-v2:ingest] no unique shipment for tracking=${tracking} accountId=${accountId}`,
      );
      return { ok: false, reason: 'tracking_not_found' };
    }
    return apply(crossAccount[0].id, rawState, driverNote, eventDateIso, payload);
  }

  return apply(shipment.id, rawState, driverNote, eventDateIso, payload);
});

async function apply(
  shipmentId: string,
  rawState: string,
  driverNote: string | null,
  eventDateIso: string | null,
  payload: Record<string, unknown>,
) {
  const occurredAt = eventDateIso ? new Date(eventDateIso) : new Date();
  const result = await ingestEvent({
    shipmentId,
    source: 'webhook',
    rawState,
    driverNote,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    payload,
  });
  return { ok: true, ...result };
}

coliixV2IngestQueue.on('failed', (job, err) => {
  console.error(`[coliix-v2:ingest] job ${job.id} failed:`, err.message);
});
