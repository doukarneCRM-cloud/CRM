import { useEffect, useMemo, useState } from 'react';
import {
  PhoneCall,
  CheckCircle2,
  XCircle,
  PhoneOff,
  Hourglass,
  Timer,
  GitMerge,
  ChevronDown,
  ChevronUp,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';
import {
  CONFIRMATION_STATUS_COLORS,
  type ConfirmationStatus,
} from '@/constants/statusColors';
import { CONFIRMATION_HEX } from '@/pages/dashboard/statusHex';
import { analyticsApi, type ConfirmationTabPayload } from '@/services/analyticsApi';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

export function ConfirmationTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<ConfirmationTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .confirmation(filters)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, t('analytics.confirmation.error')));
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <KPICard
          title={t('analytics.confirmation.kpi.totalOrders')}
          value={fmt(kpis?.totalOrders ?? 0)}
          icon={PhoneCall}
          iconColor="#0EA5E9"
          percentageChange={kpis?.percentageChanges.totalOrders}
        />
        <KPICard
          title={t('analytics.confirmation.kpi.confirmed')}
          value={fmt(kpis?.confirmed ?? 0)}
          icon={CheckCircle2}
          iconColor="#16A34A"
          percentageChange={kpis?.percentageChanges.confirmed}
        />
        <KPICard
          title={t('analytics.confirmation.kpi.cancelled')}
          value={fmt(kpis?.cancelled ?? 0)}
          icon={XCircle}
          iconColor="#9CA3AF"
          percentageChange={kpis?.percentageChanges.cancelled}
        />
        <KPICard
          title={t('analytics.confirmation.kpi.unreachable')}
          value={fmt(kpis?.unreachable ?? 0)}
          icon={PhoneOff}
          iconColor="#EF4444"
        />
        <KPICard
          title={t('analytics.confirmation.kpi.merged')}
          value={`${fmt(kpis?.merged ?? 0)} · ${kpis ? kpis.mergedRate.toFixed(1) : '0.0'}%`}
          icon={GitMerge}
          iconColor="#F59E0B"
          percentageChange={kpis?.percentageChanges.merged}
        />
        <KPICard
          title={t('analytics.confirmation.kpi.confirmationRate')}
          value={kpis ? kpis.confirmationRate.toFixed(1) : '0.0'}
          unit="%"
          icon={Hourglass}
          iconColor="#22C55E"
          percentageChange={kpis?.percentageChanges.confirmationRate}
        />
        <KPICard
          title={t('analytics.confirmation.kpi.avgConfirmTime')}
          value={kpis ? kpis.avgConfirmationHours.toFixed(1) : '0'}
          unit="h"
          icon={Timer}
          iconColor="#8B5CF6"
          percentageChange={kpis?.percentageChanges.avgConfirmationHours}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ConfirmationTrendCard data={data?.trend ?? []} loading={loading} />
        <FunnelCard pipeline={data?.pipeline ?? []} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CitiesCard cities={data?.cities ?? []} loading={loading} />
        <AgentsCard agents={data?.agents ?? []} loading={loading} />
      </div>

      <ProductsCard products={data?.products ?? []} loading={loading} />
    </div>
  );
}

