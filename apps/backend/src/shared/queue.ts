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

export const youcanSyncQueue = createQueue<YoucanSyncJobData>('youcan:sync');
export const coliixPushQueue = createQueue<ColiixPushJobData>('coliix:push');
export const callbackAlertQueue = createQueue<CallbackAlertJobData>('callback:alert');
export const whatsappQueue = createQueue<WhatsAppSendJobData>('whatsapp:send');

// ─── Graceful shutdown ────────────────────────────────────────────────────────
export async function closeQueues() {
  await Promise.all([
    youcanSyncQueue.close(),
    coliixPushQueue.close(),
    callbackAlertQueue.close(),
    whatsappQueue.close(),
  ]);
}
