import { Coins } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const EVENTS = ['order:delivered', 'order:updated'];

const fmtMAD = (n: number) =>
  n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });

export function RevenueCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.revenue(filters),
    EVENTS,
    filters,
  );

  return (
    <GlassCard className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <Coins size={14} />
        {t('dashboard.cards.revenue')}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
          {loading ? '…' : fmtMAD(data?.revenue ?? 0)}
        </span>
        <span className="text-xs font-semibold text-gray-400">MAD</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded bg-emerald-50 px-2 py-1.5">
          <div className="font-semibold uppercase tracking-wide text-emerald-700">
            {t('dashboard.cards.delivered')}
          </div>
          <div className="font-bold text-emerald-900">
            {loading ? '…' : (data?.deliveredCount ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded bg-red-50 px-2 py-1.5">
          <div className="font-semibold uppercase tracking-wide text-red-700">
            {t('dashboard.cards.shippingFees')}
          </div>
          <div className="font-bold text-red-900">
            {loading ? '…' : `${fmtMAD(data?.shippingFees ?? 0)} MAD`}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
