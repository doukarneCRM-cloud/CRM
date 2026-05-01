import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const EVENTS = ['order:created', 'order:confirmed', 'order:delivered', 'order:archived'];

const COLOURS = {
  orders: '#A78BFA',     // violet-400
  confirmed: '#60A5FA',  // blue-400
  delivered: '#34D399',  // emerald-400
};

interface TooltipRow {
  name: string;
  value: number;
  color: string;
}

function CustomTooltip(props: { active?: boolean; payload?: TooltipRow[]; label?: string }) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;
  const orders = payload.find((p) => p.name === 'orders')?.value ?? 0;
  const confirmed = payload.find((p) => p.name === 'confirmed')?.value ?? 0;
  const delivered = payload.find((p) => p.name === 'delivered')?.value ?? 0;
  const conf = orders > 0 ? Math.round((confirmed / orders) * 100) : 0;
  const deliv = confirmed > 0 ? Math.round((delivered / confirmed) * 100) : 0;
  return (
    <div className="rounded-md border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <div className="mb-1 font-semibold text-gray-700">{label}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: COLOURS.orders }} />
        <span className="text-gray-500">Orders:</span>
        <span className="font-bold text-gray-900">{orders}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: COLOURS.confirmed }} />
        <span className="text-gray-500">Confirmed:</span>
        <span className="font-bold text-gray-900">
          {confirmed} <span className="text-gray-400">({conf}%)</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ background: COLOURS.delivered }} />
        <span className="text-gray-500">Delivered:</span>
        <span className="font-bold text-gray-900">
          {delivered} <span className="text-gray-400">({deliv}%)</span>
        </span>
      </div>
    </div>
  );
}

export function DailyTrendChart() {
  const { t } = useTranslation();
  const filters = useDashboardFilters();
  const { data, loading } = useDashboardCard(
    () => dashboardApi.trend(14, filters),
    EVENTS,
    filters,
  );

  const points = useMemo(
    () =>
      (data?.points ?? []).map((p) => ({
        ...p,
        // Short display label (DD/MM) for the X axis to keep the chart tight.
        label: p.date.slice(5).replace('-', '/'),
      })),
    [data],
  );

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-gray-900">{t('dashboard.charts.trendTitle')}</h3>
        <span className="text-[11px] text-gray-400">{t('dashboard.charts.trendSubtitle')}</span>
      </div>
      <div className="h-72">
        {loading ? (
          <div className="skeleton h-full w-full rounded-md" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
              <Bar dataKey="orders" fill={COLOURS.orders} radius={[4, 4, 0, 0]} />
              <Bar dataKey="confirmed" fill={COLOURS.confirmed} radius={[4, 4, 0, 0]} />
              <Bar dataKey="delivered" fill={COLOURS.delivered} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </GlassCard>
  );
}