function ConfirmationTrendCard({
  data,
  loading,
}: {
  data: ConfirmationTabPayload['trend'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="lg:col-span-2 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.confirmation.trend.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.confirmation.trend.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[220px] w-full rounded-xl" />
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noDataInRange')}
        </div>
      ) : (
        <div className="h-[220px]">
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
              />
              <Bar dataKey="confirmed" fill="#22C55E" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="cancelled"
                stroke="#9CA3AF"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

function FunnelCard({
  pipeline,
  loading,
}: {
  pipeline: ConfirmationTabPayload['pipeline'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const slices = useMemo(
    () =>
      pipeline
        .filter((p) => p.count > 0)
        .map((p) => ({
          status: p.status,
          label: CONFIRMATION_STATUS_COLORS[p.status as ConfirmationStatus]?.label ?? p.status,
          count: p.count,
          color: CONFIRMATION_HEX[p.status as ConfirmationStatus] ?? '#9CA3AF',
        })),
    [pipeline],
  );
  const total = slices.reduce((s, x) => s + x.count, 0);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.confirmation.funnel.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.confirmation.funnel.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[220px] w-full rounded-xl" />
      ) : total === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <>
          <div className="relative h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((s) => (
                    <Cell key={s.status} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #F3F4F6',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wide text-gray-400">{t('analytics.common.total')}</span>
              <span className="text-xl font-bold text-gray-900">{total}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {slices.map((s) => (
              <div key={s.status} className="flex items-center justify-between text-[11px]">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="truncate text-gray-600">{s.label}</span>
                </div>
                <span className="shrink-0 font-semibold text-gray-900">{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}

function CitiesCard({
  cities,
  loading,
}: {
  cities: ConfirmationTabPayload['cities'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.confirmation.cities.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.confirmation.cities.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[260px] w-full rounded-xl" />
      ) : cities.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-2">{t('analytics.confirmation.cities.columns.city')}</th>
                <th className="py-2 text-right">{t('analytics.confirmation.cities.columns.orders')}</th>
                <th className="py-2 text-right">{t('analytics.confirmation.cities.columns.confirmed')}</th>
                <th className="py-2 text-right">{t('analytics.confirmation.cities.columns.cancelled')}</th>
                <th className="py-2 text-right">{t('analytics.confirmation.cities.columns.rate')}</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city} className="border-t border-gray-50">
                  <td className="py-2 font-medium text-gray-700">{c.city}</td>
                  <td className="py-2 text-right text-gray-600">{c.orders}</td>
                  <td className="py-2 text-right font-semibold text-green-700">{c.confirmed}</td>
                  <td className="py-2 text-right text-gray-500">{c.cancelled}</td>
                  <td className="py-2 text-right">
                    <span
                      className={cn(
                        'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                        c.confirmationRate >= 60
                          ? 'bg-green-100 text-green-700'
                          : c.confirmationRate >= 30
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {c.confirmationRate.toFixed(0)}%
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

function AgentsCard({
  agents,
  loading,
}: {
  agents: ConfirmationTabPayload['agents'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.confirmation.agents.title')}</h3>
        <p className="text-[11px] text-gray-400">{t('analytics.confirmation.agents.subtitle')}</p>
      </div>
      {loading ? (
        <div className="skeleton h-[260px] w-full rounded-xl" />
      ) : agents.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {agents.map((a) => (
            <div
              key={a.agentId}
              className="rounded-card border border-gray-100 bg-white px-3 py-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-gray-900">{a.agentName}</span>
                <span className="text-xs font-bold text-primary">{t('analytics.confirmation.agents.calls', { count: a.total })}</span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                <Stat label={t('analytics.confirmation.agents.stat.confirmed')} value={a.confirmed} color="text-green-700" />
                <Stat label={t('analytics.confirmation.agents.stat.cancelled')} value={a.cancelled} color="text-gray-700" />
                <Stat label={t('analytics.confirmation.agents.stat.unreachable')} value={a.unreachable} color="text-rose-600" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${a.confirmationRate}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600">
                  {a.confirmationRate.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase text-gray-400">{label}</span>
      <span className={cn('text-xs font-bold', color)}>{value}</span>
    </div>
  );
}

function ProductsCard({
  products,
  loading,
}: {
  products: ConfirmationTabPayload['products'];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{t('analytics.confirmation.products.title')}</h3>
        <p className="text-[11px] text-gray-400">
          {t('analytics.confirmation.products.subtitle')}
        </p>
      </div>
      {loading ? (
        <div className="skeleton h-[300px] w-full rounded-xl" />
      ) : products.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          {t('analytics.common.noData')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {products.map((p) => {
            const isOpen = expanded === p.productId;
            return (
              <div
                key={p.productId}
                className="overflow-hidden rounded-card border border-gray-100 bg-white"
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : p.productId)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/50"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-btn bg-gray-100">
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.productName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                        —
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{p.productName}</p>
                    <p className="text-[11px] text-gray-400">
                      {t('analytics.confirmation.products.breakdown', {
                        orders: p.orders,
                        confirmed: p.confirmed,
                        cancelled: p.cancelled,
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className={cn(
                        'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                        p.confirmationRate >= 60
                          ? 'bg-green-100 text-green-700'
                          : p.confirmationRate >= 30
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {p.confirmationRate.toFixed(0)}%
                    </span>
                    {isOpen ? (
                      <ChevronUp size={16} className="text-gray-400" />
                    ) : (
                      <ChevronDown size={16} className="text-gray-400" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-2.5">
                    {p.variants.length === 0 ? (
                      <p className="text-[11px] text-gray-400">{t('analytics.confirmation.products.noVariants')}</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                        {p.variants.map((v) => (
                          <div
                            key={v.variantId}
                            className="rounded-btn border border-gray-100 bg-white px-2.5 py-2"
                          >
                            <p className="truncate text-xs font-semibold text-gray-700">
                              {v.label}
                            </p>
                            <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500">
                              <span>
                                {v.confirmed}/{v.orders}
                              </span>
                              <span
                                className={cn(
                                  'font-bold',
                                  v.confirmationRate >= 60 ? 'text-green-700' : 'text-gray-700',
                                )}
                              >
                                {v.confirmationRate.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
