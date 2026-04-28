/**
 * In-memory cache for the admin-editable ColiixStatusMapping table.
 *
 * Why this exists:
 *   - mapColiixState() is on the hot path — every webhook hit, every
 *     poller tick, every remap iteration calls it. A round-trip to
 *     Postgres per call would make the integrations layer noticeably
 *     slower under load, so we keep a process-local snapshot.
 *   - Saves invalidate the cache explicitly. The 60s TTL is a safety
 *     net for distributed deploys (if a future deploy splits across
 *     multiple instances and one instance saves while the other
 *     doesn't get the socket).
 *
 * Lookup behaviour preserves the pre-database semantics:
 *   1. Exact-string match on the literal wording (the fast, trusted path).
 *      Most calls resolve here because ingestStatus and trackOrderNow
 *      now upsert a row for every wording they observe.
 *   2. Normalized match — strips diacritics and collapses non-alphanumerics
 *      to underscores so case/accent/spacing variations still resolve.
 *   3. Token fallback — a rule key whose NON-GENERIC tokens are all
 *      present in the input maps. Catches "Retour client" / "Retour
 *      entreprise" against the seeded "Retour" row.
 */

import type { ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';

const TTL_MS = 60_000;

interface MappingEntry {
  wording: string;            // raw wording (display)
  normalized: string;         // normalize(wording)
  internalStatus: ShippingStatus | null;
}

let entries: MappingEntry[] = [];
let exact = new Map<string, ShippingStatus | null>();
let normalized = new Map<string, ShippingStatus | null>();
let loadedAt = 0;
let inflightLoad: Promise<void> | null = null;

export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tokens(s: string): string[] {
  return s.split('_').filter(Boolean);
}

const GENERIC_TOKENS = new Set([
  'par', 'le', 'la', 'les', 'de', 'du', 'des', 'au', 'aux', 'a',
  'en', 'et', 'ou', 'avec', 'pour', 'non', 'colis', 'client',
]);

async function loadFromDb(): Promise<void> {
  const rows = await prisma.coliixStatusMapping.findMany({
    select: { coliixWording: true, internalStatus: true },
  });

  const nextEntries: MappingEntry[] = [];
  const nextExact = new Map<string, ShippingStatus | null>();
  const nextNormalized = new Map<string, ShippingStatus | null>();

  for (const row of rows) {
    const wording = row.coliixWording.trim();
    if (!wording) continue;
    const norm = normalize(wording);
    nextEntries.push({ wording, normalized: norm, internalStatus: row.internalStatus });
    nextExact.set(wording, row.internalStatus);
    if (norm) nextNormalized.set(norm, row.internalStatus);
  }

  entries = nextEntries;
  exact = nextExact;
  normalized = nextNormalized;
  loadedAt = Date.now();
}

async function ensureLoaded(): Promise<void> {
  if (entries.length > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (inflightLoad) return inflightLoad;
  inflightLoad = loadFromDb().finally(() => {
    inflightLoad = null;
  });
  return inflightLoad;
}

/**
 * Force a re-read on the next lookup. Called from the mapping service
 * after a successful save so subsequent webhook hits don't see stale
 * data.
 */
export function invalidateColiixMappingCache(): void {
  loadedAt = 0;
}

/**
 * Resolve a Coliix wording to our internal ShippingStatus.
 *
 * Returns:
 *   - ShippingStatus enum value if the wording maps
 *   - null if the wording is known but explicitly "stay raw"
 *   - null if the wording is unknown (caller treats both the same way)
 *
 * The caller distinguishes "known but unmapped" from "never seen" via
 * the auto-discover upsert in ingestStatus, which guarantees every
 * observed wording has a row.
 */
export async function lookupColiixMapping(
  rawState: string | null | undefined,
): Promise<ShippingStatus | null> {
  if (!rawState) return null;
  await ensureLoaded();

  const trimmed = rawState.trim();
  if (!trimmed) return null;

  // 1. Literal match — fastest, most trusted.
  if (exact.has(trimmed)) return exact.get(trimmed) ?? null;

  // 2. Normalized match.
  const norm = normalize(trimmed);
  if (norm && normalized.has(norm)) return normalized.get(norm) ?? null;

  // 3. Token fallback — a rule whose non-generic tokens are all present
  //    in the input. Catches "Retour client" against "Retour" without
  //    matching weakly-shared tokens like `client` alone.
  if (norm) {
    const inputTokens = new Set(tokens(norm));
    for (const entry of entries) {
      const specific = tokens(entry.normalized).filter((t) => !GENERIC_TOKENS.has(t));
      if (specific.length === 0) continue;
      if (specific.every((t) => inputTokens.has(t))) return entry.internalStatus;
    }
  }

  return null;
}
