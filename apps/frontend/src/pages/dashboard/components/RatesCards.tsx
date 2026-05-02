import { CheckCircle2, Truck, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { GlassCard, type GlassTone } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

// Each rate card listens to the events that change its numerator or
// denominator — order:created shifts the confirmation denom, order:confirmed
// shifts the delivery denom, etc.
const CONFIRMATION_EVENTS = [
  'order:created',
  'order:confirmed',
  'order:updated',
  'order:archived',
];
const DELIVERY_EVENTS = ['order:confirmed', 'order:delivered', 'order:updated'];
const RETURN_EVENTS = ['order:delivered', 'order:updated'];

interface RateCardUIProps {
  title: string;
  icon: LucideIcon;
  tone: GlassTone;
  numerator: number;
  denominator: number;
  rate: number;
  numeratorLabel: string;
  denominatorLabel: string;
  loading: boolean;
}

// Static maps so Tailwind's JIT can statically extract the class names.
// (Dynamic concatenation like `bg-tone-${tone}-500` is purged.)
const titleColor: Record<GlassTone, string> = {
  lavender: 'text-tone-lavender-500',
  peach:    'text-tone-peach-500',
  mint:     'text-tone-mint-500',
  sky:      'text-tone-sky-500',
  rose:     'text-tone-rose-500',
  amber:    'text-tone-amber-500',
};
const iconBg: Record<GlassTone, string> = {
  lavender: 'bg-tone-lavender-100',
  peach:    'bg-tone-peach-100',
  mint:     'bg-tone-mint-100',
  sky:      'bg-tone-sky-100',
  rose:     'bg-tone-rose-100',
  amber:    'bg-tone-amber-100',
};

function RateCardUI({
  title,
  icon: Icon,
  tone,
  numerator,
  denominator,
  rate,
  numeratorLabel,
  denominatorLabel,
  loading,
}: RateCardUIProps) {
  return (
    <GlassCard tone={tone} className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${titleColor[tone]}`}>
          {title}
        </span>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg[tone]}`}>
          <Icon size={16} className={titleColor[tone]} strokeWidth={2.4} />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[34px] font-bold leading-none tracking-tight text-gray-900">
          {loading ? '…' : rate.toFixed(1)}
        </span>
        <span className="text-sm font-semibold text-gray-400">%</span>
      </div>
      <div className="text-[11px] text-gray-500">
        {loading
          ? '…'
          : `${numerator.toLocaleString()} ${numeratorLabel} / ${denominator.toLocaleString()} ${denominatorLabel}`}
      </div>
    </GlassCard>
  );
}

export function ConfirmationRateCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.rates(filters),
    CONFIRMATION_EVENTS,
    filters,
  );
  return (
    <RateCardUI
      title={t('dashboard.cards.confirmationRate')}
      icon={CheckCircle2}
      tone="mint"
      numerator={data?.confirmed ?? 0}
      denominator={data?.confirmationDenom ?? 0}
      rate={data?.confirmationRate ?? 0}
      numeratorLabel={t('dashboard.cards.confirmed')}
      denominatorLabel={t('dashboard.cards.ofOrders')}
      loading={loading}
    />
  );
}

export function DeliveryRateCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.rates(filters),
    DELIVERY_EVENTS,
    filters,
  );
  return (
    <RateCardUI
      title={t('dashboard.cards.deliveryRate')}
      icon={Truck}
      tone="sky"
      numerator={data?.delivered ?? 0}
      denominator={data?.deliveryDenom ?? 0}
      rate={data?.deliveryRate ?? 0}
      numeratorLabel={t('dashboard.cards.delivered')}
      denominatorLabel={t('dashboard.cards.ofConfirmed')}
      loading={loading}
    />
  );
}

export function ReturnRateCard() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.rates(filters),
    RETURN_EVENTS,
    filters,
  );
  return (
    <RateCardUI
      title={t('dashboard.cards.returnRate')}
      icon={Undo2}
      tone="rose"
      numerator={data?.returned ?? 0}
      denominator={data?.returnDenom ?? 0}
      rate={data?.returnRate ?? 0}
      numeratorLabel={t('dashboard.cards.returned')}
      denominatorLabel={t('dashboard.cards.ofShipped')}
      loading={loading}
    />
  );
}
