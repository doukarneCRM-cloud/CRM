import type { AutomationTrigger } from '@prisma/client';

// Seed bodies shown when an admin first opens the Automation board. Written in
// Darija (Latin script) — owner can edit any of them without schema changes.
export const DEFAULT_TEMPLATES: Record<AutomationTrigger, { body: string; label: string }> = {
  confirmation_confirmed: {
    label: 'Order confirmed',
    body: 'Salam {{customer.name}}, commande dyalek {{product.name}} b {{order.total}}dh tsejlat m3ana. Ghad tsifet lik 9rib, choukran!',
  },
  confirmation_cancelled: {
    label: 'Order cancelled',
    body: 'Salam {{customer.name}}, commande dyalek {{product.name}} tm annulat. Ila kan chi soua2al tnajem tjawbna.',
  },
  confirmation_unreachable: {
    label: 'Unreachable — please call back',
    body: 'Salam {{customer.name}}, hawlna nsyoubek 3la commande {{product.name}} wma l9inakch. 3afak 3awed tssifet lina.',
  },
  shipping_label_created: {
    label: 'Label created',
    body: 'Salam {{customer.name}}, commande dyalek {{product.name}} t7ddat w rahi ghadia l livraison. Ghad nbdaw ntseyfto.',
  },
  shipping_picked_up: {
    label: 'Picked up by carrier',
    body: 'Salam {{customer.name}}, commande dyalek {{product.name}} khrjat m 3andna w rahi f triq. Ghadi twsellek fi kam youm.',
  },
  shipping_in_transit: {
    label: 'In transit',
    body: 'Salam {{customer.name}}, colis dyalek rah f triq, ghad nwaslouk 9rib.',
  },
  shipping_out_for_delivery: {
    label: 'Out for delivery',
    body: 'Salam {{customer.name}}, commande {{product.name}} {{order.total}}dh taji lyoum. 3afak khalli telefonk m3ak.',
  },
  shipping_delivered: {
    label: 'Delivered',
    body: 'Salam {{customer.name}}, choukran 3la commande dyalek {{product.name}}. Nchallah tla9iha 3la khatrek!',
  },
  shipping_returned: {
    label: 'Returned',
    body: 'Salam {{customer.name}}, colis dyalek rj3 l 3andna. Ila bghiti t3awed tssifet, tkelmi m3ana.',
  },
  shipping_return_validated: {
    label: 'Return validated',
    body: 'Salam {{customer.name}}, rj3 dyal commande {{product.name}} tm t2kid.',
  },
  commission_paid: {
    label: 'Commission paid (agent)',
    body: 'Salam {{agent.name}}, khlsnak commission dyalek {{commission.amount}}dh 3la {{commission.orderCount}} commande. Choukran 3la lkhedma!',
  },
};

// Ordered list used by the UI so triggers always show in the same logical order.
export const TRIGGER_ORDER: AutomationTrigger[] = [
  'confirmation_confirmed',
  'confirmation_cancelled',
  'confirmation_unreachable',
  'shipping_label_created',
  'shipping_picked_up',
  'shipping_in_transit',
  'shipping_out_for_delivery',
  'shipping_delivered',
  'shipping_returned',
  'shipping_return_validated',
  'commission_paid',
];
