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
