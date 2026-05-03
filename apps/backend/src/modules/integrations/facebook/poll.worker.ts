/**
 * Facebook ads poll worker.
 *
 * Two roles, sharing the same queue:
 *
 *   1. Per-account sync jobs — enqueued by the OAuth connect handler and
 *      the manual "Sync now" button. Pulls one account through the full
 *      sync.service.syncAccount() pipeline.
 *
 *   2. Hourly bootstrap — repeatable job with no payload that fans out
 *      one sync job per active AdAccount. The processor checks for the
 *      empty-payload case and enqueues per-account work.
 *
 * Bull serialises jobs per queue with concurrency 1, which is exactly
 * what we want — Meta's rate limits are per app, and we'd rather drift
 * a few minutes late on a busy hour than get throttled.
 */

import { facebookSyncQueue, type FacebookSyncJobData } from '../../../shared/queue';
import { prisma } from '../../../shared/prisma';
import { syncAccount } from './sync.service';

const HOURLY_TICK_MS = 60 * 60 * 1000;

facebookSyncQueue.process(1, async (job) => {
  const data = job.data as FacebookSyncJobData & { tick?: boolean };

  // Hourly tick: fan out one sync job per active account.
  if (data?.tick) {
    const accounts = await prisma.adAccount.findMany({
      where: { provider: 'facebook', isActive: true, isConnected: true },
      select: { id: true },
    });
    for (const a of accounts) {
      await facebookSyncQueue.add({ accountId: a.id });
    }
    return { dispatched: accounts.length };
  }

  // Per-account sync.
  if (!data?.accountId) {
    return { skipped: 'no accountId' };
  }
  const result = await syncAccount(data.accountId);
  return result;
});

facebookSyncQueue.on('failed', (job, err) => {
  console.error(`[facebook:sync] job ${job.id} failed`, err);
});

// ─── Bootstrap ──────────────────────────────────────────────────────────────
// Called from index.ts once on boot. Replaces any previously scheduled
// repeatable so a hot reload doesn't end up with N parallel ticks.

export async function startFacebookPoller(): Promise<void> {
  const repeatable = await facebookSyncQueue.getRepeatableJobs();
  for (const j of repeatable) {
    await facebookSyncQueue.removeRepeatableByKey(j.key);
  }
  // Cast through unknown — the repeatable tick uses a sentinel `tick: true`
  // payload that's a superset of FacebookSyncJobData (accountId optional
  // for this one job).
  await facebookSyncQueue.add(
    { tick: true } as unknown as FacebookSyncJobData,
    {
      repeat: { every: HOURLY_TICK_MS },
      removeOnComplete: 1,
      removeOnFail: 5,
    },
  );
}
