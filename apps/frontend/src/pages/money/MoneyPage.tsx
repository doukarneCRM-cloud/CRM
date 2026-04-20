import { useState } from 'react';
import { Receipt, Users, Truck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ExpensesTab } from './tabs/ExpensesTab';
import { CommissionTab } from './tabs/CommissionTab';
import { DeliveryInvoiceTab } from './tabs/DeliveryInvoiceTab';

type TabId = 'expenses' | 'commission' | 'delivery';

const TABS: Array<{ id: TabId; label: string; icon: typeof Truck; hint: string }> = [
  { id: 'expenses', label: 'Expenses', icon: Receipt, hint: 'Operational costs — invoices, utilities, ad spend' },
  { id: 'commission', label: 'Commission', icon: Users, hint: 'Per-agent payouts with proof & history' },
  { id: 'delivery', label: 'Delivery Invoice', icon: Truck, hint: 'Carrier fees on delivered orders' },
];

export default function MoneyPage() {
  const [active, setActive] = useState<TabId>('expenses');
  const activeMeta = TABS.find((t) => t.id === active)!;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Money</h1>
        <p className="text-xs text-gray-400">{activeMeta.hint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-gray-100 bg-white p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                'flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:bg-accent hover:text-primary',
              )}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {active === 'expenses' && <ExpensesTab />}
      {active === 'commission' && <CommissionTab />}
      {active === 'delivery' && <DeliveryInvoiceTab />}
    </div>
  );
}
