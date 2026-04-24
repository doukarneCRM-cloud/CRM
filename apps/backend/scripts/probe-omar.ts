import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const admin = await p.user.findUnique({ where: { email: 'admin@anaqatoki.ma' } });
  if (!admin) return;

  const rules = await p.commissionRule.findMany({
    where: { agentId: admin.id },
    select: { type: true, value: true },
  });
  const rate =
    Number(rules.find((r) => r.type === 'onConfirm')?.value ?? 0) +
    Number(rules.find((r) => r.type === 'onDeliver')?.value ?? 0);
  console.log(`rate: ${rate} MAD/order`);

  const delivered = await p.order.count({ where: { agentId: admin.id, shippingStatus: 'delivered' } });
  const paid = await p.order.count({ where: { agentId: admin.id, shippingStatus: 'delivered', commissionPaid: true } });
  const pending = await p.order.count({ where: { agentId: admin.id, shippingStatus: 'delivered', commissionPaid: false } });
  const pendingWithAmount = await p.order.count({
    where: { agentId: admin.id, shippingStatus: 'delivered', commissionPaid: false, commissionAmount: { not: null } },
  });
  const pendingNull = await p.order.count({
    where: { agentId: admin.id, shippingStatus: 'delivered', commissionPaid: false, commissionAmount: null },
  });
  const paidAgg = await p.order.aggregate({
    where: { agentId: admin.id, shippingStatus: 'delivered', commissionPaid: true, commissionAmount: { not: null } },
    _sum: { commissionAmount: true },
  });

  console.log(`delivered total: ${delivered} (paid=${paid}, pending=${pending})`);
  console.log(`pending breakdown: with-amount=${pendingWithAmount} / null-fallback=${pendingNull}`);
  console.log(`paid sum: ${paidAgg._sum.commissionAmount ?? 0} MAD`);
  console.log(`pending expected: ${pending * rate} MAD (at current rate)`);

  await p.$disconnect();
})();
