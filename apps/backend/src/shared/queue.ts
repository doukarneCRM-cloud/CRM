/**
 * Bull queue setup.
 * Queues are defined here and shared across the app.
 * Workers are in src/jobs/ or src/modules/.../*.worker.ts and are
 * registered in the server bootstrap as side-effect imports.
 *
 * NOTE: Bull requires Redis. All queues connect to the same Redis instance.
 */

import Bull from 'bull';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

function createQueue<T = unknown>(name: string) {
  return new Bull<T>(name, REDIS_URL, {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });
}

// ─── Queue payload shapes ────────────────────────────────────────────────────

export interface YoucanSyncJobData {
  storeId: string;
  since?: string;
}

export interface CallbackAlertJobData {
  orderId: string;
  agentId: string;
  callbackAt: string; // ISO string
  customerName: string;
  orderReference: string;
}

export interface WhatsAppSendJobData {
  messageLogId: string;
}

// Coliix integration ─────────────────────────────────────────────────────────
// Webhook handler validates + enqueues; the ingest worker does the slow
// work (DB writes, socket emits) so the webhook responds in <50ms — Coliix
// otherwise considers the call failed and retries.

export interface ColiixIngestJobData {
  accountId: string;
  tracking: string;
  rawState: string;
  driverNote: string | null;
  // ISO; null means "use receivedAt as occurredAt".
  eventDateIso: string | null;
  // sha256(tracking|rawState|datereported) — second-layer replay guard
  // after the Redis NX SET in the webhook handler.
  dedupeHash: string;
  payload: Record<string, unknown>;
}

// Polling fallback — single tick that picks up everything due. The cursor
// field is reserved for future batching but unused in v1.
export interface ColiixPollTickJobData {
  cursor?: string;
}

// ─── Queues ──────────────────────────────────────────────────────────────────

export const youcanSyncQueue = createQueue<YoucanSyncJobData>('youcan:sync');
export const callbackAlertQueue = createQueue<CallbackAlertJobData>('callback:alert');
export const whatsappQueue = createQueue<WhatsAppSendJobData>('whatsapp:send');
export const coliixIngestQueue = createQueue<ColiixIngestJobData>('coliix:ingest');
export const coliixPollQueue = createQueue<ColiixPollTickJobData>('coliix:poll');

// ─── Graceful shutdown ───────────────────────────────────────────────────────

export async function closeQueues() {
  await Promise.all([
    youcanSyncQueue.close(),
    callbackAlertQueue.close(),
    whatsappQueue.close(),
    coliixIngestQueue.close(),
    coliixPollQueue.close(),
  ]);
}
