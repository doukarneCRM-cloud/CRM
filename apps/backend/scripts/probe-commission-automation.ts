import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

(async () => {
  const u = await p.user.findUnique({
    where: { email: 'admin@anaqatoki.ma' },
    select: { id: true, name: true, email: true, phone: true },
  });
  console.log('agent:', JSON.stringify(u, null, 2));

  const rules = await p.automationRule.findMany({
    where: { trigger: 'commission_paid' },
    include: { template: { select: { trigger: true, enabled: true, body: true } } },
  });
  console.log(`\nautomation rules for commission_paid (${rules.length} total):`);
  for (const r of rules) {
    console.log(' -', {
      id: r.id,
      ruleName: r.name,
      enabled: r.enabled,
      priority: r.priority,
      templateEnabled: r.template.enabled,
      bodySnippet: r.template.body.slice(0, 80),
    });
  }

  const tpl = await p.messageTemplate.findUnique({
    where: { trigger: 'commission_paid' },
    select: { enabled: true, body: true, updatedAt: true },
  });
  console.log(`\ntemplate commission_paid:`, tpl);

  const payments = await p.commissionPayment.findMany({
    orderBy: { paidAt: 'desc' },
    take: 5,
    select: { id: true, agentId: true, amount: true, paidAt: true },
  });
  console.log(`\nrecent payments (${payments.length}):`);
  for (const x of payments) console.log(' -', x);

  const logs = await p.messageLog.findMany({
    where: { trigger: 'commission_paid' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, status: true, error: true, recipientPhone: true, createdAt: true },
  });
  console.log(`\ncommission_paid messageLogs (${logs.length}):`);
  for (const x of logs) console.log(' -', x);

  await p.$disconnect();
})();
