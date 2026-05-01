import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, CheckCircle2, Truck, Coins, TrendingUp } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { meApi, type MyCommission, type MyPipeline } from '@/services/ordersApi';
import { getSocket } from '@/services/socket';
import {
  CONFIRMATION_STATUS_COLORS,
  SHIPPING_STATUS_COLORS,
  type ConfirmationStatus,
  type ShippingStatus,
} from '@/constants/statusColors';
import { cn } from '@/lib/cn';
import { useCallCenterStore, type PipelineSection } from '../callCenterStore';

// ─── Skeleton ────────────────────────────────────────────────────────────────

function CardSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <GlassCard className={cn('flex flex-col gap-3', tall && 'min-h-[148px]')}>
      <div className="skeleton h-3 w-24 rounded" />
      <div className="skeleton h-9 w-16 rounded" />
      <div className="skeleton h-3 w-32 rounded" />
    </GlassCard>
  );
}

// ─── Header used by all cards ─────────────────────────────────────────────────

interface CardHeaderProps {
  title: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}

function CardHeader({ title, icon: Icon, iconBg, iconColor }: CardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {title}
      </span>
      <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', iconBg)}>
        <Icon size={18} className={iconColor} />
      </div>
    </div>
  );
}

// ─── Status chip (for pipeline cards) ────────────────────────────────────────

interface StatusChipProps {
  label: string;
  count: number;
  bg: string;
  text: string;
  dot: string;
  // When the dot colour comes from Coliix's palette rather than Tailwind
  // utility classes (free-form raw wordings like "Expédié"), pass the hex
  // through so we can paint the dot inline without extending the palette.
  dotColour?: string;
  onClick?: () => void;
}

function StatusChip({ label, count, bg, text, dot, dotColour, onClick }: StatusChipProps) {
  const className = cn(
    'flex items-center justify-between gap-2 rounded-badge px-2.5 py-1.5 text-left',
    bg,
    onClick && 'cursor-pointer transition hover:brightness-95 active:scale-[0.98]',
  );
  const body = (
    <>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn('h-1.5 w-1.5 shrink-0 rounded-full', !dotColour && dot)}
          style={dotColour ? { backgroundColor: dotColour } : undefined}
        />
        <span className={cn('truncate text-[11px] font-semibold', text)}>{label}</span>
      </div>
      <span className={cn('shrink-0 text-sm font-bold', text)}>{count}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}

