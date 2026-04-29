/**
 * In-memory cache of ColiixV2StatusMapping rows. 60 s TTL with explicit
 * invalidation on save — matches the V1 pattern (coliixMappingCache.ts) so
 * ops have one mental model.
 *
 * Three-tier lookup:
 *   1. exact     — Coliix sends "Livré"   → hit
 *   2. normalized — strip diacritics + lowercase ("livre" matches "Livré")
 *   3. token      — first significant token ("livre client" matches "Livré")
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
  internalState: ShipmentState | null;
  isTerminal: boolean;
  tier: 'exact' | 'normalized' | 'first-token';
}

/** Maps a Coliix wording to a ShipmentState. Returns null if no rule found. */
export async function mapWording(rawState: string): Promise<MappingHit | null> {
  const c = await getCache();
  const exact = c.byExact.get(rawState);
  if (exact) return { ...exact, tier: 'exact' };
  const norm = normalize(rawState);
  const normHit = c.byNormalized.get(norm);
  if (normHit) return { ...normHit, tier: 'normalized' };
  const tok = firstToken(rawState);
  const tokHit = c.byFirstToken.get(tok);
  if (tokHit) return { ...tokHit, tier: 'first-token' };
  return null;
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
