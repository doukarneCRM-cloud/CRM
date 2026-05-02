import { GitMerge } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const EVENTS = ['order:archived', 'order:updated', 'order:created'];

export function MergedCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.merged(filters),
    EVENTS,
    filters,
  );

  return (
    <GlassCard tone="amber" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tone-amber-500">
          {t('dashboard.cards.merged')}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-amber-100">
          <GitMerge size={16} className="text-tone-amber-500" strokeWidth={2.4} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] font-bold leading-none tracking-tight text-gray-900">
          {loading ? '…' : (data?.rate ?? 0).toFixed(1)}
        </span>
        <span className="text-sm font-semibold text-gray-400">%</span>
      </div>
      <div className="text-[11px] text-gray-500">
        {loading
          ? '…'
          : t('dashboard.cards.mergedSubtitle', {
              merged: (data?.merged ?? 0).toLocaleString(),
              total: (data?.total ?? 0).toLocaleString(),
            })}
      </div>
    </GlassCard>
  );
}
