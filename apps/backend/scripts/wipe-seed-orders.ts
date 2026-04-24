/**
 * Wipes all orders (and their OrderItems/OrderLogs) belonging to customers
 * seeded by seed-test-commission-returns.ts. The customer records themselves
 * are kept so the next seed run can upsert them.
 *
 * Scoped by phone so no other data is affected. Safe to run before a clean
 * re-seed.
 */
import { PrismaClient } from '@prisma/client';
import { normalizePhone } from '../src/utils/phoneNormalize';

const prisma = new PrismaClient();

const SEED_PHONES = [
  '0661334421', '0677889922', '0612458833', '0699445566',
  '0655667788', '0644332211', '0633998877', '0666554433',
  '0611778899', '0622883344', '0688112233', '0699001122',
  '0677445588', '0644991177', '0611556699',
];

(async () => {
  const phones = SEED_PHONES.map((p) => normalizePhone(p).normalized);
  const customers = await prisma.customer.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, fullName: true },
  });
  const customerIds = customers.map((c) => c.id);
  console.log(`Found ${customers.length} seed customers`);

  const orders = await prisma.order.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);
  console.log(`Found ${orders.length} seed orders to delete`);

  await prisma.$transaction([
    prisma.orderLog.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } }),
    prisma.order.deleteMany({ where: { id: { in: orderIds } } }),
  ]);

  console.log(`✅ wiped ${orderIds.length} orders`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
