import { PackageSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const EVENTS = ['order:updated', 'order:delivered'];

export function ReturnsAwaitingCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.returnsAwaiting(filters),
    EVENTS,
    filters,
  );

  return (
    <GlassCard tone="rose" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tone-rose-500">
          {t('dashboard.cards.returnsAwaiting')}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-rose-100">
          <PackageSearch size={16} className="text-tone-rose-500" strokeWidth={2.4} />
        </div>
      </div>
      <div className="text-[34px] font-bold leading-none tracking-tight text-gray-900">
        {loading ? '…' : (data?.count ?? 0).toLocaleString()}
      </div>
      <div className="text-[11px] text-gray-500">
        {t('dashboard.cards.returnsAwaitingSub')}
      </div>
    </GlassCard>
  );
}
