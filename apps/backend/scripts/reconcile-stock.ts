/**
 * One-shot stock reconciliation after the "confirmation-driven stock" migration.
 *
 * Context: before commit f70e004, createOrder decremented stock the moment an
 * order was placed and triggerOutOfStock auto-flipped pending orders to
 * confirmationStatus='out_of_stock' when a variant hit 0. The new rules:
 *   - pending orders hold NO stock reservation; stock only moves at
 *     confirmation (updateOrderStatus → 'confirmed')
 *   - confirmed → any other status (while not shipped) restores stock
 *   - out-of-stock pending orders stay pending + surface an alert, never
 *     auto-flipped in the database
 *
 * This script fixes the two legacy artefacts:
 *   Pass 1 — release stock held by old pending non-shipped orders (which
 *            decremented at creation under the old rule). Aggregates per
 *            variant so we do one UPDATE per variant, not one per line item.
 *   Pass 2 — move stuck confirmationStatus='out_of_stock' non-shipped orders
 *            back to 'pending' so agents see them in the queue.
 *
 * Both passes run in one transaction — partial failure rolls everything back.
 * A safety guard aborts if we find a recent 'Stock reconciliation' log row
 * (meaning this already ran), so re-running is a no-op instead of a double
 * release.
 *
 * Ordering: deploy the new backend FIRST, then run this script. If you run
 * it against old code, new orders landing between deploy and run could
 * double-count.
 *
 * Run:
 *   Local:   cd apps/backend && npx tsx scripts/reconcile-stock.ts
 *   Railway: railway run --service "backend " -- npx tsx scripts/reconcile-stock.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const RECON_LOG_MARKER = 'Stock reconciliation';
const STATUS_RECON_LOG_MARKER = 'Status reconciliation';

async function main() {
  // Safety guard: bail if this appears to have already run in the last 24h.
  // The new alert-only triggerOutOfStock never writes a log row matching
  // these markers — they're unique to this script, so the check is reliable.
  const guardSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.orderLog.findFirst({
    where: {
      performedBy: 'System',
      createdAt: { gte: guardSince },
      OR: [
        { action: { startsWith: RECON_LOG_MARKER } },
        { action: { startsWith: STATUS_RECON_LOG_MARKER } },
      ],
    },
    select: { id: true, createdAt: true },
  });
  if (existing) {
    console.error(
      `\nAborting — a reconciliation log row already exists (id=${existing.id}, at=${existing.createdAt.toISOString()}).`,
    );
    console.error('If you really need to run this again, delete the guard log rows first.\n');
    process.exit(1);
  }

  const summary = {
    releasedOrderCount: 0,
    releasedVariantCount: 0,
    releasedTotalUnits: 0,
    revertedOutOfStockCount: 0,
  };

  await prisma.$transaction(async (tx) => {
    // ─── Pass 1 — release stock held by old pending non-shipped orders ──
    const ghosts = await tx.order.findMany({
      where: {
        confirmationStatus: 'pending',
        labelSent: false,
        isArchived: false,
      },
      select: {
        id: true,
        reference: true,
        items: { select: { variantId: true, quantity: true } },
      },
    });

    // Aggregate per variantId so we do one update per variant, not per item.
    const bump = new Map<string, number>();
    for (const o of ghosts) {
      for (const it of o.items) {
        bump.set(it.variantId, (bump.get(it.variantId) ?? 0) + it.quantity);
      }
    }

    for (const [variantId, qty] of bump) {
      await tx.productVariant.update({
        where: { id: variantId },
        data: { stock: { increment: qty } },
      });
    }

    // Audit trail — one row per order so a future query can trace what moved.
    if (ghosts.length > 0) {
      await tx.orderLog.createMany({
        data: ghosts.map((o) => ({
          orderId: o.id,
          type: 'system' as const,
          action:
            `${RECON_LOG_MARKER} — released stock that was reserved under the old create-time decrement policy`,
          performedBy: 'System',
          meta: {
            released: o.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          } as Prisma.InputJsonValue,
        })),
      });
    }

    summary.releasedOrderCount = ghosts.length;
    summary.releasedVariantCount = bump.size;
    summary.releasedTotalUnits = Array.from(bump.values()).reduce((a, b) => a + b, 0);

    // ─── Pass 2 — revert auto-flipped out_of_stock orders to pending ────
    const stuck = await tx.order.findMany({
      where: {
        confirmationStatus: 'out_of_stock',
        labelSent: false,
        isArchived: false,
      },
      select: { id: true },
    });

    if (stuck.length > 0) {
      await tx.order.updateMany({
        where: { id: { in: stuck.map((o) => o.id) } },
        data: { confirmationStatus: 'pending' },
      });

      await tx.orderLog.createMany({
        data: stuck.map((o) => ({
          orderId: o.id,
          type: 'system' as const,
          action:
            `${STATUS_RECON_LOG_MARKER} — auto-reverted out_of_stock → pending under new alert-only policy`,
          performedBy: 'System',
        })),
      });
    }

    summary.revertedOutOfStockCount = stuck.length;
  });

  console.log('\n── Stock reconciliation complete ──');
  console.log(`Pass 1: released stock from ${summary.releasedOrderCount} pending order(s)`);
  console.log(
    `        ${summary.releasedTotalUnits} unit(s) across ${summary.releasedVariantCount} variant(s)`,
  );
  console.log(
    `Pass 2: reverted ${summary.revertedOutOfStockCount} out_of_stock order(s) → pending`,
  );
  console.log('───────────────────────────────────\n');
}

main()
  .catch((err) => {
    console.error('Reconciliation failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
