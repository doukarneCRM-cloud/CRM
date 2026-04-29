/**
 * Poll worker — fallback for missing webhooks.
 *
 * Tick every 60 s. Each tick picks up to 50 shipments where:
 *   nextPollAt <= now AND state NOT IN (terminal)
 *
 * For each shipment we call Coliix `track`, take the most recent event, and
 * feed it through ingestEvent (same path as the webhook). Adaptive cadence
 * (events.service.nextPollCadence) drives the next nextPollAt.
 */

import { coliixV2PollQueue } from '../../../shared/queue';
import { prisma } from '../../../shared/prisma';
import { decryptAccount, trackParcel, ColiixV2Error } from './coliixV2.client';
import { ingestEvent } from './events.service';

const BATCH_SIZE = 50;
const TICK_INTERVAL_MS = 60_000;
const MIN_PER_SHIPMENT_GAP_MS = 4 * 60_000; // 4 min anti-flood — same as V1

coliixV2PollQueue.process(async () => {
  const now = new Date();
  const minLastPolledAt = new Date(now.getTime() - MIN_PER_SHIPMENT_GAP_MS);

  // Pick due shipments. Composite filter handles both freshly-pushed
  // (nextPollAt set on push) and stale (nextPollAt set on previous tick).
  const candidates = await prisma.shipment.findMany({
    where: {
      state: { notIn: ['delivered', 'returned', 'refused', 'lost', 'cancelled'] },
      trackingCode: { not: null },
      nextPollAt: { lte: now },
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lte: minLastPolledAt } }],
    },
    take: BATCH_SIZE,
    orderBy: { nextPollAt: 'asc' },
    include: {
      account: { select: { apiBaseUrl: true, apiKey: true, isActive: true } },
    },
  });

  let polled = 0;
  let changed = 0;
  let failed = 0;

  for (const s of candidates) {
    if (!s.account.isActive || !s.trackingCode) {
      // Skip but bump lastPolledAt to avoid hot-spinning on the same row.
      await prisma.shipment.update({
        where: { id: s.id },
        data: { lastPolledAt: now, nextPollAt: new Date(now.getTime() + 30 * 60_000) },
      });
      continue;
    }
    const acct = decryptAccount({ apiBaseUrl: s.account.apiBaseUrl, apiKey: s.account.apiKey });
    try {
      const tr = await trackParcel(acct, s.trackingCode);
      polled++;
      const top = tr.events[0];
      if (!top || !top.state || top.state === 'Unknown') {
        await prisma.shipment.update({
          where: { id: s.id },
          data: { lastPolledAt: now, nextPollAt: new Date(now.getTime() + 30 * 60_000) },
        });
        continue;
      }
      const occurredAt = top.occurredAt ? new Date(top.occurredAt) : new Date();
      const result = await ingestEvent({
        shipmentId: s.id,
        source: 'poll',
        rawState: top.state,
        driverNote: top.driverNote ?? null,
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
        payload: tr.raw as Record<string, unknown>,
      });
      if (result.changed) changed++;
      // ingestEvent already wrote nextPollAt via the cadence; we just touch
      // lastPolledAt for the throttle.
      await prisma.shipment.update({
        where: { id: s.id },
        data: { lastPolledAt: now },
      });
    } catch (err) {
      failed++;
      const msg = err instanceof ColiixV2Error ? err.message : err instanceof Error ? err.message : String(err);
      console.warn(`[coliix-v2:poll] track failed for ${s.trackingCode}: ${msg}`);
      // Backoff this shipment so a persistent error doesn't burn the whole batch.
      await prisma.shipment.update({
        where: { id: s.id },
        data: { lastPolledAt: now, nextPollAt: new Date(now.getTime() + 30 * 60_000) },
      });
    }
  }

  return { polled, changed, failed };
});

coliixV2PollQueue.on('failed', (job, err) => {
  console.error(`[coliix-v2:poll] job ${job.id} failed:`, err.message);
});

/** Boot helper — call once from server start. Sets up a repeating empty
 *  job that the processor picks up on each tick. */
export function startColiixV2Poller() {
  coliixV2PollQueue
    .add(
      {},
      {
        repeat: { every: TICK_INTERVAL_MS },
        jobId: 'coliix-v2:poll-tick',
      },
    )
    .catch((err) => {
      console.error('[coliix-v2:poll] failed to schedule repeating job:', err);
    });
}
