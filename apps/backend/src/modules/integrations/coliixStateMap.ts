/**
 * Coliix → CRM shipping status mapping.
 *
 * Coliix returns free-form French state strings in webhooks and tracking
 * responses ("En cours", "Livré", "Refusé", …). We normalize aggressively
 * (lowercase, strip accents, trim) so minor variations in casing or spelling
 * never cause a missed update. Unknown states fall through and are logged
 * without changing the order's CRM status.
 */

import type { ShippingStatus } from '@prisma/client';

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Ordered from most-specific to most-general. First matching normalized key wins.
 * Values are Prisma's ShippingStatus enum — keep in sync with schema.prisma.
 *
 * The operator wants ONLY two transitions to flow into our internal
 * shipping enum:
 *
 *   - "Livré" / "Livrée" → delivered      (drives revenue, KPIs, commission)
 *   - "Retour" / "Retourné" / etc. → returned (drives the returns workflow)
 *
 * Every other Coliix wording (Ramassé, Expédié, Mise en distribution, En
 * cours, Attente de ramassage, Refusé par client, Tentative, …) stays
 * unmapped — coliixRawState is updated with the literal text for display
 * everywhere, but shippingStatus is left alone so transient courier
 * states don't pollute reporting. Operators handle nuance manually
 * through the order action panel when they need to.
 */
const RULES: Array<{ keys: string[]; status: ShippingStatus }> = [
  // Delivered — STRICTLY "Livré" / "Livrée" (and the English literal,
  // kept as an unambiguous safety net even though Coliix is French-only).
  // Anything else (Reçu, Livraison effectuée, …) stays unmapped.
  { keys: ['livre', 'livree', 'delivered'], status: 'delivered' },

  // Returned — covers all the obvious "the parcel is coming back"
  // wordings. return_validated / return_refused / exchange used to be
  // separate enum buckets; per operator request they're no longer
  // mapped automatically. The operator promotes them by hand from the
  // order panel when the physical return is verified.
  {
    keys: [
      'retour', 'retourne', 'retournee', 'en_retour', 'retour_en_cours',
      'returned',
    ],
    status: 'returned',
  },
];

// Word-boundary tokeniser: split on `_` so the loose fallback compares
// whole tokens rather than raw substrings. The old `String.includes`
// approach made "livre" (delivered) match "livreur" (in "Confirmer par
// le livreur") and silently flipped shipped-not-delivered orders to
// delivered.
function tokens(s: string): string[] {
  return s.split('_').filter(Boolean);
}

// Generic / structural words that can appear in many unrelated wordings
// ("client" shows up in both "Client absent" → attempted and "Refusé
// par client" → return_refused, etc.). We exclude them when deciding
// whether a rule key shares enough specificity with the input to count
// as a match. Keeps "client" alone from being a strong signal — only a
// SECOND token (refuse / absent / …) can disambiguate.
const GENERIC_TOKENS = new Set([
  'par', 'le', 'la', 'les', 'de', 'du', 'des', 'au', 'aux', 'a',
  'en', 'et', 'ou', 'avec', 'pour', 'non', 'colis', 'client',
]);

/** Returns the mapped ShippingStatus, or null when Coliix's state is unknown. */
export function mapColiixState(rawState: string | null | undefined): ShippingStatus | null {
  if (!rawState) return null;
  const key = normalize(rawState);
  if (!key) return null;

  // Exact match — the fast, most-trusted path. Most known Coliix wordings
  // resolve here.
  for (const rule of RULES) {
    if (rule.keys.includes(key)) return rule.status;
  }

  // Token fallback. Stricter than a simple "any token matches" — we
  // require ALL of a rule key's NON-GENERIC tokens to be present in the
  // input. With the operator-narrowed rule list (only delivered + returned)
  // this mostly catches "retour …" variants ("Retour client", "Retour
  // entreprise", …) that all share the `retour` token and should still
  // flip the order to `returned`.
  const inputTokens = new Set(tokens(key));
  for (const rule of RULES) {
    for (const k of rule.keys) {
      const specific = tokens(k).filter((t) => !GENERIC_TOKENS.has(t));
      if (specific.length === 0) continue; // key was all-generic, skip
      if (specific.every((t) => inputTokens.has(t))) return rule.status;
    }
  }
  return null;
}
