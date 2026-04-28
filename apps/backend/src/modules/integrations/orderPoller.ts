import { prisma } from '../../shared/prisma';
import { fetchOrders } from '../../shared/youcanClient';
import { importSingleOrder } from './integrations.service';

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 50;
// Walk a few pages if the first one is full of new orders. Caps the worst-
// case at PAGE_SIZE × MAX_PAGES per tick so a busy store catches up
// without us pulling unbounded history. 4 × 50 = 200 orders / 15 s tick
// is plenty of headroom for any merchant we serve.
const MAX_PAGES_PER_TICK = 4;

// Cushion the cutoff by this much when advancing it. Two real-world drift
// modes were silently dropping orders:
//
//   1. YouCan's `created_at` is second-precision. Two orders placed in
//      the same second only one of which is processed in tick N would
//      land tick N+1 with `placedAt <= cutoff` (cutoff is the shared
//      second) and be skipped forever.
//   2. Eventual consistency in YouCan's /orders listing — an order whose
//      created_at is T-2s may not appear in the API response until T+1s.
//      A tick at T+0s with no new data advances the cutoff to T+0s, then
//      the straggler shows up with created_at < cutoff and is dropped.
//
// Since importSingleOrder is idempotent on youcanOrderId (returns 'skipped'
// when the row already exists), overlap is free — at most a couple of
// extra YouCan API calls per tick. The reconciliation tool used to be the
// only thing rescuing these stragglers; with this overlap they get picked
// up automatically on the next tick.
const SAFETY_OVERLAP_MS = 5 * 60 * 1000;

let running = false;
let timer: NodeJS.Timeout | null = null;

