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
 * The order matters because of the loose substring fallback at the bottom of
 * mapColiixState. "Attente de ramassage" used to fall through to `picked_up`
 * via the `ramassage` substring before this rule list was reorganised — the
 * waiting-for-pickup state is semantically still a pre-pickup state, so we
 * keep `attente_de_ramassage` as an exact key in `label_created` ABOVE the
 * `picked_up` rule, ensuring the label-stage rule wins for that input.
 */
const RULES: Array<{ keys: string[]; status: ShippingStatus }> = [
  // Delivered — most positive terminal state
  // `recu` covers Coliix's "Reçu" wording (= parcel received by client).
  {
    keys: [
      'livre', 'livree', 'delivered', 'livraison_effectuee',
      'recu', 'recue',
    ],
    status: 'delivered',
  },

  // Return validated (accepted by admin)
  { keys: ['retour_valide', 'return_validated'], status: 'return_validated' },

  // Return refused / refused at door
  {
    keys: ['refuse', 'refuse_par_client', 'client_refuse', 'return_refused', 'retour_refuse'],
    status: 'return_refused',
  },

  // Returned (parcel coming back)
  {
    keys: ['retour', 'retourne', 'en_retour', 'returned', 'retour_en_cours'],
    status: 'returned',
  },

  // Exchange
  { keys: ['echange', 'exchange'], status: 'exchange' },

  // Destroyed / lost
  { keys: ['detruit', 'destroyed'], status: 'destroyed' },
  { keys: ['perdu', 'lost'], status: 'lost' },

  // Out for delivery — "Mise en distribution" is Coliix's wording for
  // "the courier is out delivering today".
  {
    keys: [
      'en_livraison', 'en_cours_de_livraison', 'out_for_delivery',
      'livreur_en_route', 'mise_en_distribution',
    ],
    status: 'out_for_delivery',
  },

  // Delivery attempted (client absent / reschedule). `injoignable`,
  // `reporte`, `client_interesse` are Coliix wordings for "the courier
  // tried but couldn't drop the parcel" — same operational meaning.
  {
    keys: [
      'tentative', 'client_absent', 'non_livre', 'attempted',
      'tentative_de_livraison', 'injoignable', 'reporte',
      'client_interesse',
    ],
    status: 'attempted',
  },

  // In transit — "Expédié" is Coliix's wording for "shipped" / left
  // the warehouse, parcel now travelling toward the destination.
  {
    keys: [
      'en_cours', 'en_transit', 'in_transit', 'transite', 'en_route',
      'expedie', 'expediee',
    ],
    status: 'in_transit',
  },

  // Label/parcel registered — keep ABOVE picked_up so "Attente de ramassage"
  // (waiting-for-pickup) lands here via the exact key match instead of being
  // pulled into `picked_up` by the `ramassage` substring fallback.
  {
    keys: [
      'cree', 'nouveau', 'new', 'created', 'pending',
      'label_created', 'prete', 'en_attente',
      'attente_de_ramassage', 'en_attente_de_ramassage', 'attente_ramassage',
      'nouveau_colis',
    ],
    status: 'label_created',
  },

  // Picked up from warehouse — courier physically collected the parcel.
  // `ramasse` is the past participle Coliix emits ("Ramassé") and
  // `confirmer_par_le_livreur` is the wording for "courier confirmed
  // receipt" — both belong here, NOT in delivered. Without explicit
  // exact keys the substring fallback used to pull these into the
  // wrong bucket (livre being a substring of livreur was the killer).
  {
    keys: [
      'pris_en_charge', 'ramasse', 'ramassee', 'ramasses',
      'ramassage', 'pickup', 'picked_up', 'collecte', 'recupere',
      'confirmer_par_le_livreur', 'confirme_par_le_livreur',
      'confirmation_du_livreur', 'recu_par_le_livreur',
    ],
    status: 'picked_up',
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
  // input. That prevents weakly-shared tokens like `client` from
  // mis-routing "Client intéressé" → return_refused via
  // `refuse_par_client`'s `client` token. It still resolves the cases
  // the fallback was designed for: "Refusé par le client" matches the
  // rule key `refuse` (one specific token, present), "Livraison
  // effectuée" matches `livraison_effectuee` (both specific tokens
  // present), "Tentative 2" matches `tentative` (one specific token
  // present).
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
