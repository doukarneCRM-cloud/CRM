import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wallet, Truck, PackageSearch } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { moneyApi } from '@/services/moneyApi';
import { returnsApi } from '@/services/returnsApi';

interface Stats {
  unpaidCommissionMAD: number | null;
  unpaidPayoutMAD: number | null;
  pendingReturns: number | null;
}

const EMPTY: Stats = {
  unpaidCommissionMAD: null,
  unpaidPayoutMAD: null,
  pendingReturns: null,
};

export function OperationsKpiRow() {
  const { t } = useTranslation();
  const canSeeMoney = useAuthStore((s) => s.hasPermission(PERMISSIONS.MONEY_VIEW));
  const canSeeReturns = useAuthStore((s) => s.hasPermission(PERMISSIONS.RETURNS_VERIFY));
  const [stats, setStats] = useState<Stats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!canSeeMoney && !canSeeReturns) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      canSeeMoney
        ? moneyApi
            .listAgentCommissions()
            .then((rows) => rows.reduce((s, r) => s + (r.pendingTotal ?? 0), 0))
            .catch(() => null)
        : Promise.resolve(null),
      canSeeMoney
        ? moneyApi
            .listDeliveryInvoice({ paidOnly: 'unpaid' })
            .then((r) => r.totals.unpaidPayout)
            .catch(() => null)
        : Promise.resolve(null),
      canSeeReturns
        ? returnsApi
            .list({ scope: 'pending', pageSize: 1 })
            .then((r) => r.pagination.total)
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([unpaidCommissionMAD, unpaidPayoutMAD, pendingReturns]) => {
      if (cancelled) return;
      setStats({ unpaidCommissionMAD, unpaidPayoutMAD, pendingReturns });
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [canSeeMoney, canSeeReturns]);

  if (!canSeeMoney && !canSeeReturns) return null;

  const fmtMAD = (n: number | null) =>
    n === null ? '—' : n.toLocaleString('fr-MA', { maximumFractionDigits: 0 });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {canSeeMoney && (
        <KPICard
          title={t('dashboard.kpi.unpaidCommission')}
          value={loading ? '…' : fmtMAD(stats.unpaidCommissionMAD)}
          unit="MAD"
          subtitle={t('dashboard.kpi.unpaidCommissionSub')}
          icon={Wallet}
          iconColor="#D97706"
        />
      )}
      {canSeeMoney && (
        <KPICard
          title={t('dashboard.kpi.unpaidPayout')}
          value={loading ? '…' : fmtMAD(stats.unpaidPayoutMAD)}
          unit="MAD"
          subtitle={t('dashboard.kpi.unpaidPayoutSub')}
          icon={Truck}
          iconColor="#7C3AED"
        />
      )}
      {canSeeReturns && (
        <KPICard
          title={t('dashboard.kpi.pendingReturns')}
          value={
            loading
              ? '…'
              : stats.pendingReturns === null
                ? '—'
                : stats.pendingReturns.toString()
          }
          subtitle={t('dashboard.kpi.pendingReturnsSub')}
          icon={PackageSearch}
          iconColor="#DC2626"
        />
      )}
    </div>
  );
}
