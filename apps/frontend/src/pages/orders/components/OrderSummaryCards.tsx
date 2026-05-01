import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Clock, CheckCircle, Truck, PackageCheck, DollarSign,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { ordersApi } from '@/services/ordersApi';
import { getSocket } from '@/services/socket';
import { useFilterStore } from '@/store/filterStore';
import type { OrdersSummary } from '@/types/orders';
import { cn } from '@/lib/cn';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-9 w-16 rounded" />
      <div className="skeleton h-3 w-32 rounded" />
    </GlassCard>
  );
}

// ─── Single summary card ──────────────────────────────────────────────────────

interface SummaryCardProps {
  title: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  subtitle?: React.ReactNode;
  valueColor?: string;
  unit?: string;
}

function SummaryCard({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  subtitle,
  valueColor = 'text-gray-900',
  unit,
}: SummaryCardProps) {
  return (
    <GlassCard className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {title}
        </span>
        <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconBg)}>
          <Icon size={18} className={iconColor} />
        </div>
      </div>

      <div className="flex items-end gap-1.5">
        <span className={cn('text-3xl font-bold leading-none', valueColor)}>
          {typeof value === 'number' && unit === 'MAD'
            ? value.toLocaleString('fr-MA')
            : value.toLocaleString()}
        </span>
        {unit && (
          <span className="mb-0.5 text-sm font-medium text-gray-400">{unit}</span>
        )}
      </div>

      {subtitle && (
        <div className="text-xs text-gray-500">{subtitle}</div>
      )}
    </GlassCard>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface OrderSummaryCardsProps {
  className?: string;
}

export function OrderSummaryCards({ className }: OrderSummaryCardsProps) {
  const { t } = useTranslation();
  const filters = useFilterStore();
  const [summary, setSummary] = useState<OrdersSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const data = await ordersApi.summary({
        confirmationStatuses:
          filters.confirmationStatuses.length > 0
            ? filters.confirmationStatuses.join(',')
            : undefined,
        shippingStatuses:
          filters.shippingStatuses.length > 0
            ? filters.shippingStatuses.join(',')
            : undefined,
        agentIds: filters.agentIds.length > 0 ? filters.agentIds.join(',') : undefined,
        cities: filters.cities.length > 0 ? filters.cities.join(',') : undefined,
        dateFrom: filters.dateRange.from ?? undefined,
        dateTo: filters.dateRange.to ?? undefined,
      });
      setSummary(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [
    filters.confirmationStatuses,
    filters.shippingStatuses,
    filters.agentIds,
    filters.cities,
    filters.dateRange.from,
    filters.dateRange.to,
  ]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // Live refresh — bound to the same scoped order events that drive the
  // table. No coarse "kpi:refresh" hammer; each event names what changed.
  useEffect(() => {
    try {
      const socket = getSocket();
      socket.on('order:created', fetchSummary);
      socket.on('order:updated', fetchSummary);
      socket.on('order:archived', fetchSummary);
      socket.on('order:bulk_updated', fetchSummary);
      return () => {
        socket.off('order:created', fetchSummary);
        socket.off('order:updated', fetchSummary);
        socket.off('order:archived', fetchSummary);
        socket.off('order:bulk_updated', fetchSummary);
      };
    } catch {
      // socket not ready
    }
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-5', className)}>
        {Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }

  const s = summary ?? {
    pending: { total: 0, assigned: 0, unassigned: 0 },
    confirmed: { total: 0 },
    outForDelivery: { total: 0 },
    delivered: { total: 0, revenue: 0 },
  };

  return (
    <div className={cn('grid grid-cols-2 gap-4 lg:grid-cols-5', className)}>
      {/* Unified neutral-gray palette: muted icon tile + dark value lets
          the numbers pop without yelling, dappr-style. Per-metric Lucide
          icons still distinguish each card. The "free" badge stays orange
          because it's a warning, not a metric color. */}

      {/* 1 — Pending */}
      <SummaryCard
        title={t('orders.summary.pending')}
        value={s.pending.total}
        icon={Clock}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        subtitle={
          <div className="flex items-center gap-3">
            <span className="text-gray-500">
              {t('orders.summary.assigned', { count: s.pending.assigned })}
            </span>
            {s.pending.unassigned > 0 && (
              <span className="rounded-badge bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">
                {t('orders.summary.free', { count: s.pending.unassigned })}
              </span>
            )}
          </div>
        }
      />

      {/* 2 — Confirmed */}
      <SummaryCard
        title={t('orders.summary.confirmed')}
        value={s.confirmed.total}
        icon={CheckCircle}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        subtitle={<span className="text-gray-400">{t('orders.summary.readyForShipping')}</span>}
      />

      {/* 3 — Out for Delivery */}
      <SummaryCard
        title={t('orders.summary.outForDelivery')}
        value={s.outForDelivery.total}
        icon={Truck}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        subtitle={<span className="text-gray-400">{t('orders.summary.inTransitToday')}</span>}
      />

      {/* 4 — Delivered */}
      <SummaryCard
        title={t('orders.summary.delivered')}
        value={s.delivered.total}
        icon={PackageCheck}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        subtitle={<span className="text-gray-400">{t('orders.summary.successfullyDelivered')}</span>}
      />

      {/* 5 — Revenue */}
      <SummaryCard
        title={t('orders.summary.revenue')}
        value={s.delivered.revenue}
        unit="MAD"
        icon={DollarSign}
        iconBg="bg-gray-100"
        iconColor="text-gray-600"
        subtitle={<span className="text-gray-400">{t('orders.summary.fromDelivered')}</span>}
      />
    </div>
  );
}
