/**
 * Coliix → CRM shipping status mapping.
 *
 * Reads from the admin-editable ColiixStatusMapping table via an
 * in-memory cache (coliixMappingCache.ts). The previous hard-coded
 * RULES array is gone — admins now manage mappings through the
 * Settings → Coliix → Status mappings UI.
 *
 * The migration that created the table seeded it with the same
 * Livré→delivered and Retour*→returned rules the code used to define,
 * so day-zero behaviour is byte-identical to the previous strict
 * version. Subsequent ingest events upsert any newly observed Coliix
 * wording with internalStatus = NULL, so the editor lists everything
 * the system has ever seen.
 *
 * mapColiixState became async because the cache may need a one-time
 * load before serving. Callers were already in async paths; the only
 * adjustment was adding the `await`.
 */

export {
  lookupColiixMapping as mapColiixState,
  invalidateColiixMappingCache,
  normalize,
} from './coliixMappingCache';
