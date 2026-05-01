/**
 * coliix:ingest worker — drains Coliix webhook events from Bull and runs
 * them through events.ingestEvent(). Webhooks themselves return 200 in
 * <50ms; the worker does the slow DB writes + socket emits asynchronously.
 *
 * Side-effect import: importing this file registers the .process()
 * handler with Bull. Done from index.ts on boot.
 */

import { coliixIngestQueue, type ColiixIngestJobData } from '../../../shared/queue';
import { ingestEvent } from './events.service';

coliixIngestQueue.process(5, async (job) => {
  const data = job.data as ColiixIngestJobData;
  return ingestEvent({
    source: 'webhook',
    tracking: data.tracking,
    rawState: data.rawState,
    driverNote: data.driverNote,
    eventDate: data.eventDateIso ? new Date(data.eventDateIso) : null,
    dedupeHash: data.dedupeHash,
    payload: data.payload,
  });
});

coliixIngestQueue.on('failed', (job, err) => {
  console.error(`[coliix:ingest] job ${job.id} failed`, err);
});
