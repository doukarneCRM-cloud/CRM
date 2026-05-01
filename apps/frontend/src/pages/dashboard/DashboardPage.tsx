import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import { useFilterSync } from '@/hooks/useFilterSync';
import { supportApi } from '@/services/ordersApi';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import type { AgentOption, Product } from '@/types/orders';
import { OrdersCard } from './components/OrdersCard';
import {
  ConfirmationRateCard,
  DeliveryRateCard,
  ReturnRateCard,
} from './components/RatesCards';
import { MergedCard } from './components/MergedCard';
import { RevenueCard } from './components/RevenueCard';
import { CommissionUnpaidCard } from './components/CommissionUnpaidCard';
import { CarrierUnpaidPlaceholderCard } from './components/CarrierUnpaidPlaceholderCard';
import { ReturnsAwaitingCard } from './components/ReturnsAwaitingCard';
import { DailyTrendChart } from './components/DailyTrendChart';
import { ConfirmationDonutCard } from './components/ConfirmationDonutCard';
import { AgentPipelineTable } from './components/AgentPipelineTable';
import { ProductPipelineTable } from './components/ProductPipelineTable';

export default function DashboardPage() {
  const { t } = useTranslation();
  // Sync filters to/from URL so refreshing the page (or sharing the URL)
  // preserves the active filter selection.
  useFilterSync();

  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    let cancelled = false;
    supportApi.agents().then((r) => { if (!cancelled) setAgents(r); }).catch(() => {});
    supportApi.products().then((r) => { if (!cancelled) setProducts(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filterConfigs = useMemo<FilterChipConfig[]>(() => {
    const base: FilterChipConfig[] = [
      {
        key: 'confirmationStatuses',
        label: t('dashboard.filters.confirmation'),
        options: CONFIRMATION_STATUS_OPTIONS,
      },
      {
        key: 'shippingStatuses',
        label: t('dashboard.filters.shipping'),
        options: SHIPPING_STATUS_OPTIONS,
      },
      {
        key: 'sources',
        label: t('dashboard.filters.source'),
        options: SOURCE_OPTIONS,
      },
    ];
    if (products.length > 0) {
      base.push({
        key: 'productIds',
        label: t('dashboard.filters.product'),
        options: products.map((p) => ({ value: p.id, label: p.name })),
      });
    }
    if (agents.length > 0) {
      base.push({
        key: 'agentIds',
        label: t('dashboard.filters.agent'),
        options: agents.map((a) => ({ value: a.id, label: a.name })),
      });
    }
    return base;
  }, [agents, products, t]);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('nav.dashboard')}</h1>
        <p className="text-xs text-gray-400">{t('dashboard.subtitle')}</p>
      </div>

      {/* ── Global filter bar — synced across Orders / Dashboard / Analytics. */}
      <GlobalFilterBar filterConfigs={filterConfigs} showDateRange sticky={false} />

      {/* ── Section 1: KPI cards (top row) ───────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <OrdersCard />
        <ConfirmationRateCard />
        <DeliveryRateCard />
        <ReturnRateCard />
        <MergedCard />
        <RevenueCard />
      </div>

      {/* ── Section 2: Operations cards ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <CommissionUnpaidCard />
        <CarrierUnpaidPlaceholderCard />
        <ReturnsAwaitingCard />
      </div>

      {/* ── Section 3: Daily trend (full-width chart) ────────────────────── */}
      <DailyTrendChart />

      {/* ── Section 4: Confirmation donut (with agent filter) ────────────── */}
      <ConfirmationDonutCard />

      {/* ── Section 5: Pipeline tables ───────────────────────────────────── */}
      <AgentPipelineTable />
      <ProductPipelineTable />
    </div>
  );
}
