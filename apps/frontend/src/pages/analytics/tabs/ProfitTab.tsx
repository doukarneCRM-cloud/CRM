import { useEffect, useMemo, useState } from 'react';
import {
  Banknote,
  PackageMinus,
  Truck,
  Receipt,
  PiggyBank,
  Percent,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';
import { analyticsApi, type ProfitTabPayload } from '@/services/analyticsApi';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

export function ProfitTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<ProfitTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .profit(filters)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, t('analytics.profit.error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, t]);

  const kpis = data?.kpis;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KPICard
          title={t('analytics.profit.kpi.revenue')}
          value={fmt(Math.round(kpis?.revenue ?? 0))}
          unit={t('analytics.common.mad')}
          icon={Banknote}
          iconColor="#16A34A"
          percentageChange={kpis?.percentageChanges.revenue}
        />
        <KPICard
          title={t('analytics.profit.kpi.cogs')}
          value={fmt(Math.round(kpis?.cogs ?? 0))}
          unit={t('analytics.common.mad')}
          icon={PackageMinus}
          iconColor="#F59E0B"
          percentageChange={kpis?.percentageChanges.cogs}
        />
        <KPICard
          title={t('analytics.profit.kpi.shippingFees')}
          value={fmt(Math.round(kpis?.shippingFees ?? 0))}
          unit={t('analytics.common.mad')}
          icon={Truck}
          iconColor="#0EA5E9"
          percentageChange={kpis?.percentageChanges.shippingFees}
        />
        <KPICard
          title={t('analytics.profit.kpi.expenses')}
          value={fmt(Math.round(kpis?.expenses ?? 0))}
          unit={t('analytics.common.mad')}
          icon={Receipt}
          iconColor="#9CA3AF"
          percentageChange={kpis?.percentageChanges.expenses}
        />
        <KPICard
          title={t('analytics.profit.kpi.profit')}
          value={fmt(Math.round(kpis?.profit ?? 0))}
          unit={t('analytics.common.mad')}
          icon={PiggyBank}
          iconColor="#18181B"
          percentageChange={kpis?.percentageChanges.profit}
        />
        <KPICard
          title={t('analytics.profit.kpi.margin')}
          value={kpis ? kpis.margin.toFixed(1) : '0'}
          unit="%"
          icon={Percent}
          iconColor="#22C55E"
          percentageChange={kpis?.percentageChanges.margin}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ProfitTrendCard data={data?.trend ?? []} loading={loading} />
        <BreakdownCard
          breakdown={
            data?.breakdown ?? { revenue: 0, cogs: 0, shippingFees: 0, expenses: 0, profit: 0 }
          }
          loading={loading}
        />
      </div>

      <ByProductCard products={data?.byProduct ?? []} loading={loading} />
      <ByAgentCard agents={data?.byAgent ?? []} loading={loading} />
    </div>
  );
}

function ProfitTrendCard({
  data,
  loading,
}: {
  data: ProfitTabPayload['trend'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="lg:col-span-2 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.profit.trend.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.profit.trend.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[240px] w-full rounded-xl" />
      ) : data.length === 0 ? (
        <div className="flex h-[240px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noDataInRange')}
        </div>
      ) : (
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
              <CartesianGrid stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short' })
                }
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #F3F4F6',
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${fmt(Math.round(v))} ${t('analytics.common.mad')}`]}
              />
              <Bar dataKey="revenue" fill="#16A34A" radius={[4, 4, 0, 0]} opacity={0.4} />
              <Line type="monotone" dataKey="profit" stroke="#18181B" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function BreakdownCard({
  breakdown,
  loading,
}: {
  breakdown: ProfitTabPayload['breakdown'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const items = useMemo(
    () => [
      { label: t('analytics.profit.breakdown.revenue'), value: breakdown.revenue, color: '#16A34A' },
      { label: t('analytics.profit.breakdown.cogs'), value: breakdown.cogs, color: '#F59E0B', deduction: true },
      { label: t('analytics.profit.breakdown.shippingFees'), value: breakdown.shippingFees, color: '#0EA5E9', deduction: true },
      { label: t('analytics.profit.breakdown.expenses'), value: breakdown.expenses, color: '#9CA3AF', deduction: true },
    ],
    [breakdown, t],
  );

  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.profit.breakdown.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.profit.breakdown.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[200px] w-full rounded-xl" />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {items.map((it) => (
              <div key={it.label}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-600">
                    {it.deduction && <span className="text-rose-500">−</span>} {it.label}
                  </span>
                  <span className="font-bold text-gray-900">
                    {fmt(Math.round(it.value))} {t('analytics.common.mad')}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${(it.value / max) * 100}%`,
                      backgroundColor: it.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between rounded-card bg-primary/5 px-3 py-2">
            <span className="text-xs font-semibold text-primary">{t('analytics.profit.breakdown.equalsProfit')}</span>
            <span
              className={cn(
                'text-base font-bold',
                breakdown.profit >= 0 ? 'text-primary' : 'text-rose-600',
              )}
            >
              {fmt(Math.round(breakdown.profit))} {t('analytics.common.mad')}
            </span>
          </div>
        </>
      )}
    </GlassCard>
  );
}

