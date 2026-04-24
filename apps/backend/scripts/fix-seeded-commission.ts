/**
 * One-off cleanup for orders created by the initial run of
 * seed-test-commission-returns.ts (when the rate was hardcoded at 35 MAD).
 *
 *   - Pending delivered → clear commissionAmount to null so the UI reads the
 *     agent's current rules dynamically.
 *   - Paid delivered → relock to the agent's current per-order rate so the
 *     paid-total matches what the rules say.
 *
 * Scoped to the 7 seeded customer phones so nothing else is touched.
 *
 * Run (from apps/backend):
 *   DATABASE_URL=<public url> npx ts-node -r tsconfig-paths/register \
 *     scripts/fix-seeded-commission.ts
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/utils/phoneNormalize';

const prisma = new PrismaClient();

const SEEDED_COMMISSION_PHONES = [
  '0661334421',
  '0677889922',
  '0612458833',
  '0699445566',
  '0655667788',
  '0644332211',
  '0633998877',
];

(async () => {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@anaqatoki.ma' } });
  if (!admin) throw new Error('admin missing');

  const rules = await prisma.commissionRule.findMany({
    where: { agentId: admin.id },
    select: { type: true, value: true },
  });
  const perOrderRate =
    Number(rules.find((r) => r.type === 'onConfirm')?.value ?? 0) +
    Number(rules.find((r) => r.type === 'onDeliver')?.value ?? 0);
  console.log(`current rate = ${perOrderRate} MAD/order`);

  const phones = SEEDED_COMMISSION_PHONES.map((p) => normalizePhone(p).normalized);
  const customers = await prisma.customer.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true },
  });
  const customerIds = customers.map((c) => c.id);

  const pending = await prisma.order.updateMany({
    where: {
      customerId: { in: customerIds },
      agentId: admin.id,
      shippingStatus: 'delivered',
      commissionPaid: false,
    },
    data: { commissionAmount: null },
  });

  const paid = await prisma.order.updateMany({
    where: {
      customerId: { in: customerIds },
      agentId: admin.id,
      shippingStatus: 'delivered',
      commissionPaid: true,
    },
    data: { commissionAmount: perOrderRate },
  });

  console.log(`fixed: pending=${pending.count} (set to null) / paid=${paid.count} (relocked at ${perOrderRate})`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
