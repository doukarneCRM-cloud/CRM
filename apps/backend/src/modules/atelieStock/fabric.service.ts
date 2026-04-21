/**
 * Fabric rolls: each physical roll = one row. Same fabric type + same color
 * can differ by width / length / unit price / purchase date, so the UI groups
 * them (Type → Color → Rolls) but they live as distinct records so
 * consumption can decrement exactly the roll that was cut from.
 *
 * Every purchase auto-writes an `Expense` row so cash flow shows up in Money
 * immediately — the Expense's id is stored back on `FabricRoll.expenseId` so
 * we can keep them in sync on edits/deletes if needed later.
 */

import { prisma } from '../../shared/prisma';
import type {
  CreateFabricTypeInput,
  UpdateFabricTypeInput,
  CreateFabricRollInput,
  UpdateFabricRollInput,
  AdjustFabricRollInput,
} from './fabric.schema';

// ─── Fabric types ────────────────────────────────────────────────────────────

export async function listFabricTypes(includeInactive = false) {
  return prisma.fabricType.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: { name: 'asc' },
  });
}

export async function createFabricType(input: CreateFabricTypeInput) {
  return prisma.fabricType.create({
    data: {
      name: input.name.trim(),
      notes: input.notes?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateFabricType(id: string, input: UpdateFabricTypeInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.fabricType.update({ where: { id }, data });
}

export async function deactivateFabricType(id: string) {
  return prisma.fabricType.update({ where: { id }, data: { isActive: false } });
}

// ─── Fabric rolls ────────────────────────────────────────────────────────────

export async function listFabricRolls(opts: {
  fabricTypeId?: string;
  color?: string;
  depleted?: boolean;
}) {
  const where: Record<string, unknown> = {};
  if (opts.fabricTypeId) where.fabricTypeId = opts.fabricTypeId;
  if (opts.color) where.color = opts.color;
  if (opts.depleted !== undefined) where.isDepleted = opts.depleted;
  return prisma.fabricRoll.findMany({
    where,
    include: { fabricType: true },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });
}

/** Tree view: Type → Color → Rolls (for the grouped UI). */
export async function fabricRollsTree() {
  const rolls = await prisma.fabricRoll.findMany({
    include: { fabricType: true },
    orderBy: [{ fabricType: { name: 'asc' } }, { color: 'asc' }, { purchaseDate: 'desc' }],
  });

  type RollItem = (typeof rolls)[number];
  const byType = new Map<
    string,
    { typeId: string; typeName: string; colors: Map<string, RollItem[]> }
  >();

  for (const roll of rolls) {
    const t = byType.get(roll.fabricTypeId) ?? {
      typeId: roll.fabricTypeId,
      typeName: roll.fabricType.name,
      colors: new Map<string, RollItem[]>(),
    };
    const colorRolls = t.colors.get(roll.color) ?? [];
    colorRolls.push(roll);
    t.colors.set(roll.color, colorRolls);
    byType.set(roll.fabricTypeId, t);
  }

  return Array.from(byType.values()).map((t) => ({
    typeId: t.typeId,
    typeName: t.typeName,
    totalRemaining: Array.from(t.colors.values())
      .flat()
      .reduce((s, r) => s + r.remainingLength, 0),
    colors: Array.from(t.colors.entries()).map(([color, rolls]) => ({
      color,
      totalRemaining: rolls.reduce((s, r) => s + r.remainingLength, 0),
      rolls: rolls.map((r) => ({
        id: r.id,
        widthCm: r.widthCm,
        initialLength: r.initialLength,
        remainingLength: r.remainingLength,
        unitCostPerMeter: r.unitCostPerMeter,
        purchaseDate: r.purchaseDate,
        supplier: r.supplier,
        reference: r.reference,
        notes: r.notes,
        isDepleted: r.isDepleted,
        expenseId: r.expenseId,
      })),
    })),
  }));
}

export async function createFabricRoll(input: CreateFabricRollInput, userId?: string) {
  const fabricType = await prisma.fabricType.findUnique({ where: { id: input.fabricTypeId } });
  if (!fabricType) throw new Error('Fabric type not found');

  const purchaseDate = new Date(input.purchaseDate);
  const totalCost = input.initialLength * input.unitCostPerMeter;

  return prisma.$transaction(async (tx) => {
    // 1. Expense mirror — written first so we can link the id back onto the roll.
    const expense = totalCost > 0
      ? await tx.expense.create({
          data: {
            description:
              `Fabric: ${fabricType.name} / ${input.color} — ` +
              `${input.initialLength}m × ${input.unitCostPerMeter}/m`,
            amount: totalCost,
            date: purchaseDate,
            addedById: userId ?? null,
          },
        })
      : null;

    // 2. Roll — remainingLength starts at initialLength.
    const roll = await tx.fabricRoll.create({
      data: {
        fabricTypeId: input.fabricTypeId,
        color: input.color.trim(),
        widthCm: input.widthCm ?? null,
        initialLength: input.initialLength,
        remainingLength: input.initialLength,
        unitCostPerMeter: input.unitCostPerMeter,
        purchaseDate,
        supplier: input.supplier?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        expenseId: expense?.id ?? null,
      },
      include: { fabricType: true },
    });

    return { roll, expense };
  });
}

export async function updateFabricRoll(id: string, input: UpdateFabricRollInput) {
  const data: Record<string, unknown> = {};
  if (input.color !== undefined) data.color = input.color.trim();
  if (input.widthCm !== undefined) data.widthCm = input.widthCm;
  if (input.unitCostPerMeter !== undefined) data.unitCostPerMeter = input.unitCostPerMeter;
  if (input.purchaseDate !== undefined) data.purchaseDate = new Date(input.purchaseDate);
  if (input.supplier !== undefined) data.supplier = input.supplier?.trim() || null;
  if (input.reference !== undefined) data.reference = input.reference?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  return prisma.fabricRoll.update({ where: { id }, data, include: { fabricType: true } });
}

export async function adjustFabricRoll(id: string, input: AdjustFabricRollInput) {
  const roll = await prisma.fabricRoll.findUnique({ where: { id } });
  if (!roll) throw new Error('Fabric roll not found');
  const isDepleted = input.remainingLength <= 0;
  return prisma.fabricRoll.update({
    where: { id },
    data: { remainingLength: input.remainingLength, isDepleted },
    include: { fabricType: true },
  });
}

export async function deleteFabricRoll(id: string) {
  const roll = await prisma.fabricRoll.findUnique({
    where: { id },
    include: { consumptions: { take: 1 } },
  });
  if (!roll) throw new Error('Fabric roll not found');
  if (roll.consumptions.length > 0) {
    throw new Error('Cannot delete — this roll has consumption history. Adjust to 0 instead.');
  }
  await prisma.fabricRoll.delete({ where: { id } });
  return { ok: true };
}
