import { useEffect, useMemo, useState } from 'react';
import { Truck, PhoneCall, TrendingUp } from 'lucide-react';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import { supportApi } from '@/services/ordersApi';
import type { AgentOption } from '@/types/orders';
import { cn } from '@/lib/cn';
import { DeliveryTab } from './tabs/DeliveryTab';
import { ConfirmationTab } from './tabs/ConfirmationTab';
import { ProfitTab } from './tabs/ProfitTab';

type TabId = 'delivery' | 'confirmation' | 'profit';

const TABS: Array<{ id: TabId; label: string; icon: typeof Truck; hint: string }> = [
  { id: 'delivery', label: 'Delivery', icon: Truck, hint: 'Shipping pipeline & on-time rates' },
  { id: 'confirmation', label: 'Confirmation', icon: PhoneCall, hint: 'Call-center funnel' },
  { id: 'profit', label: 'Profit', icon: TrendingUp, hint: 'Revenue minus all costs' },
];

const STATIC_FILTER_CONFIGS: FilterChipConfig[] = [
  { key: 'confirmationStatuses', label: 'Confirmation', options: CONFIRMATION_STATUS_OPTIONS },
  { key: 'shippingStatuses', label: 'Shipping', options: SHIPPING_STATUS_OPTIONS },
  { key: 'sources', label: 'Source', options: SOURCE_OPTIONS },
];

export default function AnalyticsPage() {
  const [active, setActive] = useState<TabId>('delivery');
  const activeMeta = TABS.find((t) => t.id === active)!;

  const [agents, setAgents] = useState<AgentOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    supportApi.agents().then((r) => { if (!cancelled) setAgents(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filterConfigs = useMemo<FilterChipConfig[]>(() => {
    if (agents.length === 0) return STATIC_FILTER_CONFIGS;
    return [
      ...STATIC_FILTER_CONFIGS,
      {
        key: 'agentIds',
        label: 'Agent',
        options: agents.map((a) => ({ value: a.id, label: a.name })),
      },
    ];
  }, [agents]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
          <p className="text-xs text-gray-400">{activeMeta.hint}</p>
        </div>
      </div>

      <GlobalFilterBar filterConfigs={filterConfigs} showDateRange sticky={false} />

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

      {active === 'delivery' && <DeliveryTab />}
      {active === 'confirmation' && <ConfirmationTab />}
      {active === 'profit' && <ProfitTab />}
    </div>
  );
}
