/**
 * All Orders tab — demand-oriented analytics, reorganized.
 *
 * The page is now split into four clearly labeled sections so the
 * operator can scan top-down without losing the thread:
 *
 *   1. OVERVIEW    — 4 headline KPIs (volume / sources / variants / risk).
 *   2. SOURCES     — donut + funnel table + daily trend, all in one card.
 *   3. SPOTLIGHT   — pick a product and see ALL its KPIs, variant grid,
 *                    days-of-cover bars, and stock suggestions in one focused
 *                    panel. Defaults to the top product so the panel is
 *                    useful on first paint.
 *   4. STOCK PLAN  — global stock-suggestions table for cross-product
 *                    decisions, with target-coverage slider + CSV export.
 *
 * Velocity uses confirmed orders only — junk doesn't drive production.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  Layers,
  AlertTriangle,
  Download,
  Package,
  Search as SearchIcon,
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
  type AllOrdersProductBreakdownRow,
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

const SOURCE_COLOR: Record<string, string> = {
  youcan: '#7C5CFF',
  whatsapp: '#25D366',
  instagram: '#E1306C',
  manual: '#64748B',
};
function sourceColor(source: string): string {
  return SOURCE_COLOR[source] ?? '#94A3B8';
}

const RISK_TONE: Record<AllOrdersRiskBand, { bg: string; text: string; bar: string; ring: string }> = {
  imminent:  { bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-500',     ring: 'ring-red-200' },
  low:       { bg: 'bg-amber-50',   text: 'text-amber-700',   bar: 'bg-amber-500',   ring: 'ring-amber-200' },
  healthy:   { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-200' },
  overstock: { bg: 'bg-gray-100',   text: 'text-gray-600',    bar: 'bg-gray-400',    ring: 'ring-gray-200' },
  stale:     { bg: 'bg-gray-50',    text: 'text-gray-500',    bar: 'bg-gray-300',    ring: 'ring-gray-200' },
};

// ─── Section title helper — used once per section so the page reads as a
//     scannable outline rather than a wall of cards.
function SectionHeader({
  number,
  title,
  hint,
  right,
}: {
  number: number;
  title: string;
  hint?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-tone-lavender-100 text-[10px] font-bold text-tone-lavender-500">
          {number}
        </span>
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {hint && <span className="text-[11px] text-gray-400">· {hint}</span>}
      </div>
      {right}
    </div>
  );
}

export function AllOrdersTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<AllOrdersTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetDays, setTargetDays] = useState<number>(14);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<AllOrdersRiskBand | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .allOrders({ ...filters, targetDays })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Auto-spotlight the top product on first load (or when filters
        // change and the previously-spotlighted product is no longer in
        // the result set).
        const stillThere = d.productBreakdown.some((p) => p.productId === spotlightId);
        if (!stillThere) {
          setSpotlightId(d.productBreakdown[0]?.productId ?? null);
        }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, t]);

  // Recompute suggested-reorder client-side when the slider moves.
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

  const filteredSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stockSuggestions.filter((v) => {
      if (riskFilter !== 'all' && v.risk !== riskFilter) return false;
      if (!q) return true;
      return (
        v.productName.toLowerCase().includes(q) ||
        (v.color ?? '').toLowerCase().includes(q) ||
        (v.size ?? '').toLowerCase().includes(q)
      );
    });
  }, [stockSuggestions, search, riskFilter]);

  const spotlightProduct: AllOrdersProductBreakdownRow | null = useMemo(() => {
    if (!data || !spotlightId) return null;
    return data.productBreakdown.find((p) => p.productId === spotlightId) ?? null;
  }, [data, spotlightId]);

  // Per-product KPIs derived from spotlightProduct.variants — total ordered,
  // current stock across variants, weighted velocity, suggested production
  // qty for the active targetDays.
  const spotlightKpis = useMemo(() => {
    if (!spotlightProduct) return null;
    const variants = spotlightProduct.variants;
    const totalOrdered = variants.reduce((s, v) => s + v.ordered, 0);
    const totalStock = variants.reduce((s, v) => s + v.currentStock, 0);
    const totalVelocity = variants.reduce((s, v) => s + v.velocityPerDay, 0);
    const totalSuggested = variants.reduce(
      (s, v) =>
        s +
        (v.velocityPerDay > 0
          ? Math.max(0, Math.ceil(targetDays * v.velocityPerDay) - v.currentStock)
          : 0),
      0,
    );
    const atRisk = variants.filter((v) => v.risk === 'imminent' || v.risk === 'low').length;
    const top = [...variants].sort((a, b) => b.ordered - a.ordered)[0] ?? null;
    return { totalOrdered, totalStock, totalVelocity, totalSuggested, atRisk, top };
  }, [spotlightProduct, targetDays]);

  const kpis = data?.kpis;
  const sources = data?.sources ?? [];
  const trend = data?.trendBySource ?? [];
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
    const rows = filteredSuggestions.map((v) => [
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
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading && !data && (
        <p className="text-center text-xs text-gray-400">{t('common.loading')}</p>
      )}

      {/* ═══ 1. OVERVIEW ═══════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          number={1}
          title={t('analytics.allOrders.section.overview')}
          hint={t('analytics.allOrders.section.overviewHint', { days: data?.windowDays ?? 30 })}
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
            title={t('analytics.allOrders.kpi.stockAtRisk')}
            value={fmt(kpis?.stockAtRisk ?? 0)}
            icon={AlertTriangle}
            tone="rose"
          />
        </div>
      </section>

      {/* ═══ 2. SOURCES ═══════════════════════════════════════════════ */}
      {sources.length > 0 && (
        <section>
          <SectionHeader
            number={2}
            title={t('analytics.allOrders.section.sources')}
            hint={t('analytics.allOrders.section.sourcesHint')}
          />
          <GlassCard className="p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Donut */}
              <div className="lg:col-span-1">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('analytics.allOrders.sources.donutTitle')}
                </p>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sources}
                        dataKey="orders"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={75}
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
                        height={28}
                        iconSize={8}
                        formatter={(value: string) => (
                          <span className="text-[11px] text-gray-600">{value}</span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Per-source funnel table */}
              <div className="lg:col-span-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('analytics.allOrders.sources.tableTitle')}
                </p>
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
              </div>
            </div>

            {/* Daily trend, stacked by source */}
            {trend.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('analytics.allOrders.trend.title')}
                </p>
                <div style={{ height: 180 }}>
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
              </div>
            )}
          </GlassCard>
        </section>
      )}

      {/* ═══ 3. PRODUCT SPOTLIGHT ════════════════════════════════════ */}
      {data && data.productBreakdown.length > 0 && (
        <section>
          <SectionHeader
            number={3}
            title={t('analytics.allOrders.section.spotlight')}
            hint={t('analytics.allOrders.section.spotlightHint')}
          />

          {/* Product picker — horizontal scroll list of top products */}
          <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {data.productBreakdown.map((p) => {
              const active = spotlightId === p.productId;
              return (
                <button
                  key={p.productId}
                  onClick={() => setSpotlightId(p.productId)}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-card border px-3 py-2 text-left transition-all',
                    active
                      ? 'border-tone-lavender-300 bg-tone-lavender-50 ring-2 ring-tone-lavender-200'
                      : 'border-gray-100 bg-white hover:border-gray-300',
                  )}
                >
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-100 text-gray-400">
                      <Package size={14} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-gray-900">
                      {p.productName}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {fmt(p.orders)} {t('analytics.allOrders.byProduct.orders')}
                      {' · '}
                      {p.variants.length} {t('analytics.allOrders.byProduct.variants')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Spotlight panel */}
          {spotlightProduct && spotlightKpis && (
            <GlassCard className="p-4">
              <div className="mb-3 flex items-center gap-3">
                {spotlightProduct.imageUrl ? (
                  <img
                    src={spotlightProduct.imageUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                    <Package size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-bold text-gray-900">
                    {spotlightProduct.productName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {spotlightProduct.variants.length} {t('analytics.allOrders.byProduct.variants')}
                    {' · '}
                    {fmt(spotlightProduct.orders)} {t('analytics.allOrders.byProduct.orders')}
                  </p>
                </div>
              </div>

              {/* Per-product KPIs */}
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.ordered')}
                  value={fmt(spotlightKpis.totalOrdered)}
                  tone="lavender"
                />
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.stock')}
                  value={fmt(spotlightKpis.totalStock)}
                  tone="sky"
                />
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.velocity')}
                  value={spotlightKpis.totalVelocity.toFixed(2)}
                  tone="mint"
                />
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.suggested')}
                  value={fmt(spotlightKpis.totalSuggested)}
                  tone="amber"
                  prefix="+"
                />
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.atRisk')}
                  value={fmt(spotlightKpis.atRisk)}
                  tone="rose"
                />
                <MiniKpi
                  label={t('analytics.allOrders.spotlight.kpi.topVariant')}
                  value={spotlightKpis.top ? variantLabel(spotlightKpis.top) : '—'}
                  tone="peach"
                  small
                />
              </div>

              {/* Variant grid — clean color-coded tiles */}
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
                {spotlightProduct.variants.map((v) => {
                  const tone = RISK_TONE[v.risk];
                  const docPct =
                    v.daysOfCover === null
                      ? 100
                      : Math.min(100, (v.daysOfCover / 30) * 100);
                  const suggested =
                    v.velocityPerDay > 0
                      ? Math.max(
                          0,
                          Math.ceil(targetDays * v.velocityPerDay) - v.currentStock,
                        )
                      : 0;
                  return (
                    <div
                      key={v.variantId}
                      className={cn(
                        'rounded-card border p-3 transition-shadow hover:shadow-card',
                        'border-gray-100 bg-white',
                      )}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900">
                            {variantLabel(v)}
                          </p>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">
                            {fmt(v.ordered)} {t('analytics.allOrders.byProduct.orders')}
                            {' · '}
                            {v.velocityPerDay.toFixed(2)}/d
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-bold uppercase',
                            tone.bg,
                            tone.text,
                          )}
                        >
                          {t(`analytics.allOrders.risk.${v.risk}`)}
                        </span>
                      </div>
                      {/* Stock + DoC bar */}
                      <div className="space-y-1">
                        <div className="flex items-baseline justify-between text-[11px]">
                          <span className="text-gray-500">
                            {t('analytics.allOrders.spotlight.kpi.stock')}
                          </span>
                          <span className="font-semibold tabular-nums text-gray-900">
                            {fmt(v.currentStock)}
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                          <div
                            className={cn('h-full transition-all', tone.bar)}
                            style={{ width: `${docPct}%` }}
                          />
                        </div>
                        <div className="flex items-baseline justify-between text-[10px]">
                          <span className="text-gray-400">
                            {formatDoC(v.daysOfCover)}d {t('analytics.allOrders.spotlight.cover')}
                          </span>
                          {suggested > 0 && (
                            <span
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                                tone.bg,
                                tone.text,
                              )}
                            >
                              +{fmt(suggested)} {t('analytics.allOrders.spotlight.toMake')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}
        </section>
      )}

      {/* ═══ 4. STOCK PLAN — global table ═══════════════════════════════ */}
      {stockSuggestions.length > 0 && (
        <section>
          <SectionHeader
            number={4}
            title={t('analytics.allOrders.section.stockPlan')}
            hint={t('analytics.allOrders.section.stockPlanHint', { days: data?.windowDays ?? 30 })}
            right={
              <CRMButton
                variant="secondary"
                size="sm"
                leftIcon={<Download size={12} />}
                onClick={exportCsv}
              >
                {t('analytics.allOrders.stockSuggest.export')}
              </CRMButton>
            }
          />
          <GlassCard className="p-4">
            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <SearchIcon
                  size={12}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder={t('analytics.allOrders.stockSuggest.searchPh') as string}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-btn border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-tone-lavender-300"
                />
              </div>
              <div className="flex items-center gap-1 rounded-btn bg-gray-100 p-0.5 text-[10px]">
                {(['all', 'imminent', 'low', 'healthy', 'overstock', 'stale'] as const).map(
                  (r) => (
                    <button
                      key={r}
                      onClick={() => setRiskFilter(r)}
                      className={cn(
                        'rounded-sm px-2 py-1 font-semibold uppercase transition-all',
                        riskFilter === r
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      {r === 'all' ? t('analytics.allOrders.stockSuggest.allRisks') : t(`analytics.allOrders.risk.${r}`)}
                    </button>
                  ),
                )}
              </div>
              <div className="ml-auto flex items-center gap-2 text-xs">
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
            </div>

            {/* Table */}
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
                  {filteredSuggestions.map((v) => {
                    const tone = RISK_TONE[v.risk];
                    return (
                      <tr key={v.variantId} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 text-gray-700">
                          <button
                            onClick={() => setSpotlightId(v.productId)}
                            className="text-left hover:text-primary hover:underline"
                          >
                            {v.productName}
                          </button>
                        </td>
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
                  {filteredSuggestions.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="py-6 text-center text-xs text-gray-400"
                      >
                        {t('analytics.allOrders.stockSuggest.empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </section>
      )}
    </div>
  );
}

// ─── Mini-KPI tile — a flatter alternative to KPICard for the dense
//     spotlight grid where 6 metrics need to fit in one row.
function MiniKpi({
  label,
  value,
  tone,
  prefix,
  small,
}: {
  label: string;
  value: string;
  tone: 'lavender' | 'sky' | 'mint' | 'rose' | 'amber' | 'peach';
  prefix?: string;
  small?: boolean;
}) {
  const TONE_BG: Record<string, string> = {
    lavender: 'bg-tone-lavender-50',
    sky: 'bg-tone-sky-50',
    mint: 'bg-tone-mint-50',
    rose: 'bg-tone-rose-50',
    amber: 'bg-tone-amber-50',
    peach: 'bg-tone-peach-50',
  };
  const TONE_TEXT: Record<string, string> = {
    lavender: 'text-tone-lavender-500',
    sky: 'text-tone-sky-500',
    mint: 'text-tone-mint-500',
    rose: 'text-tone-rose-500',
    amber: 'text-tone-amber-500',
    peach: 'text-tone-peach-500',
  };
  return (
    <div className={cn('rounded-card p-2.5', TONE_BG[tone])}>
      <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p
        className={cn(
          'truncate font-bold tabular-nums',
          TONE_TEXT[tone],
          small ? 'text-xs' : 'text-base',
        )}
        title={value}
      >
        {prefix ?? ''}
        {value}
      </p>
    </div>
  );
}
