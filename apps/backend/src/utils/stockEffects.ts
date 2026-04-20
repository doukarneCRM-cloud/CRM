import { prisma } from '../shared/prisma';
import { emitToRoom } from '../shared/socket';

// Cascade: when a variant's stock hits 0, auto-flip every pending order using
// that variant to `out_of_stock`. Shared by the orders and products modules so
// every stock mutation path runs the same rule.
export async function triggerOutOfStock(variantId: string): Promise<void> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true },
  });
  if (!variant || variant.stock > 0) return;

  const affected = await prisma.order.findMany({
    where: { confirmationStatus: 'pending', items: { some: { variantId } } },
    select: { id: true },
  });

  emitToRoom('orders:all', 'stock:updated', { variantId, stock: variant.stock });
  if (affected.length === 0) return;

  const ids = affected.map((o) => o.id);

  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: ids } },
      data: { confirmationStatus: 'out_of_stock' },
    }),
    ...ids.map((orderId) =>
      prisma.orderLog.create({
        data: {
          orderId,
          type: 'system',
          action: 'Auto-marked as out_of_stock — variant stock reached 0',
          performedBy: 'System',
          meta: { variantId },
        },
      }),
    ),
  ]);

  for (const orderId of ids) {
    emitToRoom('orders:all', 'order:updated', { orderId });
  }
  emitToRoom('dashboard', 'kpi:refresh', {});
}
