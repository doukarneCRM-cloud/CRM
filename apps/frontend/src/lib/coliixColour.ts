/**
 * Stable colour for a Coliix raw-state wording.
 *
 * Used wherever a Coliix state pill is rendered (orders table, call-center,
 * order log timeline, dashboard) so the same wording reads as the same colour
 * everywhere — agents learn "orange = en retour" once and it sticks.
 *
 * A handful of well-known wordings get a meaningful semantic colour
 * (delivered → green, refused → red, …); everything else falls back to a
 * deterministic FNV-1a hash over the raw string so repeated wordings keep
 * the same colour across renders without us having to maintain a giant
 * mapping table.
 */

const COLIIX_PALETTE = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#06B6D4', '#EC4899', '#84CC16', '#F97316', '#6366F1',
  '#14B8A6', '#A855F7',
];

export function colourForColiixRawState(raw: string): string {
  const k = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
  if (k.includes('livre')) return '#10B981';            // delivered
  if (k.includes('refuse')) return '#EF4444';           // refused
  if (k.includes('retour')) return '#F97316';           // returned
  if (k.includes('expedie') || k.includes('cours')) return '#3B82F6';
  if (k.includes('ramasse')) return '#A855F7';          // picked up
  if (k.includes('attente') || k.includes('nouveau')) return '#9CA3AF';
  if (k.includes('injoignable')) return '#F59E0B';
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return COLIIX_PALETTE[h % COLIIX_PALETTE.length];
}
