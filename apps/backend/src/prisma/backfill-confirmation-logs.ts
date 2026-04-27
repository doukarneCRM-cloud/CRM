/**
 * One-shot backfill — synthesize missing OrderLog rows for orders whose
 * confirmation status was set without going through updateOrderStatus
 * (legacy data, seed scripts, direct SQL edits). Without these synthetic
 * logs the Analytics tab — which counts confirmations as transitions in
 * the OrderLog table — undercounts compared to the Dashboard, which
 * counts current Order state.
 *
 * Idempotent: only inserts a log for an (order, status) pair when no
 * matching log already exists, so re-running is safe and fast.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register src/prisma/backfill-confirmation-logs.ts
 *
 * Or once and forget:
 *   npm exec --prefix apps/backend -- ts-node -r tsconfig-paths/register \
 *     apps/backend/src/prisma/backfill-confirmation-logs.ts
 */
import { PrismaClient, type ConfirmationStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Only the three statuses that updateOrderStatus writes a `Confirmation → X`
// log for. Pending / awaiting / callback / fake / out_of_stock / reported
// don't produce confirmation logs in the live code path either, so they
// have nothing to backfill.
const TARGET_STATUSES = ['confirmed', 'cancelled', 'unreachable'] as const satisfies ReadonlyArray<ConfirmationStatus>;

// Performance: chunk createMany so a 100k-order DB doesn't try to insert
// in one giant statement.
const CHUNK = 500;

async function main() {
  console.log('🔁 Backfilling missing confirmation OrderLog rows…\n');

  let totalBackfilled = 0;
  let totalSkipped = 0;

  for (const status of TARGET_STATUSES) {
    const action = `Confirmation → ${status}`;

    // Find every order currently in this status that has zero confirmation
    // logs matching it. The relation NOT-some pushes the existence check
    // into the DB so we don't fan out N+1 queries.
    const orphans = await prisma.order.findMany({
      where: {
        confirmationStatus: status,
        NOT: {
          logs: {
            some: {
              type: 'confirmation',
              action: { contains: action },
            },
          },
        },
      },
      select: {
        id: true,
        reference: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const inStatus = await prisma.order.count({ where: { confirmationStatus: status } });
    console.log(
      `  • ${status}: ${inStatus} orders in DB, ${orphans.length} missing log row${orphans.length === 1 ? '' : 's'}`,
    );

    for (let i = 0; i < orphans.length; i += CHUNK) {
      const slice = orphans.slice(i, i + CHUNK);
      // updatedAt is the closest proxy to the actual transition time —
      // for an order whose only mutation since creation was being set to
      // this status, updatedAt is in fact that exact moment. For one
      // that was edited later (note tweak, label sent), it's the latest
      // touch. createdAt is the conservative fallback so the log never
      // pre-dates the order itself.
      await prisma.orderLog.createMany({
        data: slice.map((o) => ({
          orderId: o.id,
          type: 'confirmation' as const,
          action,
          performedBy: 'System (backfill)',
          userId: null,
          createdAt: o.updatedAt ?? o.createdAt,
          meta: {
            backfill: true,
            reason: 'Synthesized — original transition pre-dated OrderLog logging',
            sourceField: 'order.updatedAt',
          },
        })),
      });
      totalBackfilled += slice.length;
    }

    totalSkipped += inStatus - orphans.length;
  }

  console.log(
    `\n✅ Done. Inserted ${totalBackfilled} synthetic log row${totalBackfilled === 1 ? '' : 's'}, skipped ${totalSkipped} order${totalSkipped === 1 ? '' : 's'} that already had a matching log.`,
  );
  if (totalBackfilled === 0) {
    console.log('   (Nothing to backfill — Analytics and Dashboard counts should already agree.)');
  } else {
    console.log('   The Analytics → Confirmation tab will now match the Dashboard counts.');
  }
}

main()
  .catch((err) => {
    console.error('❌ Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
