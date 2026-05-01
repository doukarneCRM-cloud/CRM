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
    <GlassCard className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-red-600">
        <PackageSearch size={14} />
        {t('dashboard.cards.returnsAwaiting')}
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {loading ? '…' : (data?.count ?? 0).toLocaleString()}
      </div>
      <div className="text-[11px] text-gray-500">
        {t('dashboard.cards.returnsAwaitingSub')}
      </div>
    </GlassCard>
  );
}
