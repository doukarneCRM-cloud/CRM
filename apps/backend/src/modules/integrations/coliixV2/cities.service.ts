/**
 * CarrierCity sync + lookup. We pull Coliix's "List Ville et zone" so we can
 * validate addresses BEFORE pushing the parcel — the most common rejection
 * reason in V1 was an unrecognised ville, and Coliix returns it as a
 * generic "Compte désactivé" sometimes which is confusing for ops.
 */

import { prisma } from '../../../shared/prisma';
import { fetchCities, decryptAccount } from './coliixV2.client';
import { getAccount } from './accounts.service';

export interface CitySyncResult {
  total: number;
  inserted: number;
  updated: number;
  removed: number;
}

/** Pull cities from Coliix and reconcile with our cache. */
export async function syncCities(accountId: string): Promise<CitySyncResult> {
  const row = await getAccount(accountId);
  const account = decryptAccount({ apiBaseUrl: row.apiBaseUrl, apiKey: row.apiKey });
  const { cities } = await fetchCities(account);

  // Snapshot existing rows
  const existing = await prisma.carrierCity.findMany({
    where: { accountId },
    select: { id: true, ville: true },
  });
  const existingByVille = new Map(existing.map((c) => [c.ville, c]));
  const incomingVilles = new Set(cities.map((c) => c.ville));

  let inserted = 0;
  let updated = 0;
  // Insert / update
  await prisma.$transaction(async (tx) => {
    for (const c of cities) {
      const prev = existingByVille.get(c.ville);
      if (prev) {
        await tx.carrierCity.update({
          where: { id: prev.id },
          data: { zone: c.zone, refreshedAt: new Date() },
        });
        updated++;
      } else {
        await tx.carrierCity.create({
          data: { accountId, ville: c.ville, zone: c.zone },
        });
        inserted++;
      }
    }
  });

  // Reconcile removals — drop rows that disappeared from Coliix's list. Safe
  // because pre-flight uses the cache; a removed ville will simply fail
  // validation and surface to the admin.
  const removedRows = existing.filter((r) => !incomingVilles.has(r.ville));
  if (removedRows.length > 0) {
    await prisma.carrierCity.deleteMany({
      where: { id: { in: removedRows.map((r) => r.id) } },
    });
  }

  return {
    total: cities.length,
    inserted,
    updated,
    removed: removedRows.length,
  };
}

export async function listCities(accountId: string) {
  return prisma.carrierCity.findMany({
    where: { accountId },
    orderBy: { ville: 'asc' },
    select: { ville: true, zone: true, deliveryPrice: true, refreshedAt: true },
  });
}

/** True if `ville` exists in the account's cache. Case-sensitive on purpose
 *  — Coliix is case-sensitive on their side. */
export async function isVilleKnown(accountId: string, ville: string): Promise<boolean> {
  const hit = await prisma.carrierCity.findUnique({
    where: { accountId_ville: { accountId, ville } },
    select: { id: true },
  });
  return hit !== null;
}

/**
 * Bulk import V2 cities from a parsed CSV.
 *
 * Each row: { ville, zone?, deliveryPrice? }. Mode:
 *   - upsert  : insert new, update existing rows (matched on ville).
 *   - replace : same as upsert, but villes NOT in the input are removed.
 *               Safe-ish — only the carrier-cities cache is touched, never
 *               existing shipments (those live on Shipment.city, decoupled).
 */
export interface CsvImportRow {
  ville: string;
  zone?: string | null;
  deliveryPrice?: number | null;
}

