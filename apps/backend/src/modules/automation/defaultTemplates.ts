import type { AutomationTrigger } from '@prisma/client';

// Triggers the UI surfaces and `ensureDefaultTemplates` seeds. One template
// row per trigger; empty bodies + disabled by default so admins consciously
// turn each one on.
type ActiveTrigger =
  | 'confirmation_confirmed'
  | 'confirmation_cancelled'
  | 'confirmation_unreachable'
  | 'confirmation_callback'
  | 'confirmation_reported'
  | 'shipping_pushed'
  | 'shipping_picked_up'
  | 'shipping_in_transit'
  | 'shipping_out_for_delivery'
  | 'shipping_failed_delivery'
  | 'shipping_reported'
  | 'shipping_delivered'
  | 'shipping_returned'
  | 'commission_paid';

// Seed bodies in Darija (Latin script). Admin can edit any of them.
export const DEFAULT_TEMPLATES: Record<ActiveTrigger, { body: string; label: string }> = {
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
  confirmation_callback: {
    label: 'Callback scheduled',
    body: 'Salam {{customer.name}}, ghadi n3iytlek f l-wa9t li tafqna 3lih. Choukran!',
  },
  confirmation_reported: {
    label: 'Reported (later date)',
    body: 'Salam {{customer.name}}, sjjjelna talab dyalek {{product.name}}. Ghadi nrj3o n3iyto lik f l-wa9t li tafqna 3lih.',
  },
  shipping_pushed: {
    label: 'Sent to carrier',
    body: 'Commande dyalek {{product.name}} sifena-ha l-Coliix. Tracking: {{shipment.tracking}}.',
  },
  shipping_picked_up: {
    label: 'Parcel picked up',
    body: 'Commande dyalek {{product.name}} dazat 3and l-livreur. Ghadi twaslek qrib.',
  },
  shipping_in_transit: {
    label: 'In transit',
    body: 'Commande dyalek f t-tari9 ila {{customer.city}}.',
  },
  shipping_out_for_delivery: {
    label: 'Out for delivery',
    body: 'L-livreur khrej b commande dyalek {{product.name}} l-yum. Astanani.',
  },
  shipping_failed_delivery: {
    label: 'Delivery attempt failed',
    body: 'Hawlna nwasslo lik commande dyalek {{product.name}} walakin makanch ja-jib. Ghadi n3awdo n3iyto lik.',
  },
  shipping_reported: {
    label: 'Delivery postponed',
    body: 'Tafqna m3ak bach nwasslo lik commande dyalek {{product.name}} f wa9t akhir.',
  },
  shipping_delivered: {
    label: 'Delivered',
    body: 'Choukran {{customer.name}}! Commande dyalek twaslat. Nansslouk t3awd m3ana.',
  },
  shipping_returned: {
    label: 'Returned to warehouse',
    body: 'Commande dyalek {{product.name}} rj3at lina. Tssal m3ana ila bghiti tla9aha 3awd.',
  },
  commission_paid: {
    label: 'Commission paid (agent)',
    body: 'Salam {{agent.name}}, khlsnak commission dyalek {{commission.amount}}dh 3la {{commission.orderCount}} commande. Choukran 3la lkhedma!',
  },
};

// Display order in the Automation UI. Cast through AutomationTrigger because
// the Prisma-generated union is the wire-level type.
export const TRIGGER_ORDER: AutomationTrigger[] = [
  'confirmation_confirmed' as AutomationTrigger,
  'confirmation_cancelled' as AutomationTrigger,
  'confirmation_unreachable' as AutomationTrigger,
  'confirmation_callback' as AutomationTrigger,
  'confirmation_reported' as AutomationTrigger,
  'shipping_pushed' as AutomationTrigger,
  'shipping_picked_up' as AutomationTrigger,
  'shipping_in_transit' as AutomationTrigger,
  'shipping_out_for_delivery' as AutomationTrigger,
  'shipping_failed_delivery' as AutomationTrigger,
  'shipping_reported' as AutomationTrigger,
  'shipping_delivered' as AutomationTrigger,
  'shipping_returned' as AutomationTrigger,
  'commission_paid' as AutomationTrigger,
];
