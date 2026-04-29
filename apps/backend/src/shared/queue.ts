/**
 * Bull queue setup.
 * Queues are defined here and shared across the app.
 * Workers are in src/jobs/ and registered in the server bootstrap.
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

// ─── Queue definitions ────────────────────────────────────────────────────────

export interface YoucanSyncJobData {
  storeId: string;
  since?: string;
}

export interface ColiixPushJobData {
  orderId: string;
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

// ── Coliix V2 ────────────────────────────────────────────────────────────────
// Shipment-id keyed jobs. We use the shipmentId as the Bull jobId on push
// so double-enqueues are dedup'd by Bull itself.
export interface ColiixV2PushJobData {
  shipmentId: string;
}

export interface ColiixV2IngestJobData {
  accountId: string;
  tracking: string;
  rawState: string;
  driverNote: string | null;
  eventDateIso: string | null; // ISO; null = use receivedAt
  payload: Record<string, unknown>;
}

export interface ColiixV2PollTickJobData {
  // Empty — the worker picks its own batch from Shipment.nextPollAt.
  cursor?: string;
}

export const youcanSyncQueue = createQueue<YoucanSyncJobData>('youcan:sync');
export const coliixPushQueue = createQueue<ColiixPushJobData>('coliix:push');
export const callbackAlertQueue = createQueue<CallbackAlertJobData>('callback:alert');
export const whatsappQueue = createQueue<WhatsAppSendJobData>('whatsapp:send');

export const coliixV2PushQueue = createQueue<ColiixV2PushJobData>('coliix-v2:push');
export const coliixV2IngestQueue = createQueue<ColiixV2IngestJobData>('coliix-v2:ingest');
export const coliixV2PollQueue = createQueue<ColiixV2PollTickJobData>('coliix-v2:poll');

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export async function closeQueues() {
  await Promise.all([
    youcanSyncQueue.close(),
    coliixPushQueue.close(),
    callbackAlertQueue.close(),
    whatsappQueue.close(),
    coliixV2PushQueue.close(),
    coliixV2IngestQueue.close(),
    coliixV2PollQueue.close(),
  ]);
}
