/**
 * Raw-material stock service.
 *
 * Every `in` / `out` / `adjustment` writes a MaterialMovement AND updates the
 * parent material's `stock` field in a single $transaction, so the two never
 * drift. `out` and `adjustment` enforce non-negative resulting stock (callers
 * should use `adjustment` with a positive quantity to correct over-deductions
 * — the UI surfaces this as "set to X" rather than a delta).
 */

import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
import type { MaterialCategory } from '@prisma/client';
import type {
  CreateMaterialInput,
  UpdateMaterialInput,
  MovementInput,
} from './atelieStock.schema';

export async function listMaterials(opts: {
  category?: MaterialCategory;
  lowOnly?: boolean;
  includeInactive?: boolean;
} = {}) {
  const where: Record<string, unknown> = {};
  if (!opts.includeInactive) where.isActive = true;
  if (opts.category) where.category = opts.category;
  const rows = await prisma.atelieMaterial.findMany({
    where,
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });
  if (opts.lowOnly) {
    return rows.filter((r) => r.stock <= r.lowStockThreshold);
  }
  return rows;
}

export async function createMaterial(input: CreateMaterialInput) {
  return prisma.atelieMaterial.create({
    data: {
      name: input.name.trim(),
      category: input.category,
      unit: input.unit,
      stock: input.stock ?? 0,
      lowStockThreshold: input.lowStockThreshold ?? 0,
      unitCost: input.unitCost ?? null,
      supplier: input.supplier?.trim() || null,
      notes: input.notes?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateMaterial(id: string, input: UpdateMaterialInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.category !== undefined) data.category = input.category;
  if (input.unit !== undefined) data.unit = input.unit;
  if (input.stock !== undefined) data.stock = input.stock;
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.unitCost !== undefined) data.unitCost = input.unitCost;
  if (input.supplier !== undefined) data.supplier = input.supplier?.trim() || null;
  if (input.notes !== undefined) data.notes = input.notes?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.atelieMaterial.update({ where: { id }, data });
}

export async function deactivateMaterial(id: string) {
  return prisma.atelieMaterial.update({ where: { id }, data: { isActive: false } });
}

export async function recordMovement(
  materialId: string,
  input: MovementInput,
  userId: string,
) {
  return prisma.$transaction(async (tx) => {
    const material = await tx.atelieMaterial.findUnique({ where: { id: materialId } });
    if (!material) throw new Error('Material not found');

    let newStock = material.stock;
    if (input.type === 'in') newStock = material.stock + input.quantity;
    else if (input.type === 'out') newStock = material.stock - input.quantity;
    else if (input.type === 'adjustment') newStock = input.quantity; // set to
    if (newStock < 0) {
      throw new Error(`Cannot move ${input.quantity} ${material.unit} out — only ${material.stock} in stock`);
    }

    const movement = await tx.materialMovement.create({
      data: {
        materialId,
        type: input.type,
        quantity: input.quantity,
        reason: input.reason ?? null,
        userId,
      },
    });

    const updated = await tx.atelieMaterial.update({
      where: { id: materialId },
      data: { stock: newStock },
    });

    // Expense mirror — an `in` movement with a known unitCost is a purchase,
    // so reflect it in Money so cash flow stays accurate.
    if (input.type === 'in' && material.unitCost && material.unitCost > 0) {
      const amount = input.quantity * material.unitCost;
      await tx.expense.create({
        data: {
          description: `Stock: ${material.name} — ${input.quantity} ${material.unit} × ${material.unitCost}`,
          amount,
          date: new Date(),
          addedById: userId ?? null,
        },
      });
    }

    // Fire outside the txn? Cheap enough to leave inside — socket emits are
    // non-blocking and we've already committed the row effectively.
    emitToRoom('admin', 'atelie:material:updated', {
      materialId,
      stock: updated.stock,
    });

    return { movement, material: updated };
  });
}

export async function listMovements(materialId: string, limit = 50) {
  return prisma.materialMovement.findMany({
    where: { materialId },
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, limit)),
  });
}
