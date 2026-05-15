/**
 * One-off helper: assign 9 confirmed orders to the admin user and mark
 * them as delivered, so the operator can test the new commission
 * payment flow (Pay first N picker, method dropdown, payment history)
 * against real data.
 *
 *   - Idempotent: if admin already has ≥ N pending-commission delivered
 *     orders, the script exits without touching anything.
 *   - Conservative: only converts orders that are already in
 *     `confirmationStatus = 'confirmed'` and aren't already in a
 *     terminal shipping state. No orders are *created* — we just
 *     transition existing ones.
 *   - Reads the admin's commission rules to lock in commissionAmount
 *     exactly the way the real recordCommissionPayment service does.
 *
 * Run (from apps/backend, with DATABASE_URL pointing at the target DB):
 *   npx ts-node -r tsconfig-paths/register scripts/seed-admin-delivered.ts
 *
 * Optional env knobs:
 *   COUNT     how many orders to flip (default 9)
 *   ADMIN_EMAIL the admin user's email (default admin@anaqatoki.ma)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

(async () => {
  const wantCount = Math.max(1, Number(process.env.COUNT) || 9);
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@anaqatoki.ma';

  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    throw new Error(`admin user not found: ${adminEmail}`);
  }
  console.log(`admin: ${admin.name} (${admin.id})`);

  const rules = await prisma.commissionRule.findMany({
    where: { agentId: admin.id },
    select: { type: true, value: true },
  });
  const perOrderRate =
    Number(rules.find((r) => r.type === 'onConfirm')?.value ?? 0) +
    Number(rules.find((r) => r.type === 'onDeliver')?.value ?? 0);
  console.log(`commission rate = ${perOrderRate} MAD / order`);

  // Idempotency: if admin already has enough unpaid delivered orders,
  // there's nothing to do — just print the count and exit.
  const existing = await prisma.order.count({
    where: {
      agentId: admin.id,
      shippingStatus: 'delivered',
      commissionPaid: false,
    },
  });
  if (existing >= wantCount) {
    console.log(`admin already has ${existing} pending-commission delivered orders (≥ ${wantCount}) — nothing to do.`);
    await prisma.$disconnect();
    return;
  }

  const need = wantCount - existing;
  console.log(`need to flip ${need} more order(s) (have ${existing}, want ${wantCount})`);

  // Pick `need` confirmed orders that aren't already delivered/returned.
  // Prefer those without an agent or already on admin — leave orders
  // assigned to OTHER agents alone so we don't steal their commission.
  const candidates = await prisma.order.findMany({
    where: {
      confirmationStatus: 'confirmed',
      shippingStatus: { notIn: ['delivered', 'returned'] },
      isArchived: false,
      OR: [{ agentId: null }, { agentId: admin.id }],
    },
    orderBy: { createdAt: 'asc' },
    take: need,
    select: { id: true, reference: true, agentId: true, total: true },
  });

  if (candidates.length === 0) {
    console.log('no confirmed, non-delivered, non-archived orders available to flip.');
    await prisma.$disconnect();
    return;
  }

  const now = new Date();
  let flipped = 0;
  for (const o of candidates) {
    await prisma.order.update({
      where: { id: o.id },
      data: {
        agentId: admin.id,
        shippingStatus: 'delivered',
        labelSent: true,
        labelSentAt: now,
        commissionAmount: perOrderRate,
        commissionPaid: false,
      },
    });
    await prisma.orderLog.create({
      data: {
        orderId: o.id,
        type: 'system',
        action: `Test data: assigned to ${admin.name} + marked delivered (commission ${perOrderRate} MAD)`,
        performedBy: 'seed-admin-delivered',
        userId: admin.id,
      },
    });
    flipped += 1;
    console.log(`  ✓ ${o.reference}`);
  }

  console.log(`done: flipped ${flipped} order(s). admin now has ${existing + flipped} pending-commission delivered orders.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