export async function importCitiesCsv(
  accountId: string,
  rows: CsvImportRow[],
  mode: 'upsert' | 'replace' = 'upsert',
): Promise<{
  total: number;
  inserted: number;
  updated: number;
  unchanged: number;
  removed: number;
  skipped: Array<{ ville: string; reason: string }>;
}> {
  await prisma.carrierAccount.findUniqueOrThrow({ where: { id: accountId } });

  // Dedupe within input — keep the last value per ville (case-sensitive,
  // matching Coliix's behaviour).
  const byVille = new Map<string, CsvImportRow>();
  for (const r of rows) {
    const ville = r.ville?.trim();
    if (!ville) continue;
    byVille.set(ville, {
      ville,
      zone: r.zone?.trim?.() || null,
      deliveryPrice:
        typeof r.deliveryPrice === 'number' && !Number.isNaN(r.deliveryPrice)
          ? r.deliveryPrice
          : null,
    });
  }

  const existing = await prisma.carrierCity.findMany({
    where: { accountId },
    select: { id: true, ville: true, zone: true, deliveryPrice: true },
  });
  const existingByVille = new Map(existing.map((c) => [c.ville, c]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const skipped: Array<{ ville: string; reason: string }> = [];

  for (const [ville, row] of byVille) {
    const prev = existingByVille.get(ville);
    if (!prev) {
      try {
        await prisma.carrierCity.create({
          data: {
            accountId,
            ville,
            zone: row.zone ?? null,
            deliveryPrice: row.deliveryPrice ?? null,
          },
        });
        inserted++;
      } catch (err) {
        skipped.push({
          ville,
          reason: err instanceof Error ? err.message : 'insert failed',
        });
      }
      continue;
    }
    const prevPrice = prev.deliveryPrice == null ? null : Number(prev.deliveryPrice);
    const nextPrice = row.deliveryPrice ?? null;
    const changed =
      (prev.zone ?? null) !== (row.zone ?? null) || prevPrice !== nextPrice;
    if (!changed) {
      unchanged++;
      continue;
    }
    await prisma.carrierCity.update({
      where: { id: prev.id },
      data: {
        zone: row.zone ?? null,
        deliveryPrice: row.deliveryPrice ?? null,
        refreshedAt: new Date(),
      },
    });
    updated++;
  }

  let removed = 0;
  if (mode === 'replace') {
    const importedKeys = new Set(byVille.keys());
    const toRemove = existing.filter((c) => !importedKeys.has(c.ville));
    if (toRemove.length > 0) {
      await prisma.carrierCity.deleteMany({
        where: { id: { in: toRemove.map((c) => c.id) } },
      });
      removed = toRemove.length;
    }
  }

  return {
    total: byVille.size,
    inserted,
    updated,
    unchanged,
    removed,
    skipped,
  };
}

/**
 * Bridge V1's ShippingCity table → V2 CarrierCity for the given account.
 * V1 admins have already curated cities + delivery prices + zones; this
 * lets V2 inherit that work with one click instead of typing it twice.
 *
 * Behaviour:
 *   - Active V1 cities only (isActive=true)
 *   - Upsert on (accountId, ville) — does NOT delete V2 rows that don't
 *     exist in V1, so a Coliix-synced ville stays put.
 *   - Overwrites zone + deliveryPrice (V1 is the source of truth here).
 */
export async function importFromV1Cities(accountId: string) {
  // Confirm account exists
  await prisma.carrierAccount.findUniqueOrThrow({ where: { id: accountId } });

  const v1 = await prisma.shippingCity.findMany({
    where: { isActive: true },
    select: { name: true, zone: true, price: true },
    orderBy: { name: 'asc' },
  });

  let inserted = 0;
  let updated = 0;
  for (const c of v1) {
    const existing = await prisma.carrierCity.findUnique({
      where: { accountId_ville: { accountId, ville: c.name } },
      select: { id: true },
    });
    if (existing) {
      await prisma.carrierCity.update({
        where: { id: existing.id },
        data: { zone: c.zone ?? null, deliveryPrice: c.price, refreshedAt: new Date() },
      });
      updated++;
    } else {
      await prisma.carrierCity.create({
        data: {
          accountId,
          ville: c.name,
          zone: c.zone ?? null,
          deliveryPrice: c.price,
        },
      });
      inserted++;
    }
  }
  return { total: v1.length, inserted, updated };
}
