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
        title="Orders"
        value={kpis.totalOrders}
        icon={ShoppingCart}
        iconColor="#18181B"
        percentageChange={changes.totalOrders}
      />
      <KPICard
        title="Confirmation"
        value={kpis.confirmationRate}
        unit="%"
        subtitle={`${fmt(c.confirmed)} of ${fmt(c.confirmationDenom)} pending`}
        icon={CheckCircle2}
        iconColor="#16A34A"
        percentageChange={changes.confirmationRate}
      />
      <KPICard
        title="Delivery"
        value={kpis.deliveryRate}
        unit="%"
        subtitle={`${fmt(c.delivered)} of ${fmt(c.deliveryDenom)} shipped`}
        icon={Truck}
        iconColor="#7C3AED"
        percentageChange={changes.deliveryRate}
      />
      <KPICard
        title="Return"
        value={kpis.returnRate}
        unit="%"
        subtitle={`${fmt(c.returned)} of ${fmt(c.returnDenom)} closed`}
        icon={Undo2}
        iconColor="#DC2626"
        percentageChange={changes.returnRate}
      />
      <KPICard
        title="Merged"
        value={kpis.mergedRate}
        unit="%"
        subtitle={`${fmt(c.merged)} of ${fmt(c.mergedDenom)} merged`}
        icon={GitMerge}
        iconColor="#F59E0B"
        percentageChange={changes.mergedRate}
      />
      <KPICard
        title="Revenue"
        value={kpis.revenue.toLocaleString('fr-MA')}
        unit="MAD"
        subtitle={`${fmt(c.delivered)} delivered`}
        icon={Coins}
        iconColor="#D97706"
        percentageChange={changes.revenue}
      />
      <KPICard
        title="Profit"
        value={kpis.profit.toLocaleString('fr-MA')}
        unit="MAD"
        subtitle={`${fmt(c.delivered)} delivered`}
        icon={TrendingUp}
        iconColor="#059669"
        percentageChange={changes.profit}
      />
    </div>
  );
}
