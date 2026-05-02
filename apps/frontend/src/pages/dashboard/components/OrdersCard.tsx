import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const EVENTS = [
  'order:created',
  'order:archived',
  'order:bulk_updated',
  'order:assigned',
  'order:updated',
];

export function OrdersCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.orders(filters),
    EVENTS,
    filters,
  );

  return (
    <GlassCard tone="lavender" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tone-lavender-500">
          {t('dashboard.cards.orders.title')}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-lavender-100">
          <ShoppingCart size={16} className="text-tone-lavender-500" strokeWidth={2.4} />
        </div>
      </div>
      <div className="text-[34px] font-bold leading-none tracking-tight text-gray-900">
        {loading ? '…' : (data?.total ?? 0).toLocaleString()}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-white/60 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-tone-lavender-500">
            {t('dashboard.cards.orders.pending')}
          </div>
          <div className="text-base font-bold text-gray-900">
            {loading ? '…' : (data?.pending ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl bg-white/60 px-3 py-2 backdrop-blur-sm">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-tone-amber-500">
            {t('dashboard.cards.orders.notAssigned')}
          </div>
          <div className="text-base font-bold text-gray-900">
            {loading ? '…' : (data?.notAssigned ?? 0).toLocaleString()}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
