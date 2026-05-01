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
    <GlassCard className="flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <ShoppingCart size={14} />
        {t('dashboard.cards.orders.title')}
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {loading ? '…' : (data?.total ?? 0).toLocaleString()}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md bg-indigo-50 px-2 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
            {t('dashboard.cards.orders.pending')}
          </div>
          <div className="text-base font-bold text-indigo-900">
            {loading ? '…' : (data?.pending ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-md bg-amber-50 px-2 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-600">
            {t('dashboard.cards.orders.notAssigned')}
          </div>
          <div className="text-base font-bold text-amber-900">
            {loading ? '…' : (data?.notAssigned ?? 0).toLocaleString()}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
