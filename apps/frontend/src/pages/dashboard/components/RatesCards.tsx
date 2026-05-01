import { CheckCircle2, Truck, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LucideIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
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
  iconColor: string;
  numerator: number;
  denominator: number;
  rate: number;
  numeratorLabel: string;
  denominatorLabel: string;
  loading: boolean;
}

function RateCardUI({
  title,
  icon: Icon,
  iconColor,
  numerator,
  denominator,
  rate,
  numeratorLabel,
  denominatorLabel,
  loading,
}: RateCardUIProps) {
  return (
    <GlassCard className="flex flex-col gap-2 p-4">
      <div
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: iconColor }}
      >
        <Icon size={14} />
        {title}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-bold text-gray-900">
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
      iconColor="#16A34A"
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
      iconColor="#7C3AED"
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
      iconColor="#DC2626"
      numerator={data?.returned ?? 0}
      denominator={data?.returnDenom ?? 0}
      rate={data?.returnRate ?? 0}
      numeratorLabel={t('dashboard.cards.returned')}
      denominatorLabel={t('dashboard.cards.ofShipped')}
      loading={loading}
    />
  );
}
