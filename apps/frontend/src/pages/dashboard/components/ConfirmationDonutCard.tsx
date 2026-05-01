import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { dashboardApi } from '@/services/dashboardApi';
import { CONFIRMATION_HEX } from '../statusHex';
import { CONFIRMATION_STATUS_COLORS } from '@/constants/statusColors';
import { supportApi } from '@/services/ordersApi';
import type { AgentOption } from '@/types/orders';
import { useDashboardCard, useDashboardFilters } from '../hooks/useDashboardCard';

const REFRESH_EVENTS = [
  'order:created',
  'order:confirmed',
  'order:archived',
  'order:updated',
];

export function ConfirmationDonutCard() {
  const { t } = useTranslation();
  const [donutAgentId, setDonutAgentId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const filters = useDashboardFilters();

  useEffect(() => {
    let cancelled = false;
    supportApi.agents().then((rows) => { if (!cancelled) setAgents(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Donut respects both the global filter bar AND its inline agent picker.
  // The picker is a per-card overlay that narrows below the global filter.
  const { data, loading } = useDashboardCard(
    () => dashboardApi.donut(donutAgentId, filters),
    REFRESH_EVENTS,
    [donutAgentId, filters],
  );

  const slices = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.breakdown)
      .filter(([, v]) => v > 0)
      .map(([status, count]) => ({
        name: status,
        label: CONFIRMATION_STATUS_COLORS[status as keyof typeof CONFIRMATION_STATUS_COLORS]?.label
          ?? status,
        value: count,
        color: CONFIRMATION_HEX[status as keyof typeof CONFIRMATION_HEX] ?? '#9CA3AF',
      }));
  }, [data]);

  const total = slices.reduce((s, p) => s + p.value, 0);

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900">{t('dashboard.charts.donutTitle')}</h3>
        <select
          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-primary focus:outline-none"
          value={donutAgentId ?? ''}
          onChange={(e) => setDonutAgentId(e.target.value || null)}
        >
          <option value="">{t('dashboard.charts.donutAllAgents')}</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <div className="relative h-44 w-44 shrink-0">
          {loading ? (
            <div className="skeleton h-full w-full rounded-full" />
          ) : total === 0 ? (
            <div className="flex h-full w-full items-center justify-center rounded-full bg-gray-50 text-xs text-gray-400">
              {t('dashboard.charts.noData')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  innerRadius={50}
                  outerRadius={75}
                  stroke="none"
                >
                  {slices.map((s, i) => (
                    <Cell key={i} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, _name, props: { payload?: { label: string } }) => [
                    `${value.toLocaleString()} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`,
                    props?.payload?.label ?? '',
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
          {!loading && total > 0 && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-gray-400">{t('dashboard.charts.donutTotal')}</span>
              <span className="text-xl font-bold text-gray-900">{total.toLocaleString()}</span>
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 text-xs">
          {slices.length === 0 && !loading && (
            <span className="italic text-gray-400">{t('dashboard.charts.noData')}</span>
          )}
          {slices.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-gray-700">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="font-semibold text-gray-900">
                {s.value.toLocaleString()}{' '}
                <span className="text-gray-400">
                  ({total > 0 ? Math.round((s.value / total) * 100) : 0}%)
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