async function pollStore(
  storeId: string,
  fieldMapping: Record<string, string> | null,
  cutoff: Date | null,
) {
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  // Track the EARLIEST failed order's created_at so we can rewind
  // lastSyncAt to before it and retry on the next tick. The previous
  // implementation always advanced lastSyncAt to "now" even on failure,
  // so a per-order error meant the order would never be retried — the
  // cutoff would then exclude it forever.
  let earliestFailedAt: Date | null = null;
  // Latest / oldest order times we actually saw (success or skipped).
  // latestSeenAt drives the happy-path cutoff advance; oldestSeenAt is
  // used when the page cap is exhausted, to rewind so the next tick
  // continues from the orders we didn't reach.
  let latestSeenAt: Date | null = null;
  let oldestSeenAt: Date | null = null;
  // True when we exited the loop because we hit MAX_PAGES_PER_TICK with
  // the last page still full — i.e. there are almost certainly older
  // orders we haven't looked at yet.
  let capExhausted = false;

  for (let page = 1; page <= MAX_PAGES_PER_TICK; page++) {
    const result = await fetchOrders(storeId, page, PAGE_SIZE);
    if (!result.data.length) break;

    let pageHadNewOrders = false;
    for (const yo of result.data) {
      const placedAt = new Date(yo.created_at);
      const placedValid = !Number.isNaN(placedAt.getTime());
      // Hard date filter: only orders placed AFTER cutoff. <= so an order
      // exactly at the cutoff (which is when we last advanced) isn't
      // imported twice. Without a cutoff (first ever sync) — let
      // everything through.
      if (cutoff && placedValid && placedAt <= cutoff) continue;
      pageHadNewOrders = true;
      if (placedValid) {
        if (!latestSeenAt || placedAt > latestSeenAt) latestSeenAt = placedAt;
        if (!oldestSeenAt || placedAt < oldestSeenAt) oldestSeenAt = placedAt;
      }

      try {
        const outcome = await importSingleOrder(storeId, yo, fieldMapping);
        if (outcome === 'imported') imported++;
        else skipped++;
      } catch (e) {
        errors++;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        // Persist the failure so the admin can see exactly which YouCan
        // order failed and why — replaces the silent swallow that left
        // orders disappearing without a trace.
        await prisma.importLog
          .create({
            data: {
              storeId,
              type: 'orders_import',
              level: 'error',
              message: `Poller failed to import YouCan order ${yo.ref ?? yo.id}: ${msg}`,
              imported: 0,
              skipped: 0,
              errors: 1,
              meta: {
                youcanOrderId: yo.id,
                youcanRef: yo.ref ?? null,
                error: msg,
                createdAt: yo.created_at ?? null,
                source: 'poller',
              },
            },
          })
          .catch(() => {});
        if (placedValid) {
          if (!earliestFailedAt || placedAt < earliestFailedAt) {
            earliestFailedAt = placedAt;
          }
        }
      }
    }

    // If this page already returned only "before cutoff" orders, no point
    // walking further pages — they're even older.
    if (!pageHadNewOrders) break;
    if (result.data.length < PAGE_SIZE) break;
    if (page === MAX_PAGES_PER_TICK) capExhausted = true;
  }

  // Advance the cutoff. Priority order, with the safety overlap applied
  // so eventual-consistency stragglers and same-second siblings always
  // land inside the NEXT tick's window:
  //
  //   1. earliestFailedAt — rewind before any per-order failure so it
  //      retries next tick.
  //   2. capExhausted     — we hit MAX_PAGES_PER_TICK with the last
  //      page still full; older orders exist that we didn't reach.
  //      Rewind to just before oldestSeenAt so the next tick continues
  //      from there.
  //   3. latestSeenAt     — happy path, lagged by SAFETY_OVERLAP_MS.
  //   4. nothing seen     — quiet tick; lag a "now" cursor by the same
  //      overlap so we don't cement a cutoff past an order YouCan
  //      hasn't yet exposed.
  let nextCutoff: Date;
  if (earliestFailedAt) {
    // Subtract 1 ms so the comparison `placedAt <= cutoff` doesn't
    // exclude the failed order on the next tick.
    nextCutoff = new Date(earliestFailedAt.getTime() - 1);
  } else if (capExhausted && oldestSeenAt) {
    nextCutoff = new Date(oldestSeenAt.getTime() - 1);
  } else if (latestSeenAt) {
    nextCutoff = new Date(latestSeenAt.getTime() - SAFETY_OVERLAP_MS);
  } else {
    nextCutoff = new Date(Date.now() - SAFETY_OVERLAP_MS);
  }

  // Never let the cutoff move backwards past where it already was. The
  // overlap math can otherwise rewind us during a quiet tick if cutoff
  // was recently advanced very close to "now" — that would cause us to
  // re-scan history we've already processed (idempotent, but wasteful).
  if (cutoff && nextCutoff < cutoff) nextCutoff = cutoff;

  await prisma.store.update({
    where: { id: storeId },
    data: { lastSyncAt: nextCutoff },
  });

  if (imported > 0 || errors > 0) {
    await prisma.importLog
      .create({
        data: {
          storeId,
          type: 'orders_import',
          level: errors > 0 ? 'warning' : 'info',
          message:
            errors > 0
              ? `Poll cycle: ${imported} imported, ${skipped} already in CRM, ${errors} failed (will retry)`
              : `Poll cycle: ${imported} imported, ${skipped} already in CRM`,
          imported,
          skipped,
          errors,
          meta: { source: 'poller', cutoffAdvancedTo: nextCutoff.toISOString() },
        },
      })
      .catch(() => {});
  }

  return { imported, skipped, errors };
}

async function pollOnce() {
  if (running) return;
  running = true;
  try {
    // Only stores the admin has explicitly opted into auto-sync. New
    // OAuth links default to autoSyncEnabled=false — the admin has to
    // flip the toggle in the store config (or click manual Import
    // orders) before the poller touches them.
    const stores = await prisma.store.findMany({
      where: { isActive: true, isConnected: true, autoSyncEnabled: true },
      select: { id: true, fieldMapping: true, lastSyncAt: true },
    });
    for (const store of stores) {
      try {
        await pollStore(
          store.id,
          store.fieldMapping as Record<string, string> | null,
          store.lastSyncAt,
        );
      } catch {
        // Skip this store on transient failures; next tick will retry.
      }
    }
  } finally {
    running = false;
  }
}

export function startOrderPoller() {
  if (timer) return;
  // Run once immediately on boot so new orders appear without waiting a full tick.
  void pollOnce();
  timer = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
  console.log(`📡 YouCan order poller started (every ${POLL_INTERVAL_MS / 1000}s)`);
}

export function stopOrderPoller() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
