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
    select: { ville: true, zone: true, refreshedAt: true },
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
