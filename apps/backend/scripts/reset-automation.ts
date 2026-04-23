/**
 * One-shot cleaner: wipes every row of automation + WhatsApp runtime data
 * so we can start from zero (e.g. after a test run, or before the very first
 * real rollout). Leaves Customer rows intact but resets whatsappOptOut.
 *
 * Order matters — child tables first so FK constraints don't trip. Templates
 * get re-created automatically by ensureDefaultTemplates() on next call.
 *
 * Run via:
 *   railway run --service "backend " -- node -r ts-node/register apps/backend/scripts/reset-automation.ts
 * Or locally (loads .env):
 *   npx ts-node apps/backend/scripts/reset-automation.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[reset-automation] starting…');

  const results: Array<[string, number]> = [];

  results.push(['WhatsAppMessage', (await prisma.whatsAppMessage.deleteMany({})).count]);
  results.push(['WhatsAppThread',  (await prisma.whatsAppThread.deleteMany({})).count]);
  results.push(['MessageLog',       (await prisma.messageLog.deleteMany({})).count]);
  results.push(['AutomationRule',   (await prisma.automationRule.deleteMany({})).count]);
  results.push(['MessageTemplate',  (await prisma.messageTemplate.deleteMany({})).count]);
  results.push(['WhatsAppSession',  (await prisma.whatsAppSession.deleteMany({})).count]);

  const optOut = await prisma.customer.updateMany({
    where: { whatsappOptOut: true },
    data: { whatsappOptOut: false, whatsappOptOutAt: null },
  });
  results.push(['Customer.whatsappOptOut → false', optOut.count]);

  console.log('[reset-automation] done:');
  for (const [name, count] of results) {
    console.log(`  - ${name}: ${count}`);
  }
}

main()
  .catch((err) => {
    console.error('[reset-automation] failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