function ByProductCard({
  products,
  loading,
}: {
  products: ProfitTabPayload['byProduct'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.profit.byProduct.title')}</h3>
        <p className="text-[11px] text-gray-400">
          {t('analytics.profit.byProduct.subtitleHtmlPrefix')}
          <span className="font-semibold">{t('analytics.profit.byProduct.subtitleHtmlBold')}</span>
          {t('analytics.profit.byProduct.subtitleHtmlSuffix')}
        </p>
      </div>
      {loading ? (
        <div className="skeleton h-[300px] w-full rounded-xl" />
      ) : products.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-2">{t('analytics.profit.byProduct.columns.product')}</th>
                <th className="py-2 text-right">{t('analytics.profit.byProduct.columns.units')}</th>
                <th className="py-2 text-right">{t('analytics.profit.byProduct.columns.revenue')}</th>
                <th className="py-2 text-right">{t('analytics.profit.byProduct.columns.cogs')}</th>
                <th className="py-2 text-right">{t('analytics.profit.byProduct.columns.profit')}</th>
                <th className="py-2 text-right">{t('analytics.profit.byProduct.columns.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.productId} className="border-b border-gray-50">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 shrink-0 overflow-hidden rounded-btn bg-gray-100">
                        {p.imageUrl ? (
                          <img
                            src={p.imageUrl}
                            alt={p.productName}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <span className="truncate text-sm font-medium text-gray-700">
                        {p.productName}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-right text-gray-600">{p.unitsSold}</td>
                  <td className="py-2 text-right text-gray-700">{fmt(Math.round(p.revenue))}</td>
                  <td className="py-2 text-right text-amber-700">{fmt(Math.round(p.cogs))}</td>
                  <td
                    className={cn(
                      'py-2 text-right font-bold',
                      p.profit >= 0 ? 'text-primary' : 'text-rose-600',
                    )}
                  >
                    {fmt(Math.round(p.profit))}
                  </td>
                  <td className="py-2 text-right">
                    <span
                      className={cn(
                        'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                        p.margin >= 30
                          ? 'bg-green-100 text-green-700'
                          : p.margin >= 10
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {p.margin.toFixed(0)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

function ByAgentCard({
  agents,
  loading,
}: {
  agents: ProfitTabPayload['byAgent'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.profit.byAgent.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.profit.byAgent.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[260px] w-full rounded-xl" />
      ) : agents.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <div
              key={a.agentId}
              className="rounded-card border border-gray-100 bg-white px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">{a.agentName}</span>
                <span
                  className={cn(
                    'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                    a.margin >= 30
                      ? 'bg-green-100 text-green-700'
                      : a.margin >= 10
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700',
                  )}
                >
                  {a.margin.toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 space-y-1 text-[11px]">
                <Row label={t('analytics.profit.byAgent.row.revenue')} value={a.revenue} color="text-green-700" />
                <Row label={t('analytics.profit.byAgent.row.cogs')} value={a.cogs} color="text-amber-700" />
                <Row label={t('analytics.profit.byAgent.row.shipping')} value={a.shippingFees} color="text-blue-700" />
                <div className="mt-1 border-t border-gray-100 pt-1">
                  <Row
                    label={t('analytics.profit.byAgent.row.profit')}
                    value={a.profit}
                    color={a.profit >= 0 ? 'text-primary font-bold' : 'text-rose-600 font-bold'}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={color}>
        {fmt(Math.round(value))} <span className="text-[10px] text-gray-400">{t('analytics.common.mad')}</span>
      </span>
    </div>
  );
}
