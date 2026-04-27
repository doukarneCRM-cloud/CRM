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
  { keys: ['livre', 'livree', 'delivered', 'livraison_effectuee'], status: 'delivered' },

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

  // Out for delivery
  {
    keys: ['en_livraison', 'en_cours_de_livraison', 'out_for_delivery', 'livreur_en_route'],
    status: 'out_for_delivery',
  },

  // Delivery attempted (client absent / reschedule)
  {
    keys: ['tentative', 'client_absent', 'non_livre', 'attempted', 'tentative_de_livraison'],
    status: 'attempted',
  },

  // In transit
  {
    keys: ['en_cours', 'en_transit', 'in_transit', 'transite', 'en_route'],
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
    ],
    status: 'label_created',
  },

  // Picked up from warehouse — courier physically collected the parcel
  {
    keys: ['pris_en_charge', 'ramassage', 'pickup', 'picked_up', 'collecte', 'recupere'],
    status: 'picked_up',
  },
];

/** Returns the mapped ShippingStatus, or null when Coliix's state is unknown. */
export function mapColiixState(rawState: string | null | undefined): ShippingStatus | null {
  if (!rawState) return null;
  const key = normalize(rawState);
  if (!key) return null;
  for (const rule of RULES) {
    if (rule.keys.includes(key)) return rule.status;
  }
  // Loose prefix/suffix fallback — lets us catch "livraison réussie" → livre etc.
  for (const rule of RULES) {
    if (rule.keys.some((k) => key.includes(k) || k.includes(key))) return rule.status;
  }
  return null;
}
