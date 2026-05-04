/**
 * All Orders tab — demand-oriented analytics.
 *
 * Top of the funnel (where orders come from) + bottom of the operations
 * loop (what should the atelier produce next). Velocity uses confirmed
 * orders only, so junk doesn't bias production decisions.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  ShoppingBag,
  TrendingUp,
  Layers,
  AlertTriangle,
  Download,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { CRMButton } from '@/components/ui/CRMButton';
import { rowsToCsv, downloadCsv } from '@/lib/csv';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import {
  analyticsApi,
  type AllOrdersTabPayload,
  type AllOrdersVariantStat,
  type AllOrdersRiskBand,
} from '@/services/analyticsApi';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

function formatDoC(d: number | null): string {
  if (d === null) return '∞';
  if (d > 999) return '999+';
  return d.toFixed(1);
}

function variantLabel(v: { color: string | null; size: string | null }): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || '—';
}

// Source palette — stable colours per source so the same source has the
// same colour everywhere on the tab (donut, stacked area, table chips).
const SOURCE_COLOR: Record<string, string> = {
  youcan: '#7C5CFF',
  whatsapp: '#25D366',
  instagram: '#E1306C',
  manual: '#64748B',
};
function sourceColor(source: string): string {
  return SOURCE_COLOR[source] ?? '#94A3B8';
}

const RISK_TONE: Record<AllOrdersRiskBand, { bg: string; text: string; bar: string }> = {
  imminent:  { bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-500' },
  low:       { bg: 'bg-amber-50',   text: 'text-amber-700',   bar: 'bg-amber-500' },
  healthy:   { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500' },
  overstock: { bg: 'bg-gray-100',   text: 'text-gray-600',    bar: 'bg-gray-400' },
  stale:     { bg: 'bg-gray-50',    text: 'text-gray-500',    bar: 'bg-gray-300' },
};

export function AllOrdersTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<AllOrdersTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Client-side knob: lets the operator change the target coverage window
  // without refetching. We recompute suggestedReorder locally from velocity
  // + currentStock — those don't change with targetDays.
  const [targetDays, setTargetDays] = useState<number>(14);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .allOrders({ ...filters, targetDays })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, t('analytics.allOrders.error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // targetDays is intentionally NOT a refetch trigger — see below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, t]);

  // Recompute suggested-reorder client-side when the slider moves so the
  // table responds instantly.
  const stockSuggestions: AllOrdersVariantStat[] = useMemo(() => {
    if (!data) return [];
    return data.stockSuggestions.variants.map((v) => ({
      ...v,
      suggestedReorder:
        v.velocityPerDay > 0
          ? Math.max(0, Math.ceil(targetDays * v.velocityPerDay) - v.currentStock)
          : 0,
    }));
  }, [data, targetDays]);

  const kpis = data?.kpis;
  const sources = data?.sources ?? [];
  const trend = data?.trendBySource ?? [];
  const topVariants = data?.topVariants ?? [];
  const productBreakdown = data?.productBreakdown ?? [];
  const allSources = sources.map((s) => s.source);

  const exportCsv = () => {
    const headers = [
      'product',
      'variant',
      'ordered',
      'currentStock',
      'velocityPerDay',
      'daysOfCover',
      'suggestedReorder',
      'risk',
    ];
    const rows = stockSuggestions.map((v) => [
      v.productName,
      variantLabel(v),
      v.ordered,
      v.currentStock,
      v.velocityPerDay,
      v.daysOfCover === null ? '∞' : v.daysOfCover,
      v.suggestedReorder,
      v.risk,
    ]);
    downloadCsv('stock-suggestions.csv', rowsToCsv(headers, rows));
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <KPICard
          title={t('analytics.allOrders.kpi.totalOrders')}
          value={fmt(kpis?.totalOrders ?? 0)}
          icon={ShoppingBag}
          tone="lavender"
          percentageChange={kpis?.percentageChanges.totalOrders}
        />
        <KPICard
          title={t('analytics.allOrders.kpi.avgItems')}
          value={kpis ? kpis.avgItemsPerOrder.toFixed(1) : '0'}
          icon={Layers}
          tone="sky"
          percentageChange={kpis?.percentageChanges.avgItemsPerOrder}
        />
        <KPICard
          title={t('analytics.allOrders.kpi.topSource')}
          value={kpis?.topSource ? kpis.topSource.source : '—'}
          unit={kpis?.topSource ? `${kpis.topSource.pct.toFixed(1)}%` : ''}
          icon={TrendingUp}
          tone="mint"
        />
        <KPICard
          title={t('analytics.allOrders.kpi.topVariant')}
          value={
            kpis?.topVariant
              ? `${kpis.topVariant.productName} · ${variantLabel(kpis.topVariant)}`
              : '—'
          }
          unit={kpis?.topVariant ? `× ${fmt(kpis.topVariant.quantity)}` : ''}
          icon={Boxes}
          tone="peach"
        />
        <KPICard
          title={t('analytics.allOrders.kpi.stockAtRisk')}
          value={fmt(kpis?.stockAtRisk ?? 0)}
          icon={AlertTriangle}
          tone="rose"
        />
      </div>

      {loading && !data && (
        <p className="text-center text-xs text-gray-400">{t('common.loading')}</p>
      )}

      {/* ── Sources: donut + table ────────────────────────────────────── */}
      {sources.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GlassCard className="p-4 lg:col-span-1">
            <h3 className="mb-2 text-sm font-bold text-gray-900">
              {t('analytics.allOrders.sources.donutTitle')}
            </h3>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="orders"
                    nameKey="source"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {sources.map((s) => (
                      <Cell key={s.source} fill={sourceColor(s.source)} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [fmt(value), name]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={32}
                    iconSize={8}
                    formatter={(value: string) => (
                      <span className="text-xs text-gray-600">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard className="p-4 lg:col-span-2">
            <h3 className="mb-2 text-sm font-bold text-gray-900">
              {t('analytics.allOrders.sources.tableTitle')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="py-1.5 pr-2">{t('analytics.allOrders.sources.colSource')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.sources.colOrders')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.sources.colConfirmed')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.sources.colDelivered')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.sources.colRevenue')}</th>
                    <th className="py-1.5 text-right">{t('analytics.allOrders.sources.colRate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.source} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ background: sourceColor(s.source) }}
                          />
                          <span className="font-semibold text-gray-900">{s.source}</span>
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-900">
                        {fmt(s.orders)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                        {fmt(s.confirmed)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                        {fmt(s.delivered)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                        {fmt(Math.round(s.revenue))}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-gray-500">
                        {s.confirmationRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Daily trend, stacked by source ────────────────────────────── */}
      {trend.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-900">
            {t('analytics.allOrders.trend.title')}
          </h3>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trend.map((p) => ({ date: p.date, ...p.bySource }))}
                margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94A3B8' }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} />
                <Tooltip />
                {allSources.map((src) => (
                  <Area
                    key={src}
                    type="monotone"
                    dataKey={src}
                    stackId="1"
                    stroke={sourceColor(src)}
                    fill={sourceColor(src)}
                    fillOpacity={0.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ── Top 15 variants (horizontal bars) ────────────────────────── */}
      {topVariants.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-900">
            {t('analytics.allOrders.topVariants.title')}
          </h3>
          <div className="flex flex-col gap-1.5">
            {(() => {
              const max = Math.max(1, ...topVariants.map((v) => v.quantity));
              return topVariants.map((v) => (
                <div key={v.variantId} className="flex items-center gap-2 text-xs">
                  <div className="w-1/3 truncate text-gray-700" title={`${v.productName} · ${variantLabel(v)}`}>
                    <span className="font-medium">{v.productName}</span>
                    <span className="text-gray-400"> · {variantLabel(v)}</span>
                  </div>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
                    <div
                      className="h-full rounded-md bg-gradient-to-r from-tone-lavender-300 to-tone-lavender-500 transition-all"
                      style={{ width: `${(v.quantity / max) * 100}%` }}
                    />
                  </div>
                  <div className="w-16 shrink-0 text-right tabular-nums text-gray-900">
                    {fmt(v.quantity)}
                  </div>
                </div>
              ));
            })()}
          </div>
        </GlassCard>
      )}

      {/* ── Per-product variant breakdown (collapsible) ───────────────── */}
      {productBreakdown.length > 0 && (
        <GlassCard className="p-4">
          <h3 className="mb-2 text-sm font-bold text-gray-900">
            {t('analytics.allOrders.byProduct.title')}
          </h3>
          <div className="flex flex-col gap-1">
            {productBreakdown.map((p) => {
              const expanded = expandedProduct === p.productId;
              return (
                <div
                  key={p.productId}
                  className="rounded-md border border-gray-100 bg-white"
                >
                  <button
                    onClick={() =>
                      setExpandedProduct(expanded ? null : p.productId)
                    }
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {p.imageUrl && (
                        <img
                          src={p.imageUrl}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="truncate text-sm font-semibold text-gray-900">
                        {p.productName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-xs">
                      <span className="text-gray-500">
                        {fmt(p.orders)} {t('analytics.allOrders.byProduct.orders')}
                      </span>
                      <span className="text-gray-400">
                        {p.variants.length} {t('analytics.allOrders.byProduct.variants')}
                      </span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[9px] uppercase tracking-wide text-gray-400">
                            <th className="py-1 pr-2">{t('analytics.allOrders.byProduct.colVariant')}</th>
                            <th className="py-1 pr-2 text-right">{t('analytics.allOrders.byProduct.colOrdered')}</th>
                            <th className="py-1 pr-2 text-right">{t('analytics.allOrders.byProduct.colStock')}</th>
                            <th className="py-1 pr-2">{t('analytics.allOrders.byProduct.colDoC')}</th>
                            <th className="py-1 text-right">{t('analytics.allOrders.byProduct.colSuggest')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.variants.map((v) => {
                            const tone = RISK_TONE[v.risk];
                            const docPct =
                              v.daysOfCover === null
                                ? 100
                                : Math.min(100, (v.daysOfCover / 30) * 100);
                            const suggested =
                              v.velocityPerDay > 0
                                ? Math.max(
                                    0,
                                    Math.ceil(targetDays * v.velocityPerDay) -
                                      v.currentStock,
                                  )
                                : 0;
                            return (
                              <tr key={v.variantId} className="border-t border-gray-100">
                                <td className="py-1 pr-2 text-gray-900">
                                  {variantLabel(v)}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-gray-700">
                                  {fmt(v.ordered)}
                                </td>
                                <td className="py-1 pr-2 text-right tabular-nums text-gray-700">
                                  {fmt(v.currentStock)}
                                </td>
                                <td className="py-1 pr-2">
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
                                      <div
                                        className={cn('h-full', tone.bar)}
                                        style={{ width: `${docPct}%` }}
                                      />
                                    </div>
                                    <span className={cn('text-[10px] font-medium', tone.text)}>
                                      {formatDoC(v.daysOfCover)}d
                                    </span>
                                  </div>
                                </td>
                                <td className="py-1 text-right">
                                  <span
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                                      tone.bg,
                                      tone.text,
                                    )}
                                  >
                                    {suggested > 0 ? `+${fmt(suggested)}` : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}

      {/* ── Stock suggestions: target slider + table + CSV ────────────── */}
      {stockSuggestions.length > 0 && (
        <GlassCard className="p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-gray-900">
              {t('analytics.allOrders.stockSuggest.title')}
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <label className="text-gray-500" htmlFor="targetDays">
                  {t('analytics.allOrders.stockSuggest.targetLabel')}
                </label>
                <input
                  id="targetDays"
                  type="range"
                  min={7}
                  max={60}
                  step={1}
                  value={targetDays}
                  onChange={(e) => setTargetDays(Number(e.target.value))}
                  className="accent-tone-lavender-500"
                />
                <span className="w-10 text-right text-xs font-bold tabular-nums text-tone-lavender-500">
                  {targetDays}d
                </span>
              </div>
              <CRMButton
                variant="secondary"
                size="sm"
                leftIcon={<Download size={12} />}
                onClick={exportCsv}
              >
                {t('analytics.allOrders.stockSuggest.export')}
              </CRMButton>
            </div>
          </div>
          {data?.windowDays && (
            <p className="mb-2 text-[10px] text-gray-400">
              {t('analytics.allOrders.stockSuggest.windowHint', { days: data.windowDays })}
            </p>
          )}
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                  <th className="py-1.5 pr-2">{t('analytics.allOrders.stockSuggest.colProduct')}</th>
                  <th className="py-1.5 pr-2">{t('analytics.allOrders.stockSuggest.colVariant')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.stockSuggest.colOrdered')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.stockSuggest.colStock')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.stockSuggest.colVelocity')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.stockSuggest.colDoC')}</th>
                  <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.stockSuggest.colSuggest')}</th>
                  <th className="py-1.5 pr-2">{t('analytics.allOrders.stockSuggest.colRisk')}</th>
                </tr>
              </thead>
              <tbody>
                {stockSuggestions.map((v) => {
                  const tone = RISK_TONE[v.risk];
                  return (
                    <tr key={v.variantId} className="border-b border-gray-50">
                      <td className="py-1.5 pr-2 text-gray-700">{v.productName}</td>
                      <td className="py-1.5 pr-2 text-gray-900">{variantLabel(v)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                        {fmt(v.ordered)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">
                        {fmt(v.currentStock)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">
                        {v.velocityPerDay.toFixed(2)}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">
                        {formatDoC(v.daysOfCover)}
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {v.suggestedReorder > 0 ? `+${fmt(v.suggestedReorder)}` : '—'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2">
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {t(`analytics.allOrders.risk.${v.risk}`)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
