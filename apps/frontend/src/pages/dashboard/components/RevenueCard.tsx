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
    <GlassCard tone="peach" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-tone-peach-500">
          {t('dashboard.cards.revenue')}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-tone-peach-100">
          <Coins size={16} className="text-tone-peach-500" strokeWidth={2.4} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] font-bold leading-none tracking-tight text-gray-900">
          {loading ? '…' : fmtMAD(data?.revenue ?? 0)}
        </span>
        <span className="text-xs font-semibold text-gray-400">MAD</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-white/60 px-3 py-2 backdrop-blur-sm">
          <div className="font-semibold uppercase tracking-wider text-tone-mint-500">
            {t('dashboard.cards.delivered')}
          </div>
          <div className="text-base font-bold text-gray-900">
            {loading ? '…' : (data?.deliveredCount ?? 0).toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl bg-white/60 px-3 py-2 backdrop-blur-sm">
          <div className="font-semibold uppercase tracking-wider text-tone-rose-500">
            {t('dashboard.cards.shippingFees')}
          </div>
          <div className="text-base font-bold text-gray-900">
            {loading ? '…' : `${fmtMAD(data?.shippingFees ?? 0)}`}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
