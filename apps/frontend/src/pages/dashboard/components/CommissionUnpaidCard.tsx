import { Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

// commission:paid reduces the unpaid pool; order:delivered grows it.
const EVENTS = ['order:delivered', 'commission:paid', 'order:updated'];

const fmtMAD = (n: number) =>
  n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });

export function CommissionUnpaidCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.commissionUnpaid(filters),
    EVENTS,
    filters,
  );

  const agents = data?.agents ?? [];

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-600">
        <Wallet size={14} />
        {t('dashboard.cards.commissionUnpaid')}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
          {loading ? '…' : fmtMAD(data?.totalAmount ?? 0)}
        </span>
        <span className="text-xs font-semibold text-gray-400">MAD</span>
      </div>
      <div className="text-[11px] text-gray-500">
        {loading
          ? '…'
          : t('dashboard.cards.commissionUnpaidSub', {
              count: data?.totalOrders ?? 0,
            })}
      </div>
      {agents.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-gray-100 pt-2 max-h-40 overflow-y-auto">
          {agents.slice(0, 6).map((a) => (
            <div key={a.agentId} className="flex items-center justify-between text-xs">
              <span className="truncate text-gray-700">{a.name}</span>
              <span className="ml-2 shrink-0 font-semibold text-gray-900">
                {fmtMAD(a.pendingAmount)} <span className="text-gray-400">({a.pendingCount})</span>
              </span>
            </div>
          ))}
          {agents.length > 6 && (
            <div className="text-[10px] italic text-gray-400">
              +{agents.length - 6} {t('dashboard.cards.moreAgents')}
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
