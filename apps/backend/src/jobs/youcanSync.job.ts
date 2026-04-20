import { youcanSyncQueue, type YoucanSyncJobData } from '../shared/queue';
import { importOrders } from '../modules/integrations/integrations.service';

youcanSyncQueue.process(async (job) => {
  const { storeId, since } = job.data as YoucanSyncJobData;
  console.log(`[youcanSync] Syncing store ${storeId} since ${since ?? 'beginning'}`);

  const result = await importOrders(storeId);
  console.log(`[youcanSync] Done: ${result.imported} imported, ${result.skipped} skipped, ${result.errors} errors`);
  return result;
});

youcanSyncQueue.on('failed', (job, err) => {
  console.error(`[youcanSync] Job ${job.id} failed:`, err.message);
});
