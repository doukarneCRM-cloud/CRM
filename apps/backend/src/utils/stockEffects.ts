import { prisma } from '../shared/prisma';
import { emitToRoom } from '../shared/socket';

// Cascade: when a variant's stock hits 0, raise a soft alert on every pending
// order using that variant — no status mutation. The old policy auto-flipped
// these orders to confirmationStatus='out_of_stock', but that hid them from
// the agent's queue. Now they stay pending and the frontend renders a
// "Stock short" badge + toast so the agent can decide manually (wait,
// restock, or pick 'No stock' from the status pop-up).
export async function triggerOutOfStock(variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true },
  });
  if (!variant) return;

  // Broadcast the new stock level regardless — dashboards and low-stock
  // widgets listen for this to stay fresh.
  emitToRoom('orders:all', 'stock:updated', { variantId, stock: variant.stock });
  if (variant.stock > 0) return;

  const affected = await prisma.order.findMany({
    where: { confirmationStatus: 'pending', items: { some: { variantId } } },
    select: { id: true, agentId: true },
  });
  if (affected.length === 0) return;

  // One log row per order so the audit trail records when each was flagged,
  // without touching confirmationStatus.
  await prisma.orderLog.createMany({
    data: affected.map((o) => ({
      orderId: o.id,
      type: 'system' as const,
      action: 'Stock warning — a variant on this order reached 0',
      performedBy: 'System',
      meta: { variantId, stock: 0 },
    })),
  });

  // Per-order socket alert — the open order modal / order list row picks
  // this up and shows the badge immediately without a refetch.
  for (const o of affected) {
    emitToRoom('orders:all', 'order:stock_warning', {
      orderId: o.id,
      variantId,
      ts: Date.now(),
    });
  }
}
