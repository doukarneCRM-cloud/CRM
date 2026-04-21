/**
 * One-shot: migrate old flat-stock "fabric" rows into the new FabricType +
 * FabricRoll model. For every AtelieMaterial with category='fabric' and
 * isActive=true we:
 *   - create/reuse a FabricType named after the material
 *   - create a single FabricRoll carrying its full remaining stock
 *   - deactivate the old material so it disappears from the accessories UI
 *
 * Historical MaterialMovement rows are kept as-is (they still reference the
 * deactivated material). Run with:
 *   cd apps/backend && npx tsx scripts/backfill-fabric.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const fabricMaterials = await prisma.atelieMaterial.findMany({
    where: { category: 'fabric', isActive: true },
  });

  console.log(`Found ${fabricMaterials.length} active fabric material rows to migrate.`);
  let created = 0;

  for (const m of fabricMaterials) {
    const fabricType = await prisma.fabricType.upsert({
      where: { name: m.name },
      create: { name: m.name, notes: m.notes ?? null, isActive: true },
      update: {},
    });

    const existing = await prisma.fabricRoll.findFirst({
      where: { fabricTypeId: fabricType.id, color: 'unspecified' },
    });
    if (existing) {
      console.log(`  ↷ skip ${m.name} — already has an "unspecified" roll`);
      continue;
    }

    const length = Math.max(0, m.stock);
    if (length <= 0) {
      console.log(`  ↷ skip ${m.name} — zero stock`);
      await prisma.atelieMaterial.update({ where: { id: m.id }, data: { isActive: false } });
      continue;
    }

    await prisma.fabricRoll.create({
      data: {
        fabricTypeId: fabricType.id,
        color: 'unspecified',
        initialLength: length,
        remainingLength: length,
        unitCostPerMeter: m.unitCost ?? 0,
        purchaseDate: m.createdAt,
        supplier: m.supplier ?? null,
        notes: 'Migrated from legacy flat stock on backfill',
      },
    });
    await prisma.atelieMaterial.update({ where: { id: m.id }, data: { isActive: false } });
    console.log(`  ✓ migrated ${m.name} (${length}m)`);
    created++;
  }

  console.log(`\n✅ Backfill complete — ${created} rolls created.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
