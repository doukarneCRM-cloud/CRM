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
    <GlassCard className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <GitMerge size={14} />
        {t('dashboard.cards.merged')}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
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
