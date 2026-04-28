import type { AutomationTrigger } from '@/services/automationApi';

type ChipGroup = { scope: string; keys: string[] };

// Order-context chips. Used by every order-keyed automation, including
// the new Coliix-state templates that fire on shipping wording changes.
export const CLIENT_BASE_CHIPS: ChipGroup[] = [
  { scope: 'customer', keys: ['name', 'phone', 'city'] },
  { scope: 'order', keys: ['reference', 'total', 'shippingPrice', 'itemCount'] },
  { scope: 'product', keys: ['name'] },
  { scope: 'variant', keys: ['size', 'color'] },
  { scope: 'agent', keys: ['name', 'phone'] },
];

const COMMISSION: ChipGroup[] = [
  { scope: 'agent', keys: ['name', 'phone'] },
  { scope: 'commission', keys: ['amount', 'orderCount', 'periodFrom', 'periodTo'] },
];

export function chipsForTrigger(trigger: AutomationTrigger): ChipGroup[] {
  return trigger === 'commission_paid' ? COMMISSION : CLIENT_BASE_CHIPS;
}

interface Props {
  // Drive the chip set either from a known enum trigger (legacy templates)
  // or from an explicit groups array (Coliix-state templates etc.).
  trigger?: AutomationTrigger;
  groups?: ChipGroup[];
  onInsert: (token: string) => void;
}

export function VariableChips({ trigger, groups, onInsert }: Props) {
  const resolved = groups ?? (trigger ? chipsForTrigger(trigger) : CLIENT_BASE_CHIPS);
  return (
    <div className="flex flex-wrap gap-1.5">
      {resolved.flatMap((g) =>
        g.keys.map((k) => {
          const token = `{{${g.scope}.${k}}}`;
          return (
            <button
              key={token}
              type="button"
              onClick={() => onInsert(token)}
              className="rounded-badge border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:border-primary hover:bg-accent hover:text-primary"
            >
              {token}
            </button>
          );
        }),
      )}
    </div>
  );
}
