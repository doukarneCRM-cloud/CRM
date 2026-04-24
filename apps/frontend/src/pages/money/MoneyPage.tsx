import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, Users, Truck } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ExpensesTab } from './tabs/ExpensesTab';
import { CommissionTab } from './tabs/CommissionTab';
import { DeliveryInvoiceTab } from './tabs/DeliveryInvoiceTab';

type TabId = 'expenses' | 'commission' | 'delivery';

export default function MoneyPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabId>('expenses');

  const tabs: Array<{ id: TabId; label: string; icon: typeof Truck; hint: string }> = useMemo(
    () => [
      { id: 'expenses',   label: t('money.tabs.expenses.label'),   icon: Receipt, hint: t('money.tabs.expenses.hint')   },
      { id: 'commission', label: t('money.tabs.commission.label'), icon: Users,   hint: t('money.tabs.commission.hint') },
      { id: 'delivery',   label: t('money.tabs.delivery.label'),   icon: Truck,   hint: t('money.tabs.delivery.hint')   },
    ],
    [t],
  );

  const activeMeta = tabs.find((tab) => tab.id === active)!;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('money.title')}</h1>
        <p className="text-xs text-gray-400">{activeMeta.hint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-gray-100 bg-white p-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex flex-1 min-w-[140px] items-center justify-center gap-2 rounded-btn px-4 py-2.5 text-sm font-semibold transition-all',
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-gray-500 hover:bg-accent hover:text-primary',
              )}
            >
              <Icon size={16} />
              {tab.label}
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
