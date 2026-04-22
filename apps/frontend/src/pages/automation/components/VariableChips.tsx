import type { AutomationTrigger } from '@/services/automationApi';

type ChipGroup = { scope: string; keys: string[] };

const CLIENT_BASE: ChipGroup[] = [
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
  return trigger === 'commission_paid' ? COMMISSION : CLIENT_BASE;
}

interface Props {
  trigger: AutomationTrigger;
  onInsert: (token: string) => void;
}

export function VariableChips({ trigger, onInsert }: Props) {
  const groups = chipsForTrigger(trigger);
  return (
    <div className="flex flex-wrap gap-1.5">
      {groups.flatMap((g) =>
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
