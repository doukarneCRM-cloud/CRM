import { useEffect, useMemo, useState } from 'react';
import { Truck, PhoneCall, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import { supportApi } from '@/services/ordersApi';
import { coliixApi } from '@/services/providersApi';
import type { AgentOption } from '@/types/orders';
import { cn } from '@/lib/cn';
import { DeliveryTab } from './tabs/DeliveryTab';
import { ConfirmationTab } from './tabs/ConfirmationTab';
import { ProfitTab } from './tabs/ProfitTab';

type TabId = 'delivery' | 'confirmation' | 'profit';

export default function AnalyticsPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<TabId>('delivery');

  const TABS = useMemo(
    () => [
      {
        id: 'delivery' as TabId,
        label: t('analytics.tabs.delivery.label'),
        icon: Truck,
        hint: t('analytics.tabs.delivery.hint'),
      },
      {
        id: 'confirmation' as TabId,
        label: t('analytics.tabs.confirmation.label'),
        icon: PhoneCall,
        hint: t('analytics.tabs.confirmation.hint'),
      },
      {
        id: 'profit' as TabId,
        label: t('analytics.tabs.profit.label'),
        icon: TrendingUp,
        hint: t('analytics.tabs.profit.hint'),
      },
    ],
    [t],
  );

  const activeMeta = TABS.find((tab) => tab.id === active)!;

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [coliixStates, setColiixStates] = useState<Array<{ value: string; count: number }>>([]);
  useEffect(() => {
    let cancelled = false;
    supportApi.agents().then((r) => { if (!cancelled) setAgents(r); }).catch(() => {});
    coliixApi.states().then((r) => { if (!cancelled) setColiixStates(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filterConfigs = useMemo<FilterChipConfig[]>(() => {
    const staticConfigs: FilterChipConfig[] = [
      { key: 'confirmationStatuses', label: t('analytics.filters.confirmation'), options: CONFIRMATION_STATUS_OPTIONS },
      // Shipping chip — same Coliix-driven dropdown as Orders + Dashboard
      // so a single selection on the global filter bar narrows every page
      // by the same Coliix wording.
      {
        key: 'coliixRawStates',
        label: t('analytics.filters.shipping'),
        options: coliixStates.map((s) => ({
          value: s.value,
          label: `${s.value} (${s.count})`,
        })),
      },
      { key: 'sources', label: t('analytics.filters.source'), options: SOURCE_OPTIONS },
    ];
    if (agents.length === 0) return staticConfigs;
    return [
      ...staticConfigs,
      {
        key: 'agentIds',
        label: t('analytics.filters.agent'),
        options: agents.map((a) => ({ value: a.id, label: a.name })),
      },
    ];
  }, [agents, coliixStates, t]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('analytics.page.title')}</h1>
          <p className="text-xs text-gray-400">{activeMeta.hint}</p>
        </div>
      </div>

      <GlobalFilterBar filterConfigs={filterConfigs} showDateRange sticky={false} />

      <div className="flex flex-wrap items-center gap-2 rounded-card border border-gray-100 bg-white p-1.5">
        {TABS.map((tab) => {
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

      {active === 'delivery' && <DeliveryTab />}
      {active === 'confirmation' && <ConfirmationTab />}
      {active === 'profit' && <ProfitTab />}
    </div>
  );
}
