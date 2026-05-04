/**
 * All Orders tab — demand-oriented analytics.
 *
 * Sections:
 *   1. OVERVIEW    — 4 headline KPIs.
 *   2. SOURCES     — donut + per-source funnel + daily trend.
 *   3. SPOTLIGHT   — searchable dropdown to pick ANY product, then a
 *                    color × size matrix view of its variants with
 *                    stock + days-of-cover bars.
 *   4. STOCK PLAN  — grouped by product (collapsible). Each product
 *                    expands to show its variant matrix AND a "scale
 *                    prediction" calculator that answers
 *                    "if I want N more orders, how many of each
 *                    variant should I produce?"
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
  ChevronDown,
  ChevronUp,
  Calculator,
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
import { CRMSelect } from '@/components/ui/CRMSelect';
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

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

function formatDoC(d: number | null): string {
  if (d === null) return '∞';
  if (d > 999) return '999+';
  return d.toFixed(1);
}

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL'];
function sizeRank(s: string | null): number {
  if (!s) return 1000;
  const idx = SIZE_ORDER.indexOf(s.toUpperCase().trim());
  if (idx !== -1) return idx;
  // Numeric sizes (e.g. "8 ans", "36"): sort by leading number after letters.
  const n = Number(s.replace(/[^\d.]/g, ''));
  if (Number.isFinite(n)) return 1100 + n;
  return 1500;
}

const SOURCE_COLOR: Record<string, string> = {
  youcan: '#7C5CFF',
  whatsapp: '#25D366',
  instagram: '#E1306C',
  manual: '#64748B',
};
const sourceColor = (s: string) => SOURCE_COLOR[s] ?? '#94A3B8';

const RISK_TONE: Record<
  AllOrdersRiskBand,
  { bg: string; text: string; bar: string; ring: string }
> = {
  imminent:  { bg: 'bg-red-50',     text: 'text-red-700',     bar: 'bg-red-500',     ring: 'ring-red-200' },
  low:       { bg: 'bg-amber-50',   text: 'text-amber-700',   bar: 'bg-amber-500',   ring: 'ring-amber-200' },
  healthy:   { bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', ring: 'ring-emerald-200' },
  overstock: { bg: 'bg-gray-100',   text: 'text-gray-600',    bar: 'bg-gray-400',    ring: 'ring-gray-200' },
  stale:     { bg: 'bg-gray-50',    text: 'text-gray-500',    bar: 'bg-gray-300',    ring: 'ring-gray-200' },
};

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

// ─── Variant matrix (color × size grid) ─────────────────────────────────────
// One cell per (color, size) combo that exists for the product. Empty
// combos render as a faded "—" so the grid keeps a clean rectangular
// shape. Each cell shows: ordered count, current stock, days-of-cover
// micro-bar, and the suggested-to-produce delta as a chip.

function VariantMatrix({
  variants,
  targetDays,
}: {
  variants: AllOrdersVariantStat[];
  targetDays: number;
}) {
  const colors = Array.from(
    new Set(variants.map((v) => v.color ?? '—')),
  ).sort();
  const sizes = Array.from(
    new Set(variants.map((v) => v.size ?? '—')),
  ).sort((a, b) => sizeRank(a) - sizeRank(b));
  const byKey = new Map(
    variants.map((v) => [`${v.color ?? '—'}|${v.size ?? '—'}`, v]),
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate" style={{ borderSpacing: 4 }}>
        <thead>
          <tr>
            <th className="w-24 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Color \ Size
            </th>
            {sizes.map((s) => (
              <th
                key={s}
                className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500"
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colors.map((c) => (
            <tr key={c}>
              <td className="text-xs font-bold text-gray-700">{c}</td>
              {sizes.map((s) => {
                const v = byKey.get(`${c}|${s}`);
                if (!v) {
                  return (
                    <td key={s}>
                      <div className="h-[68px] rounded-md border border-dashed border-gray-200 bg-gray-50 text-center text-[10px] leading-[68px] text-gray-300">
                        —
                      </div>
                    </td>
                  );
                }
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
                  <td key={s}>
                    <div
                      className={cn(
                        'flex h-[68px] flex-col justify-between rounded-md border p-1.5 transition-shadow hover:shadow-sm',
                        tone.bg,
                        'border-transparent ring-1',
                        tone.ring,
                      )}
                    >
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold tabular-nums text-gray-900">
                          {fmt(v.currentStock)}
                        </span>
                        {suggested > 0 && (
                          <span
                            className={cn(
                              'rounded px-1 py-0.5 text-[9px] font-bold tabular-nums',
                              tone.text,
                            )}
                          >
                            +{fmt(suggested)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-end justify-between gap-1">
                        <div className="flex-1">
                          <div className="h-1 w-full overflow-hidden rounded-full bg-white/60">
                            <div
                              className={cn('h-full', tone.bar)}
                              style={{ width: `${docPct}%` }}
                            />
                          </div>
                        </div>
                        <span className={cn('text-[9px] font-medium', tone.text)}>
                          {formatDoC(v.daysOfCover)}d
                        </span>
                      </div>
                      <p className="truncate text-[9px] text-gray-500">
                        {fmt(v.ordered)} ord · {v.velocityPerDay.toFixed(2)}/d
                      </p>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Scale-to-N-orders prediction ──────────────────────────────────────────
// Given a product's variants and a target additional-order count, project
// the demand share per variant from past order shares and compute how
// many of each to produce. Total at the bottom is the headline answer
// to "to get N more orders, produce M more units".

function ScalePrediction({
  variants,
}: {
  variants: AllOrdersVariantStat[];
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<number>(100);

  const totalOrdered = variants.reduce((s, v) => s + v.ordered, 0);
  const rows = useMemo(() => {
    if (totalOrdered === 0) return [];
    return variants
      .filter((v) => v.ordered > 0)
      .map((v) => {
        const share = v.ordered / totalOrdered;
        const projected = Math.ceil(share * target);
        const toProduce = Math.max(0, projected - v.currentStock);
        return {
          variantId: v.variantId,
          color: v.color,
          size: v.size,
          ordered: v.ordered,
          share,
          projected,
          currentStock: v.currentStock,
          toProduce,
        };
      })
      .sort((a, b) => b.share - a.share);
  }, [variants, target, totalOrdered]);

  const totalToProduce = rows.reduce((s, r) => s + r.toProduce, 0);
  const totalProjected = rows.reduce((s, r) => s + r.projected, 0);

  if (totalOrdered === 0) {
    return (
      <div className="rounded-md bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
        {t('analytics.allOrders.scale.noHistory')}
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-100 bg-white p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Calculator size={14} className="text-tone-lavender-500" />
        <span className="text-xs font-bold text-gray-900">
          {t('analytics.allOrders.scale.title')}
        </span>
        <div className="ml-2 flex items-center gap-1.5">
          <label htmlFor="scale-target" className="text-[11px] text-gray-500">
            {t('analytics.allOrders.scale.targetLabel')}
          </label>
          <input
            id="scale-target"
            type="number"
            min={1}
            step={10}
            value={target}
            onChange={(e) => setTarget(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-btn border border-gray-200 bg-white px-2 py-0.5 text-xs tabular-nums text-gray-900 outline-none focus:border-tone-lavender-300"
          />
          <span className="text-[11px] text-gray-500">
            {t('analytics.allOrders.scale.ordersUnit')}
          </span>
        </div>
        <span className="ml-auto text-[11px] font-semibold text-tone-lavender-500">
          {t('analytics.allOrders.scale.totalProduce', { count: totalToProduce })}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
              <th className="py-1 pr-2">{t('analytics.allOrders.scale.colVariant')}</th>
              <th className="py-1 pr-2 text-right">{t('analytics.allOrders.scale.colShare')}</th>
              <th className="py-1 pr-2 text-right">{t('analytics.allOrders.scale.colProjected')}</th>
              <th className="py-1 pr-2 text-right">{t('analytics.allOrders.scale.colStock')}</th>
              <th className="py-1 text-right">{t('analytics.allOrders.scale.colToProduce')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.variantId} className="border-b border-gray-50">
                <td className="py-1 pr-2 text-gray-900">
                  {[r.color, r.size].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-gray-500">
                  {(r.share * 100).toFixed(1)}%
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-gray-700">
                  {fmt(r.projected)}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums text-gray-500">
                  {fmt(r.currentStock)}
                </td>
                <td className="py-1 text-right">
                  {r.toProduce > 0 ? (
                    <span className="rounded bg-tone-lavender-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-tone-lavender-500">
                      +{fmt(r.toProduce)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-600">
                      {t('analytics.allOrders.scale.covered')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="py-1.5 pr-2 text-gray-700">
                {t('analytics.allOrders.scale.total')}
              </td>
              <td className="py-1.5 pr-2 text-right text-gray-400">100.0%</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-gray-900">
                {fmt(totalProjected)}
              </td>
              <td className="py-1.5 pr-2"></td>
              <td className="py-1.5 text-right tabular-nums text-tone-lavender-500">
                +{fmt(totalToProduce)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Mini-KPI tile ──────────────────────────────────────────────────────────

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

// ─── Per-product card in the Stock plan section ────────────────────────────
// Collapsible: header row shows headline numbers, body shows the matrix
// + scale prediction widget. Default-collapsed; first card auto-expands.

function StockPlanProductCard({
  product,
  defaultOpen,
  targetDays,
  onSpotlight,
}: {
  product: AllOrdersProductBreakdownRow;
  defaultOpen: boolean;
  targetDays: number;
  onSpotlight: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  const variants = product.variants;
  const totalOrdered = variants.reduce((s, v) => s + v.ordered, 0);
  const totalStock = variants.reduce((s, v) => s + v.currentStock, 0);
  const totalSuggested = variants.reduce(
    (s, v) =>
      s +
      (v.velocityPerDay > 0
        ? Math.max(0, Math.ceil(targetDays * v.velocityPerDay) - v.currentStock)
        : 0),
    0,
  );
  const atRisk = variants.filter(
    (v) => v.risk === 'imminent' || v.risk === 'low',
  ).length;

  return (
    <div className="rounded-card border border-gray-100 bg-white">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
            <Package size={14} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-gray-900">
            {product.productName}
          </p>
          <p className="truncate text-[10px] text-gray-500">
            {fmt(product.orders)} {t('analytics.allOrders.byProduct.orders')}
            {' · '}
            {variants.length} {t('analytics.allOrders.byProduct.variants')}
          </p>
        </div>
        {/* Inline summary chips */}
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Chip label={t('analytics.allOrders.spotlight.kpi.ordered')} value={fmt(totalOrdered)} />
          <Chip label={t('analytics.allOrders.spotlight.kpi.stock')} value={fmt(totalStock)} />
          {atRisk > 0 && <Chip label={t('analytics.allOrders.kpi.stockAtRisk')} value={fmt(atRisk)} tone="rose" />}
          {totalSuggested > 0 && (
            <Chip
              label={t('analytics.allOrders.spotlight.kpi.suggested')}
              value={`+${fmt(totalSuggested)}`}
              tone="lavender"
            />
          )}
        </div>
        <span className="shrink-0 text-gray-400">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 px-3 py-3">
          {variants.length === 0 ? (
            <p className="text-center text-xs text-gray-400">
              {t('analytics.allOrders.byProduct.emptyVariants')}
            </p>
          ) : (
            <>
              <VariantMatrix variants={variants} targetDays={targetDays} />
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[10px] text-gray-400">
                  {t('analytics.allOrders.byProduct.matrixHint')}
                </p>
                <button
                  onClick={onSpotlight}
                  className="text-[11px] font-semibold text-tone-lavender-500 hover:underline"
                >
                  {t('analytics.allOrders.byProduct.openSpotlight')} →
                </button>
              </div>
              <div className="mt-3">
                <ScalePrediction variants={variants} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: string;
  tone?: 'gray' | 'lavender' | 'rose';
}) {
  const TONE: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700',
    lavender: 'bg-tone-lavender-50 text-tone-lavender-500',
    rose: 'bg-tone-rose-50 text-tone-rose-500',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]', TONE[tone])}>
      <span className="opacity-70">{label}:</span>
      <span className="font-bold tabular-nums">{value}</span>
    </span>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function AllOrdersTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<AllOrdersTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetDays, setTargetDays] = useState<number>(14);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [stockPlanSearch, setStockPlanSearch] = useState('');
  const [stockPlanRiskFilter, setStockPlanRiskFilter] = useState<AllOrdersRiskBand | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .allOrders({ ...filters, targetDays })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        const stillThere = d.productBreakdown.some((p) => p.productId === spotlightId);
        if (!stillThere) {
          // Pick the first product WITH orders, or the first product overall
          // if nothing has orders, so the spotlight isn't blank on first paint.
          const withOrders = d.productBreakdown.find((p) => p.orders > 0);
          setSpotlightId((withOrders ?? d.productBreakdown[0])?.productId ?? null);
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

  const recomputeSuggested = (v: AllOrdersVariantStat): AllOrdersVariantStat => ({
    ...v,
    suggestedReorder:
      v.velocityPerDay > 0
        ? Math.max(0, Math.ceil(targetDays * v.velocityPerDay) - v.currentStock)
        : 0,
  });

  const productBreakdown = useMemo(() => {
    if (!data) return [];
    return data.productBreakdown.map((p) => ({
      ...p,
      variants: p.variants.map(recomputeSuggested),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, targetDays]);

  const productOptions = useMemo(
    () =>
      productBreakdown.map((p) => ({
        value: p.productId,
        // Format: "Product name · 14 orders · 5 variants"
        label: `${p.productName}${p.orders > 0 ? ` · ${p.orders} orders` : ''}${p.variants.length > 0 ? ` · ${p.variants.length} variants` : ''}`,
      })),
    [productBreakdown],
  );

  const spotlightProduct: AllOrdersProductBreakdownRow | null = useMemo(() => {
    if (!data || !spotlightId) return null;
    return productBreakdown.find((p) => p.productId === spotlightId) ?? null;
  }, [productBreakdown, spotlightId, data]);

  const spotlightKpis = useMemo(() => {
    if (!spotlightProduct) return null;
    const variants = spotlightProduct.variants;
    const totalOrdered = variants.reduce((s, v) => s + v.ordered, 0);
    const totalStock = variants.reduce((s, v) => s + v.currentStock, 0);
    const totalVelocity = variants.reduce((s, v) => s + v.velocityPerDay, 0);
    const totalSuggested = variants.reduce((s, v) => s + v.suggestedReorder, 0);
    const atRisk = variants.filter((v) => v.risk === 'imminent' || v.risk === 'low').length;
    const top = [...variants].sort((a, b) => b.ordered - a.ordered)[0] ?? null;
    return { totalOrdered, totalStock, totalVelocity, totalSuggested, atRisk, top };
  }, [spotlightProduct]);

  const stockPlanProducts = useMemo(() => {
    const q = stockPlanSearch.trim().toLowerCase();
    return productBreakdown.filter((p) => {
      // Only include products that have variants (otherwise the card is empty).
      if (p.variants.length === 0) return false;
      if (q && !p.productName.toLowerCase().includes(q)) return false;
      if (stockPlanRiskFilter === 'all') return true;
      return p.variants.some((v) => v.risk === stockPlanRiskFilter);
    });
  }, [productBreakdown, stockPlanSearch, stockPlanRiskFilter]);

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
    const rows = productBreakdown
      .flatMap((p) => p.variants.map((v) => ({ p, v })))
      .map(({ p, v }) => [
        p.productName,
        [v.color, v.size].filter(Boolean).join(' / ') || '—',
        v.ordered,
        v.currentStock,
        v.velocityPerDay,
        v.daysOfCover === null ? '∞' : v.daysOfCover,
        v.suggestedReorder,
        v.risk,
      ]);
    downloadCsv('stock-plan.csv', rowsToCsv(headers, rows));
  };

  const kpis = data?.kpis;
  const sources = data?.sources ?? [];
  const trend = data?.trendBySource ?? [];
  const allSources = sources.map((s) => s.source);

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
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-900">{fmt(s.orders)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{fmt(s.confirmed)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{fmt(s.delivered)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{fmt(Math.round(s.revenue))}</td>
                          <td className="py-1.5 text-right tabular-nums text-gray-500">{s.confirmationRate.toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

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
      {productBreakdown.length > 0 && (
        <section>
          <SectionHeader
            number={3}
            title={t('analytics.allOrders.section.spotlight')}
            hint={t('analytics.allOrders.section.spotlightHint')}
          />

          {/* Searchable dropdown — replaces horizontal scroll list */}
          <div className="mb-3 max-w-md">
            <CRMSelect
              options={productOptions}
              value={spotlightId ?? ''}
              onChange={(v) => setSpotlightId(typeof v === 'string' ? v : v[0] ?? null)}
              searchable
              placeholder={t('analytics.allOrders.spotlight.pickerPh')}
            />
          </div>

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

              {spotlightProduct.variants.length === 0 ? (
                <div className="rounded-md bg-gray-50 px-3 py-3 text-center text-xs text-gray-400">
                  {t('analytics.allOrders.byProduct.emptyVariants')}
                </div>
              ) : (
                <>
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
                      value={
                        spotlightKpis.top
                          ? [spotlightKpis.top.color, spotlightKpis.top.size]
                              .filter(Boolean)
                              .join(' / ') || '—'
                          : '—'
                      }
                      tone="peach"
                      small
                    />
                  </div>

                  {/* Matrix view */}
                  <div className="mt-4">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                      {t('analytics.allOrders.spotlight.matrixTitle')}
                    </p>
                    <VariantMatrix
                      variants={spotlightProduct.variants}
                      targetDays={targetDays}
                    />
                    <p className="mt-1 text-[10px] text-gray-400">
                      {t('analytics.allOrders.byProduct.matrixHint')}
                    </p>
                  </div>
                </>
              )}
            </GlassCard>
          )}
        </section>
      )}

      {/* ═══ 4. STOCK PLAN — per-product cards ═══════════════════════ */}
      {productBreakdown.length > 0 && (
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
            {/* Toolbar: search + risk filter + targetDays slider */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <SearchIcon
                  size={12}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder={t('analytics.allOrders.stockSuggest.searchPh') as string}
                  value={stockPlanSearch}
                  onChange={(e) => setStockPlanSearch(e.target.value)}
                  className="w-full rounded-btn border border-gray-200 bg-white py-1.5 pl-7 pr-2 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-tone-lavender-300"
                />
              </div>
              <div className="flex items-center gap-1 rounded-btn bg-gray-100 p-0.5 text-[10px]">
                {(['all', 'imminent', 'low', 'healthy', 'overstock', 'stale'] as const).map(
                  (r) => (
                    <button
                      key={r}
                      onClick={() => setStockPlanRiskFilter(r)}
                      className={cn(
                        'rounded-sm px-2 py-1 font-semibold uppercase transition-all',
                        stockPlanRiskFilter === r
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700',
                      )}
                    >
                      {r === 'all'
                        ? t('analytics.allOrders.stockSuggest.allRisks')
                        : t(`analytics.allOrders.risk.${r}`)}
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

            {/* Per-product cards */}
            {stockPlanProducts.length === 0 ? (
              <p className="text-center text-xs text-gray-400">
                {t('analytics.allOrders.stockSuggest.empty')}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {stockPlanProducts.map((p, i) => (
                  <StockPlanProductCard
                    key={p.productId}
                    product={p}
                    defaultOpen={i === 0}
                    targetDays={targetDays}
                    onSpotlight={() => setSpotlightId(p.productId)}
                  />
                ))}
              </div>
            )}
          </GlassCard>
        </section>
      )}
    </div>
  );
}