// Scroll the pipeline table into view + set the matching filter so the agent
// lands right on the slice they clicked.
function useJumpToPipeline() {
  const apply = useCallCenterStore((s) => s.applyPipelineFilter);
  return (section: PipelineSection, status: string) => {
    apply(section, status);
    requestAnimationFrame(() => {
      document
        .getElementById('call-center-pipeline')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface AgentKpiCardsProps {
  className?: string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

export function AgentKpiCards({ className }: AgentKpiCardsProps) {
  const { t } = useTranslation();
  const [pipeline, setPipeline] = useState<MyPipeline | null>(null);
  const [commission, setCommission] = useState<MyCommission | null>(null);
  const [loading, setLoading] = useState(true);
  const jumpToPipeline = useJumpToPipeline();

  const fetchAll = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        meApi.pipeline(),
        meApi.commission({ all: true }),
      ]);
      setPipeline(p);
      setCommission(c);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Live refresh on any order event that could affect this agent's pipeline
  // or commission. We don't bind to a global "kpi:refresh" hammer any more —
  // each event names what changed, and the backend fans out to agent:<id>
  // rooms so other agents' edits don't trigger this agent's refetch storm.
  useEffect(() => {
    try {
      const socket = getSocket();
      socket.on('order:created', fetchAll);
      socket.on('order:assigned', fetchAll);
      socket.on('order:updated', fetchAll);
      socket.on('order:archived', fetchAll);
      // Bulk events: one fetchAll for the whole batch, never per-row. The
      // backend stopped emitting per-row order:assigned during bulk
      // operations precisely so this card doesn't refetch 50 times.
      socket.on('order:bulk_updated', fetchAll);
      socket.on('order:bulk_assigned', fetchAll);
      // Recovery on (re)connect after a token refresh / network blip.
      socket.on('connect', fetchAll);
      return () => {
        socket.off('order:created', fetchAll);
        socket.off('order:assigned', fetchAll);
        socket.off('order:updated', fetchAll);
        socket.off('order:archived', fetchAll);
        socket.off('order:bulk_updated', fetchAll);
        socket.off('order:bulk_assigned', fetchAll);
        socket.off('connect', fetchAll);
      };
    } catch {
      // socket not ready yet
    }
  }, [fetchAll]);

  if (loading) {
    return (
      <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4', className)}>
        <CardSkeleton />
        <CardSkeleton tall />
        <CardSkeleton tall />
        <CardSkeleton />
      </div>
    );
  }

  const confirmationEntries = Object.entries(pipeline?.confirmation ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const shippingEntries = Object.entries(pipeline?.shipping ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const paidCount = commission?.paidCount ?? 0;
  const pendingCount = commission?.pendingCount ?? 0;
  const paidTotal = commission?.paidTotal ?? 0;
  const pendingTotal = commission?.pendingTotal ?? 0;
  const total = commission?.total ?? 0;

  return (
    <div className={cn('grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4', className)}>
      {/* 1 — Today's Orders */}
      <GlassCard className="flex flex-col gap-3">
        <CardHeader
          title={t('callCenter.kpi.todaysOrders')}
          icon={CalendarDays}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <div className="flex items-end gap-1.5">
          <span className="text-3xl font-bold leading-none text-gray-900">
            {pipeline?.todayCount ?? 0}
          </span>
          <span className="mb-0.5 text-sm font-medium text-gray-400">{t('callCenter.kpi.assigned')}</span>
        </div>
        <div className="text-xs text-gray-500">{t('callCenter.kpi.assignedToday')}</div>
      </GlassCard>

      {/* 2 — Confirmation Pipeline */}
      <GlassCard className="flex flex-col gap-3">
        <CardHeader
          title={t('callCenter.kpi.confirmationPipeline')}
          icon={CheckCircle2}
          iconBg="bg-blue-50"
          iconColor="text-blue-600"
        />
        {confirmationEntries.length === 0 ? (
          <div className="flex flex-1 items-center text-xs text-gray-400">
            {t('callCenter.kpi.noConfirmationYet')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {confirmationEntries.map(([status, count]) => {
              const cfg = CONFIRMATION_STATUS_COLORS[status as ConfirmationStatus];
              if (!cfg) return null;
              return (
                <StatusChip
                  key={status}
                  label={cfg.label}
                  count={count}
                  bg={cfg.bg}
                  text={cfg.text}
                  dot={cfg.dot}
                  onClick={() => jumpToPipeline('confirmation', status)}
                />
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* 3 — Shipping Pipeline */}
      <GlassCard className="flex flex-col gap-3">
        <CardHeader
          title={t('callCenter.kpi.shippingPipeline')}
          icon={Truck}
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
        />
        {shippingEntries.length === 0 ? (
          <div className="flex flex-1 items-center text-xs text-gray-400">
            {t('callCenter.kpi.noShippingYet')}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {shippingEntries.map(([status, count]) => {
              const cfg =
                SHIPPING_STATUS_COLORS[status as ShippingStatus] ?? {
                  label: status.replace(/_/g, ' '),
                  bg: 'bg-gray-100',
                  text: 'text-gray-700',
                  dot: 'bg-gray-400',
                };
              return (
                <StatusChip
                  key={status}
                  label={cfg.label}
                  count={count}
                  bg={cfg.bg}
                  text={cfg.text}
                  dot={cfg.dot}
                  onClick={() => jumpToPipeline('shipping', status)}
                />
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* 4 — Commission (all-time earnings) */}
      <GlassCard className="flex flex-col gap-3">
        <CardHeader
          title={t('callCenter.kpi.commission')}
          icon={Coins}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <div className="flex items-end gap-1.5">
          <span className="text-3xl font-bold leading-none text-amber-700">
            {total.toLocaleString('fr-MA')}
          </span>
          <span className="mb-0.5 text-sm font-medium text-gray-400">MAD</span>
        </div>
        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
          {t('callCenter.kpi.allTimeEarnings')}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-badge bg-emerald-50 px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="truncate text-[11px] font-semibold text-emerald-700">
                {t('callCenter.kpi.paidLine', { count: paidCount })}
              </span>
            </div>
            <span className="shrink-0 text-sm font-bold text-emerald-700">
              {paidTotal.toLocaleString('fr-MA')}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-badge bg-red-50 px-2.5 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              <span className="truncate text-[11px] font-semibold text-red-700">
                {t('callCenter.kpi.unpaidLine', { count: pendingCount })}
              </span>
            </div>
            <span className="shrink-0 text-sm font-bold text-red-700">
              {pendingTotal.toLocaleString('fr-MA')}
            </span>
          </div>
        </div>

        {total > 0 && (
          <div className="flex items-center gap-1 text-emerald-600">
            <TrendingUp size={11} />
            <span className="text-[11px] font-semibold">
              {t('callCenter.kpi.perDelivered', { amount: (commission?.onConfirmRate ?? 0) + (commission?.onDeliverRate ?? 0) })}
            </span>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
