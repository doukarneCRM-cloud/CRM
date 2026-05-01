/**
 * Coliix cities + delivery fees.
 *
 * Imported from CSV (the file Coliix gives the seller). Format observed:
 *
 *   name,price,zone
 *   Casablanca,25,
 *   Agadir,20,
 *   Anza,30,
 *   ...
 *
 * The parser is tolerant — accepts any column order as long as the header
 * names appear (case-insensitive); ignores BOM; quoted values with commas.
 *
 * Upsert is keyed on (accountId, normalisedVille) so re-uploading the same
 * file with new prices updates existing rows in place. Mode `replace`
 * deletes every row not present in the CSV; mode `merge` (default) leaves
 * untouched rows alone.
 */

import { prisma } from '../../../shared/prisma';

// ─── CSV parser ─────────────────────────────────────────────────────────────

export interface CsvCityRow {
  ville: string;
  zone: string | null;
  deliveryPrice: number | null;
  // Original line number (1-indexed including header) so the UI can flag
  // which row failed validation. Header is line 1.
  lineNo: number;
}

export interface ParseResult {
  rows: CsvCityRow[];
  skipped: Array<{ lineNo: number; raw: string; reason: string }>;
  totalLines: number;
}

/**
 * Tolerant CSV parser — handles BOM, CRLF, quoted fields, commas in quotes.
 * Returns rows + a list of skipped lines with reasons so the import UI
 * can surface "53 cities OK, 2 rows ignored — see details".
 */
export function parseCitiesCsv(text: string): ParseResult {
  const skipped: ParseResult['skipped'] = [];
  const rows: CsvCityRow[] = [];

  // Strip BOM that some Excel/Numbers exports leave behind.
  const cleaned = text.replace(/^﻿/, '');
  const lines = cleaned.split(/\r?\n/);
  if (lines.length === 0) return { rows: [], skipped: [], totalLines: 0 };

  // Header row → column index map. Required columns: name, price.
  const header = parseLine(lines[0]).map((s) => s.trim().toLowerCase());
  const idx = {
    name: header.findIndex((h) => h === 'name' || h === 'ville' || h === 'city'),
    price: header.findIndex((h) => h === 'price' || h === 'fee' || h === 'fees' || h === 'tarif'),
    zone: header.findIndex((h) => h === 'zone' || h === 'region'),
  };

  if (idx.name === -1 || idx.price === -1) {
    return {
      rows: [],
      skipped: [
        {
          lineNo: 1,
          raw: lines[0],
          reason: 'Missing required header columns. Expect at least: name, price (zone optional).',
        },
      ],
      totalLines: lines.length,
    };
  }

  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue; // skip blank lines silently
    const cells = parseLine(raw);

    const name = (cells[idx.name] ?? '').trim();
    const priceCell = (cells[idx.price] ?? '').trim();
    const zoneCell = idx.zone >= 0 ? (cells[idx.zone] ?? '').trim() : '';

    if (!name) {
      skipped.push({ lineNo: i + 1, raw, reason: 'Empty city name' });
      continue;
    }
    const price = priceCell === '' ? null : Number(priceCell.replace(',', '.'));
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      skipped.push({ lineNo: i + 1, raw, reason: `Invalid price: "${priceCell}"` });
      continue;
    }

    rows.push({
      ville: name,
      zone: zoneCell || null,
      deliveryPrice: price,
      lineNo: i + 1,
    });
  }

  return { rows, skipped, totalLines: lines.length };
}

// Single-line CSV split with quoted-string support. Avoids pulling in a
// dep for a one-off; handles "Casablanca, Aïn Diab" inside quotes
// without splitting on the inner comma.
function parseLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  out.push(current);
  return out;
}

// ─── Service layer ──────────────────────────────────────────────────────────

export interface ImportSummary {
  accountId: string;
  imported: number; // rows we wrote (new + updated)
  unchanged: number; // rows that already had identical price/zone
  removed: number; // rows deleted in `replace` mode
  skipped: ParseResult['skipped'];
  totalLines: number;
}

/**
 * Bulk-import the CSV body into a hub's CarrierCity table.
 *
 * mode='merge'   (default) — upserts; existing rows not in CSV stay.
 * mode='replace'           — upserts; cities not in CSV are deleted.
 */
