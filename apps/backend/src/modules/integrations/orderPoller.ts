import { prisma } from '../../shared/prisma';
import { fetchOrders } from '../../shared/youcanClient';
import { importSingleOrder } from './integrations.service';

const POLL_INTERVAL_MS = 15_000;
const PAGE_SIZE = 25;

let running = false;
let timer: NodeJS.Timeout | null = null;

async function pollStore(storeId: string, fieldMapping: Record<string, string> | null) {
  const result = await fetchOrders(storeId, 1, PAGE_SIZE);
  let imported = 0;
  for (const yo of result.data) {
    try {
      const outcome = await importSingleOrder(storeId, yo, fieldMapping);
      if (outcome === 'imported') imported++;
    } catch {
      // Per-order errors are non-fatal; the next poll will retry.
    }
  }
  await prisma.store.update({
    where: { id: storeId },
    data: { lastSyncAt: new Date() },
  });
  return imported;
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
      select: { id: true, fieldMapping: true },
    });
    for (const store of stores) {
      try {
        await pollStore(store.id, store.fieldMapping as Record<string, string> | null);
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
