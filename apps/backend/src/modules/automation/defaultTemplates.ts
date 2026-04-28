import type { AutomationTrigger } from '@prisma/client';

// Triggers that the UI surfaces and that ensureDefaultTemplates seeds. The
// shipping_* triggers were retired once Coliix-state templates landed —
// every shipping notification is now driven by Coliix's literal wording
// (Ramassé, Livré, …) via ColiixStateTemplate, not by our internal enum.
// They're kept in the AutomationTrigger enum for back-compat with old
// MessageLog rows, but the dispatcher no longer fires them.
type ActiveTrigger =
  | 'confirmation_confirmed'
  | 'confirmation_cancelled'
  | 'confirmation_unreachable'
  | 'commission_paid';

// Seed bodies shown when an admin first opens the Automation board. Written
// in Darija (Latin script) — owner can edit any of them without schema
// changes.
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
  commission_paid: {
    label: 'Commission paid (agent)',
    body: 'Salam {{agent.name}}, khlsnak commission dyalek {{commission.amount}}dh 3la {{commission.orderCount}} commande. Choukran 3la lkhedma!',
  },
};

// Ordered list used by the UI so triggers always show in the same logical
// order. Cast to AutomationTrigger so the rest of the codebase (which
// imports AutomationTrigger directly) keeps compiling.
export const TRIGGER_ORDER: AutomationTrigger[] = [
  'confirmation_confirmed' as AutomationTrigger,
  'confirmation_cancelled' as AutomationTrigger,
  'confirmation_unreachable' as AutomationTrigger,
  'commission_paid' as AutomationTrigger,
];
