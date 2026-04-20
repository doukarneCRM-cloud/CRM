import { coliixPushQueue, type ColiixPushJobData } from '../shared/queue';

coliixPushQueue.process(async (job) => {
  const { orderId } = job.data as ColiixPushJobData;
  // Phase 11: Coliix integration — push order to delivery API
  console.log(`[coliixPush] Processing order ${orderId}`);
  return { processed: true };
});

coliixPushQueue.on('failed', (job, err) => {
  console.error(`[coliixPush] Job ${job.id} failed:`, err.message);
});
