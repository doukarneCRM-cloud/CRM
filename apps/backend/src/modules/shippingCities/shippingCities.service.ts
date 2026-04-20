/**
 * Shipping-cities service — CRUD + CSV import.
 *
 * Cities are referenced by Order.customerCity + used to compute ShippingPrice.
 * City names are matched case-insensitively but stored as submitted so the UI
 * can preserve the operator's preferred casing.
 */

import { prisma } from '../../shared/prisma';
import type { CreateCityInput, UpdateCityInput, CsvImportInput } from './shippingCities.schema';

export async function listCities(opts: { activeOnly?: boolean } = {}) {
  return prisma.shippingCity.findMany({
    where: opts.activeOnly ? { isActive: true } : undefined,
    orderBy: { name: 'asc' },
  });
}

export async function createCity(input: CreateCityInput) {
  return prisma.shippingCity.create({
    data: {
      name: input.name.trim(),
      price: input.price,
      zone: input.zone?.trim() || null,
      isActive: input.isActive ?? true,
    },
  });
}

export async function updateCity(id: string, input: UpdateCityInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.price !== undefined) data.price = input.price;
  if (input.zone !== undefined) data.zone = input.zone?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  return prisma.shippingCity.update({ where: { id }, data });
}

export async function deleteCity(id: string) {
  await prisma.shippingCity.delete({ where: { id } });
}

/**
 * Bulk import from parsed CSV rows.
 *
 * - `upsert` mode: insert new cities, update existing ones by name (case-insensitive).
 * - `replace` mode: same as upsert, but cities NOT present in the input are
 *   deactivated (soft "replace" — we never hard-delete to preserve historical
 *   orders that reference them).
 *
 * Returns per-row outcomes so the UI can highlight any duplicates or conflicts.
 */
export interface ImportOutcome {
  name: string;
  action: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
}

export async function importCities(input: CsvImportInput): Promise<{
  outcomes: ImportOutcome[];
  summary: { created: number; updated: number; unchanged: number; deactivated: number; skipped: number };
}> {
  const outcomes: ImportOutcome[] = [];
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;

  // Dedupe within the input — keep the last value for a given name.
  const byKey = new Map<string, { name: string; price: number; zone: string | null }>();
  for (const row of input.rows) {
    const name = row.name.trim();
    if (!name) continue;
    byKey.set(name.toLowerCase(), {
      name,
      price: row.price,
      zone: row.zone?.trim() || null,
    });
  }

  const existing = await prisma.shippingCity.findMany();
  const byLowerName = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  for (const [key, row] of byKey) {
    const match = byLowerName.get(key);
    if (!match) {
      try {
        await prisma.shippingCity.create({
          data: { name: row.name, price: row.price, zone: row.zone, isActive: true },
        });
        outcomes.push({ name: row.name, action: 'created' });
        created += 1;
      } catch (err) {
        outcomes.push({
          name: row.name,
          action: 'skipped',
          reason: err instanceof Error ? err.message : 'insert failed',
        });
        skipped += 1;
      }
      continue;
    }

    const changed =
      match.price !== row.price ||
      (match.zone ?? null) !== row.zone ||
      match.name !== row.name ||
      match.isActive === false; // reactivate if soft-disabled

    if (!changed) {
      outcomes.push({ name: match.name, action: 'unchanged' });
      unchanged += 1;
      continue;
    }

    await prisma.shippingCity.update({
      where: { id: match.id },
      data: { name: row.name, price: row.price, zone: row.zone, isActive: true },
    });
    outcomes.push({ name: row.name, action: 'updated' });
    updated += 1;
  }

  let deactivated = 0;
  if (input.mode === 'replace') {
    const importedKeys = new Set(byKey.keys());
    const toDeactivate = existing.filter(
      (c) => c.isActive && !importedKeys.has(c.name.toLowerCase()),
    );
    if (toDeactivate.length > 0) {
      await prisma.shippingCity.updateMany({
        where: { id: { in: toDeactivate.map((c) => c.id) } },
        data: { isActive: false },
      });
      deactivated = toDeactivate.length;
    }
  }

  return {
    outcomes,
    summary: { created, updated, unchanged, deactivated, skipped },
  };
}
