/**
 * In-memory cache of ColiixV2StatusMapping rows. 60 s TTL with explicit
 * invalidation on save — matches the V1 pattern (coliixMappingCache.ts) so
 * ops have one mental model.
 *
 * Lookup order:
 *   1. exact         — Coliix sends "Livré"   → hit
 *   2. normalized    — strip diacritics + lowercase ("livre" matches "Livré")
 *   3. first-token   — first significant token ("livre client" matches "Livré")
 *   4. smart-fallback — string-contains buckets so unknown wordings still
 *      land in delivered / returned / in_transit instead of staying null.
 *      Driven by the same rules surfaced in the admin UI legend.
 */

import type { ShipmentState } from '@prisma/client';
import { prisma } from '../../../shared/prisma';

const CARRIER_CODE = 'coliix_v2';
const TTL_MS = 60_000;

interface CacheEntry {
  rawWording: string;
  // Null = explicit "stay raw" mapping (admin chose not to bucket this
  // wording, or it's auto-discovered and unreviewed). Callers must skip
  // state changes when null.
  internalState: ShipmentState | null;
  isTerminal: boolean;
}

interface CacheState {
  byExact: Map<string, CacheEntry>;
  byNormalized: Map<string, CacheEntry>;
  byFirstToken: Map<string, CacheEntry>;
  loadedAt: number;
}

let cache: CacheState | null = null;
let loadingPromise: Promise<CacheState> | null = null;

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .toLowerCase()
    .trim();
}

function firstToken(s: string): string {
  return normalize(s).split(/\s+/)[0] ?? '';
}

async function loadFromDB(): Promise<CacheState> {
  const rows = await prisma.coliixV2StatusMapping.findMany({
    where: { carrierCode: CARRIER_CODE },
  });
  const byExact = new Map<string, CacheEntry>();
  const byNormalized = new Map<string, CacheEntry>();
  const byFirstToken = new Map<string, CacheEntry>();
  for (const r of rows) {
    const entry: CacheEntry = {
      rawWording: r.rawWording,
      internalState: r.internalState,
      isTerminal: r.isTerminal,
    };
    byExact.set(r.rawWording, entry);
    const norm = normalize(r.rawWording);
    if (norm && !byNormalized.has(norm)) byNormalized.set(norm, entry);
    const tok = firstToken(r.rawWording);
    if (tok && !byFirstToken.has(tok)) byFirstToken.set(tok, entry);
  }
  return { byExact, byNormalized, byFirstToken, loadedAt: Date.now() };
}

async function getCache(): Promise<CacheState> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = loadFromDB()
    .then((c) => {
      cache = c;
      return c;
    })
    .finally(() => {
      loadingPromise = null;
    });
  return loadingPromise;
}

export function invalidateMappingCache() {
  cache = null;
}

export interface MappingHit {
  rawWording: string;
  internalState: ShipmentState;
  isTerminal: boolean;
  tier: 'exact' | 'normalized' | 'first-token' | 'smart-fallback';
}

// String-contains rules mirrored in the admin UI legend. Keep these in sync
// with MappingsModal's "How it works" block.
function smartFallback(rawState: string): MappingHit {
  const norm = normalize(rawState);
  if (norm.includes('livr')) {
    return { rawWording: rawState, internalState: 'delivered', isTerminal: true, tier: 'smart-fallback' };
  }
  if (norm.includes('refus') || norm.includes('retour') || norm.includes('annul')) {
    return { rawWording: rawState, internalState: 'returned', isTerminal: true, tier: 'smart-fallback' };
  }
  return { rawWording: rawState, internalState: 'in_transit', isTerminal: false, tier: 'smart-fallback' };
}

/**
 * Maps a Coliix wording to a ShipmentState. Always returns a hit — admin DB
 * overrides win; otherwise the smart-fallback buckets the wording so no event
 * is left with mappedState = null.
 */
export async function mapWording(rawState: string): Promise<MappingHit> {
  const c = await getCache();
  const exact = c.byExact.get(rawState);
  if (exact && exact.internalState) return { ...exact, internalState: exact.internalState, tier: 'exact' };
  const norm = normalize(rawState);
  const normHit = c.byNormalized.get(norm);
  if (normHit && normHit.internalState) return { ...normHit, internalState: normHit.internalState, tier: 'normalized' };
  const tok = firstToken(rawState);
  const tokHit = c.byFirstToken.get(tok);
  if (tokHit && tokHit.internalState) return { ...tokHit, internalState: tokHit.internalState, tier: 'first-token' };
  return smartFallback(rawState);
}

/**
 * On every ingest of an unknown wording, we upsert a row with NULL
 * internalState so the admin sees the new wording surface in the editor
 * without it silently downgrading the shipment. Null is the "stay raw"
 * sentinel — ingestEvent stores the rawState but skips the enum diff,
 * preserving whatever state earlier mapped events produced.
 */
export async function upsertUnknownWording(rawWording: string): Promise<void> {
  await prisma.coliixV2StatusMapping.upsert({
    where: { carrierCode_rawWording: { carrierCode: CARRIER_CODE, rawWording } },
    create: {
      carrierCode: CARRIER_CODE,
      rawWording,
      internalState: null,
      isTerminal: false,
      note: '(auto-discovered — please review)',
    },
    update: {}, // no-op on re-discovery
  });
  invalidateMappingCache();
}
