import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { GlobalFilterBar, type FilterChipConfig } from '@/components/ui/GlobalFilterBar';
import { FbDateRangePicker } from '@/components/ui/FbDateRangePicker';
import {
  CONFIRMATION_STATUS_OPTIONS,
  SHIPPING_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from '@/constants/statusColors';
import { useFilterStore } from '@/store/filterStore';
import { useDashboard } from './hooks/useDashboard';
import { DashboardKpiRow } from './components/DashboardKpiRow';
import { OperationsKpiRow } from './components/OperationsKpiRow';
import { OrderTrendChart } from './components/OrderTrendChart';
import { ConfirmationDonutChart } from './components/ConfirmationDonutChart';
import { DeliveryStatusBars } from './components/DeliveryStatusBars';
import { TopAgentsCard } from './components/TopAgentsCard';
import { TopProductsCard } from './components/TopProductsCard';
import { TopCitiesCard } from './components/TopCitiesCard';

const FILTER_CONFIGS: FilterChipConfig[] = [
  {
    key: 'confirmationStatuses',
    label: 'Confirmation',
    options: CONFIRMATION_STATUS_OPTIONS,
  },
  {
    key: 'shippingStatuses',
    label: 'Shipping',
    options: SHIPPING_STATUS_OPTIONS,
  },
  {
    key: 'sources',
    label: 'Source',
    options: SOURCE_OPTIONS,
  },
];

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO);
  const to = new Date(toISO);
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * "Previous period" preset — mirrors the current date range back in time so the
 * comparison window has the same length. No-op when no primary range is set.
 */
function previousPeriod(
  primary: { from: string | null; to: string | null },
): { from: string; to: string } | null {
  if (!primary.from || !primary.to) return null;
  const len = daysBetween(primary.from, primary.to);
  return {
    from: shiftISO(primary.from, -len),
    to: shiftISO(primary.from, -1),
  };
}

export default function DashboardPage() {
  const { dateRange } = useFilterStore();
  const [compareFrom, setCompareFrom] = useState<string | null>(null);
  const [compareTo, setCompareTo] = useState<string | null>(null);
  const { data, loading } = useDashboard({ compareFrom, compareTo });

  const resolvedCompare = data?.kpis.compare;
  const prevPreset = useMemo(() => previousPeriod(dateRange), [dateRange]);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400">
            Company-wide KPIs across every order in the CRM
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <GlobalFilterBar
          filterConfigs={FILTER_CONFIGS}
          showDateRange
          sticky={false}
          className="flex-1 min-w-0"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Compare to:</span>
          <FbDateRangePicker
            value={{ from: compareFrom, to: compareTo }}
            onChange={(r) => {
              setCompareFrom(r.from);
              setCompareTo(r.to);
            }}
            placeholder="Compare range"
            icon={CalendarClock}
          />
          {prevPreset && !(compareFrom && compareTo) && (
            <button
              onClick={() => {
                setCompareFrom(prevPreset.from);
                setCompareTo(prevPreset.to);
              }}
              className="rounded-badge border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-primary hover:text-primary"
            >
              Previous period
            </button>
          )}
        </div>
      </div>
      {resolvedCompare?.from && resolvedCompare?.to && (
        <div className="flex justify-end -mt-2">
          <span className="text-[11px] text-gray-400">
            vs. {resolvedCompare.from} → {resolvedCompare.to}
            {!compareFrom && !compareTo && ' (auto)'}
          </span>
        </div>
      )}

      <DashboardKpiRow kpis={data?.kpis ?? null} loading={loading} />

      <OperationsKpiRow />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OrderTrendChart data={data?.trend ?? []} loading={loading} />
        <ConfirmationDonutChart
          breakdown={data?.breakdown.confirmation ?? {}}
          loading={loading}
        />
      </div>

      <DeliveryStatusBars breakdown={data?.breakdown.shipping ?? {}} loading={loading} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TopAgentsCard agents={data?.agents ?? []} loading={loading} />
        <TopProductsCard products={data?.topProducts ?? []} loading={loading} />
        <TopCitiesCard cities={data?.topCities ?? []} loading={loading} />
      </div>
    </div>
  );
}
