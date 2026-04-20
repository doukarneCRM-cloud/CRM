/**
 * Coliix tracking poller — fallback for missed webhooks.
 *
 * Webhooks give us instant status updates, but networks and providers can drop
 * events. This poller hits Coliix's tracking endpoint every `POLL_INTERVAL_MS`
 * for in-flight orders (have a tracking code, not yet in a terminal state),
 * feeds results through the same `ingestStatus` path the webhook uses, and
 * stamps `lastTrackedAt` so we don't re-poll the same order back-to-back.
 *
 * Per-tick work is capped (`BATCH_SIZE`) and runs sequentially — the Coliix
 * API isn't documented for concurrency and we'd rather be polite than fast.
 */

import { prisma } from '../../shared/prisma';
import { trackParcel, ColiixError } from './coliixClient';
import { ingestStatus } from './coliix.service';
import { getOrCreateProvider } from './providers.service';
import type { ShippingStatus } from '@prisma/client';

const POLL_INTERVAL_MS = 5 * 60_000;          // 5 minutes between ticks
const BATCH_SIZE = 20;                         // orders touched per tick
const MIN_GAP_MS = 4 * 60_000;                 // don't re-poll a given order faster than this

// Statuses where we stop polling — the parcel is done (delivered, returned,
// refused, lost, destroyed, etc.). `exchange` and `return_validated` are also
// terminal from a tracking perspective.
const TERMINAL_STATUSES: ShippingStatus[] = [
  'delivered',
  'returned',
  'return_validated',
  'return_refused',
  'exchange',
  'lost',
  'destroyed',
];

let running = false;
let timer: NodeJS.Timeout | null = null;

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    // Skip entirely if Coliix isn't active or has no key.
    const provider = await getOrCreateProvider('coliix').catch(() => null);
    if (!provider || !provider.isActive || !provider.apiKey) return;

    const cutoff = new Date(Date.now() - MIN_GAP_MS);
    const orders = await prisma.order.findMany({
      where: {
        trackingProvider: 'coliix',
        coliixTrackingId: { not: null },
        shippingStatus: { notIn: TERMINAL_STATUSES },
        OR: [{ lastTrackedAt: null }, { lastTrackedAt: { lte: cutoff } }],
      },
      select: { id: true, coliixTrackingId: true },
      orderBy: { lastTrackedAt: 'asc' },
      take: BATCH_SIZE,
    });

    for (const order of orders) {
      if (!order.coliixTrackingId) continue;
      try {
        const track = await trackParcel(order.coliixTrackingId);
        await ingestStatus({
          tracking: order.coliixTrackingId,
          rawState: track.currentState,
          driverNote: track.events[0]?.driverNote ?? null,
          eventDate: track.events[0]?.date ? new Date(track.events[0].date) : null,
          source: 'poller',
        });
      } catch (err) {
        // Record the failure on the order so we back off, but keep iterating.
        const message =
          err instanceof ColiixError ? err.message : err instanceof Error ? err.message : String(err);
        console.warn(`[coliixTracker] ${order.coliixTrackingId} failed: ${message}`);
        await prisma.order
          .update({ where: { id: order.id }, data: { lastTrackedAt: new Date() } })
          .catch(() => {});
      }
    }
  } catch (err) {
    console.error('[coliixTracker] tick failed:', err);
  } finally {
    running = false;
  }
}

export function startColiixTracker() {
  if (timer) return;
  // Small delay so we don't race the HTTP listener / DB pool on boot.
  setTimeout(() => {
    void pollOnce();
    timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  }, 30_000).unref();
}
