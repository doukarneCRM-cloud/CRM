import { callbackAlertQueue, type CallbackAlertJobData } from '../shared/queue';
import { emitToUser } from '../shared/socket';

callbackAlertQueue.process(async (job) => {
  const { orderId, agentId, orderReference, customerName, callbackAt } = job.data as CallbackAlertJobData;

  // Emit real-time alert to the agent's socket room
  emitToUser(agentId, 'callback:reminder', {
    orderId,
    orderReference,
    customerName,
    callbackAt,
    message: `Callback reminder: ${customerName} — Order ${orderReference}`,
  });

  return { processed: true };
});

callbackAlertQueue.on('failed', (job, err) => {
  console.error(`[callbackAlert] Job ${job.id} failed:`, err.message);
});
