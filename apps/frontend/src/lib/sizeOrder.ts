/**
 * Canonical size ordering used by every matrix-style view in the CRM.
 *
 * The team's most common sizes are M, L, XL, XXL — those should appear
 * FIRST when listing or laying out variants in a grid, so the operator's
 * eye lands on the high-volume cells immediately. After that we list
 * the smaller sizes (S, XS, XXS) and then the larger ones (XXXL, 4XL,
 * 5XL). Numeric / non-standard sizes (kid sizes like "8 ans", measured
 * sizes like "36") are sorted by the leading number after the letter
 * sizes.
 *
 * Use `sizeRank` as the comparator for `Array.sort` so any matrix view
 * (Stock matrix, All Orders matrix, etc.) ends up with consistent
 * column ordering.
 */

const PRIORITY: string[] = ['M', 'L', 'XL', 'XXL'];
const SECONDARY: string[] = ['S', 'XS', 'XXS', 'XXXL', '4XL', '5XL', '6XL'];

const PRIORITY_RANK = new Map<string, number>(
  PRIORITY.map((s, i) => [s, i]),
);
const SECONDARY_RANK = new Map<string, number>(
  SECONDARY.map((s, i) => [s, PRIORITY.length + i]),
);

/**
 * Returns a numeric rank for a size string. Lower = earlier in the matrix.
 *
 *   M   → 0
 *   L   → 1
 *   XL  → 2
 *   XXL → 3
 *   S   → 4
 *   XS  → 5
 *   XXS → 6
 *   XXXL → 7
 *   "36" → 100 + 36 = 136
 *   "8 ans" → 100 + 8 = 108
 *   anything else → 1500 (alphabetical fallback applied by caller)
 */
export function sizeRank(s: string | null | undefined): number {
  if (!s) return 9999;
  const key = s.toUpperCase().trim();
  const pri = PRIORITY_RANK.get(key);
  if (pri !== undefined) return pri;
  const sec = SECONDARY_RANK.get(key);
  if (sec !== undefined) return sec;
  // Numeric / measured sizes — sort by the leading number, after the
  // letter buckets. Add 100 so they all land beyond letter sizes.
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (Number.isFinite(n)) return 100 + n;
  return 1500;
}

/**
 * Comparator that sorts sizes by `sizeRank`, with empty strings last,
 * and falls back to alphabetical for anything unrecognised so the
 * order is at least deterministic.
 */
export function compareSizes(a: string | null | undefined, b: string | null | undefined): number {
  const aEmpty = !a;
  const bEmpty = !b;
  if (aEmpty && !bEmpty) return 1;
  if (bEmpty && !aEmpty) return -1;
  if (aEmpty && bEmpty) return 0;
  const r = sizeRank(a) - sizeRank(b);
  if (r !== 0) return r;
  return (a as string).localeCompare(b as string);
}