export async function importCitiesCsv(
  accountId: string,
  csvText: string,
  mode: 'merge' | 'replace' = 'merge',
): Promise<ImportSummary> {
  const account = await prisma.carrierAccount.findUnique({ where: { id: accountId } });
  if (!account) {
    throw Object.assign(new Error('Account not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  const parsed = parseCitiesCsv(csvText);

  // De-dupe rows in the CSV itself — same city listed twice keeps the last
  // price (matches user expectation: latest entry wins).
  const byVille = new Map<string, CsvCityRow>();
  for (const r of parsed.rows) byVille.set(r.ville.toLowerCase(), r);
  const uniqueRows = Array.from(byVille.values());

  // Existing rows so we can count "unchanged" and detect removals.
  const existing = await prisma.carrierCity.findMany({
    where: { accountId },
    select: { id: true, ville: true, zone: true, deliveryPrice: true },
  });
  const existingByLower = new Map(existing.map((c) => [c.ville.toLowerCase(), c]));

  let imported = 0;
  let unchanged = 0;

  await prisma.$transaction(async (tx) => {
    for (const r of uniqueRows) {
      const lower = r.ville.toLowerCase();
      const prior = existingByLower.get(lower);
      const samePrice =
        prior &&
        Number(prior.deliveryPrice ?? 0) === Number(r.deliveryPrice ?? 0) &&
        (prior.zone ?? null) === (r.zone ?? null);
      if (prior && samePrice) {
        unchanged++;
        continue;
      }
      await tx.carrierCity.upsert({
        where: {
          accountId_ville: { accountId, ville: prior?.ville ?? r.ville },
        },
        create: {
          accountId,
          ville: r.ville,
          zone: r.zone,
          deliveryPrice: r.deliveryPrice,
        },
        update: {
          ville: r.ville, // keep canonical casing from CSV
          zone: r.zone,
          deliveryPrice: r.deliveryPrice,
          refreshedAt: new Date(),
        },
      });
      imported++;
    }
  });

  // Replace mode — drop cities not present in the CSV.
  let removed = 0;
  if (mode === 'replace') {
    const csvLower = new Set(uniqueRows.map((r) => r.ville.toLowerCase()));
    const toRemove = existing.filter((c) => !csvLower.has(c.ville.toLowerCase()));
    if (toRemove.length > 0) {
      await prisma.carrierCity.deleteMany({
        where: { id: { in: toRemove.map((c) => c.id) } },
      });
      removed = toRemove.length;
    }
  }

  return {
    accountId,
    imported,
    unchanged,
    removed,
    skipped: parsed.skipped,
    totalLines: parsed.totalLines,
  };
}

// ─── List / edit / delete ───────────────────────────────────────────────────

export interface ListCitiesParams {
  accountId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listCities(params: ListCitiesParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(500, Math.max(1, params.pageSize ?? 100));
  const where = {
    accountId: params.accountId,
    ...(params.search && params.search.trim()
      ? { ville: { contains: params.search.trim(), mode: 'insensitive' as const } }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.carrierCity.findMany({
      where,
      orderBy: { ville: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.carrierCity.count({ where }),
  ]);
  return {
    data: rows.map((r) => ({
      ...r,
      deliveryPrice: r.deliveryPrice === null ? null : Number(r.deliveryPrice),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export interface UpdateCityInput {
  ville?: string;
  zone?: string | null;
  deliveryPrice?: number | null;
}

export async function updateCity(id: string, input: UpdateCityInput) {
  const data: Record<string, unknown> = {};
  if (input.ville !== undefined) data.ville = input.ville.trim();
  if (input.zone !== undefined) data.zone = input.zone;
  if (input.deliveryPrice !== undefined) data.deliveryPrice = input.deliveryPrice;
  data.refreshedAt = new Date();
  const row = await prisma.carrierCity.update({ where: { id }, data });
  return {
    ...row,
    deliveryPrice: row.deliveryPrice === null ? null : Number(row.deliveryPrice),
  };
}

export async function deleteCity(id: string) {
  await prisma.carrierCity.delete({ where: { id } });
}

/**
 * Lookup: does this account ship to this city, and if so what's the fee?
 *
 * Used by the "Mark as Shipped" modal to validate the customer's city
 * BEFORE the agent enters a tracking code, and by the dashboard to
 * compute the carrier-cost number.
 */
export async function findCity(accountId: string, ville: string) {
  const lowered = ville.trim().toLowerCase();
  if (!lowered) return null;
  const rows = await prisma.carrierCity.findMany({
    where: { accountId },
    select: { id: true, ville: true, zone: true, deliveryPrice: true },
  });
  const hit = rows.find((r) => r.ville.toLowerCase() === lowered);
  if (!hit) return null;
  return {
    ...hit,
    deliveryPrice: hit.deliveryPrice === null ? null : Number(hit.deliveryPrice),
  };
}
