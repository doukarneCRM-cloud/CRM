import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const admin = await p.user.findUnique({ where: { email: 'admin@anaqatoki.ma' } });
  if (!admin) { console.log('no admin'); return; }
  for (const t of [{ type: 'onConfirm', value: 10 }, { type: 'onDeliver', value: 25 }]) {
    const exists = await p.commissionRule.findFirst({ where: { agentId: admin.id, type: t.type } });
    if (!exists) await p.commissionRule.create({ data: { agentId: admin.id, type: t.type, value: t.value } });
  }
  const all = await p.commissionRule.findMany({ where: { agentId: admin.id } });
  console.log('rules:', all.map((r) => `${r.type}=${r.value}`));
  await p.$disconnect();
})();
