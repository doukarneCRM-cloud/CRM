import { useTranslation } from 'react-i18next';
import { ShoppingCart, CheckCircle2, Truck, Undo2, GitMerge, Coins, TrendingUp } from 'lucide-react';
import { KPICard } from '@/components/ui/KPICard';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/cn';
import type { DashboardKPIs } from '@/services/dashboardApi';

function SkeletonCard() {
  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-9 w-20 rounded" />
      <div className="skeleton h-3 w-16 rounded" />
    </GlassCard>
  );
}

interface Props {
  kpis: DashboardKPIs | null;
  loading: boolean;
  className?: string;
}

export function DashboardKpiRow({ kpis, loading, className }: Props) {
  const { t } = useTranslation();

  if (loading || !kpis) {
    return (
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7', className)}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  const changes = kpis.percentageChanges;
  const c = kpis.counts;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7', className)}>
      <KPICard
        title={t('dashboard.kpi.orders')}
        value={kpis.totalOrders}
        icon={ShoppingCart}
        iconColor="#18181B"
        percentageChange={changes.totalOrders}
      />
      <KPICard
        title={t('dashboard.kpi.confirmation')}
        value={kpis.confirmationRate}
        unit="%"
        subtitle={t('dashboard.kpi.confirmedSubtitle', { confirmed: fmt(c.confirmed), total: fmt(c.confirmationDenom) })}
        icon={CheckCircle2}
        iconColor="#16A34A"
        percentageChange={changes.confirmationRate}
      />
      <KPICard
        title={t('dashboard.kpi.delivery')}
        value={kpis.deliveryRate}
        unit="%"
        subtitle={t('dashboard.kpi.deliveredSubtitle', { delivered: fmt(c.delivered), total: fmt(c.deliveryDenom) })}
        icon={Truck}
        iconColor="#7C3AED"
        percentageChange={changes.deliveryRate}
      />
      <KPICard
        title={t('dashboard.kpi.return')}
        value={kpis.returnRate}
        unit="%"
        subtitle={t('dashboard.kpi.returnedSubtitle', { returned: fmt(c.returned), total: fmt(c.returnDenom) })}
        icon={Undo2}
        iconColor="#DC2626"
        percentageChange={changes.returnRate}
      />
      <KPICard
        title={t('dashboard.kpi.merged')}
        value={kpis.mergedRate}
        unit="%"
        subtitle={t('dashboard.kpi.mergedSubtitle', { merged: fmt(c.merged), total: fmt(c.mergedDenom) })}
        icon={GitMerge}
        iconColor="#F59E0B"
        percentageChange={changes.mergedRate}
      />
      <KPICard
        title={t('dashboard.kpi.revenue')}
        value={kpis.revenue.toLocaleString('fr-MA')}
        unit="MAD"
        subtitle={t('dashboard.kpi.deliveredLabel', { count: c.delivered })}
        icon={Coins}
        iconColor="#D97706"
        percentageChange={changes.revenue}
      />
      <KPICard
        title={t('dashboard.kpi.profit')}
        value={kpis.profit.toLocaleString('fr-MA')}
        unit="MAD"
        subtitle={t('dashboard.kpi.deliveredLabel', { count: c.delivered })}
        icon={TrendingUp}
        iconColor="#059669"
        percentageChange={changes.profit}
      />
    </div>
  );
}
