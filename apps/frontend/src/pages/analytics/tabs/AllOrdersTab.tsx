/**
 * All Orders tab — demand-oriented analytics, redesigned for at-a-glance
 * decisions. Six numbered sections so the operator scans top-down:
 *
 *   1. HEADLINES       — 8 KPI cards (orders / AOV / best product /
 *                        best variant / best city / top source /
 *                        revenue / duplicates).
 *   2. SOURCES         — donut + per-source funnel + daily trend.
 *   3. BEST CITIES     — top 10 list with orders + confirmation rate.
 *   4. PRODUCT FOCUS   — searchable picker → matrix view of variants
 *                        for the selected product, plus per-product KPIs.
 *   5. PRODUCTION PLAN — global "scale to N pieces" calculator. Splits
 *                        the target across products by their order
 *                        share, then per-color × size by variant share.
 *   6. STOCK PLAN      — collapsible per-product cards with
 *                        days-of-cover bars + suggested reorder qty.
 *
 * Velocity counts EVERY incoming order (any confirmation status) since
 * pending orders still represent real demand.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  TrendingUp,
  Layers,
  Download,
  Package,
  Search as SearchIcon,
  ChevronDown,
  ChevronUp,
  Star,
  MapPin,
  Copy as CopyIcon,
  Wallet,
  Calculator,
  Sparkles,
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
import { compareSizes } from '@/lib/sizeOrder';
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
function variantLabel(v: { color: string | null; size: string | null }): string {
  return [v.color, v.size].filter(Boolean).join(' / ') || '—';
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

function VariantMatrix({
  variants,
  targetDays,
}: {
  variants: AllOrdersVariantStat[];
  targetDays: number;
}) {
  const colors = Array.from(new Set(variants.map((v) => v.color ?? '—'))).sort();
  const sizes = Array.from(new Set(variants.map((v) => v.size ?? '—'))).sort(compareSizes);
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
                        <span className="font-bold tabular-nums text-tone-lavender-500">
                          {fmt(v.ordered)} ord
                        </span>
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
                        {v.velocityPerDay.toFixed(2)}/d
                        {suggested > 0 ? ` · +${fmt(suggested)} make` : ''}
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

// ─── Stock plan per-product card ───────────────────────────────────────────

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
        <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
          <Chip
            label={t('analytics.allOrders.spotlight.kpi.ordered')}
            value={fmt(totalOrdered)}
          />
          <Chip
            label={t('analytics.allOrders.spotlight.kpi.stock')}
            value={fmt(totalStock)}
          />
          {atRisk > 0 && (
            <Chip
              label={t('analytics.allOrders.kpi.stockAtRisk')}
              value={fmt(atRisk)}
              tone="rose"
            />
          )}
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

// ─── Global production planner ──────────────────────────────────────────────
// "I want to make N total pieces — how do I split them across products
// and variants so the mix tracks real demand?"
// Per-product share = product.orders / totalOrders. Per-variant share
// (within a product) = variant.ordered / sum(variant.ordered for product).

interface PlanRow {
  productId: string;
  productName: string;
  imageUrl: string | null;
  orders: number;
  share: number;        // 0–1
  productQty: number;
  variants: Array<{ variantId: string; color: string | null; size: string | null; share: number; qty: number }>;
}

function buildGlobalPlan({
  products,
  totalOrders,
  target,
}: {
  products: AllOrdersProductBreakdownRow[];
  totalOrders: number;
  target: number;
}): PlanRow[] {
  const eligible = products.filter((p) => p.orders > 0);
  if (eligible.length === 0 || totalOrders === 0 || target <= 0) return [];

  // Step 1 — share per product.
  const totalShareOrders = eligible.reduce((s, p) => s + p.orders, 0);
  const rawQtys = eligible.map((p) => ({
    p,
    share: p.orders / totalShareOrders,
    qty: 0,
  }));
  // Allocate quantities + fix rounding so sum == target.
  let allocated = 0;
  rawQtys.forEach((r) => {
    r.qty = Math.round(target * r.share);
    allocated += r.qty;
  });
  let diff = target - allocated;
  let safety = rawQtys.length * 4;
  while (diff !== 0 && safety-- > 0) {
    const sorted = rawQtys.slice().sort((a, b) =>
      diff > 0 ? b.qty - a.qty : a.qty - b.qty,
    );
    const item = sorted[0];
    if (!item) break;
    if (diff > 0) {
      item.qty += 1;
      diff -= 1;
    } else if (item.qty > 0) {
      item.qty -= 1;
      diff += 1;
    } else break;
  }

  // Step 2 — within each product, split across variants by share of ordered.
  return rawQtys.map(({ p, share, qty }) => {
    const orderedVariants = p.variants.filter((v) => v.ordered > 0);
    const variantTotal = orderedVariants.reduce((s, v) => s + v.ordered, 0);
    const subRows = orderedVariants.map((v) => ({
      variantId: v.variantId,
      color: v.color,
      size: v.size,
      share: variantTotal > 0 ? v.ordered / variantTotal : 0,
      qty: 0,
    }));
    if (subRows.length === 0) {
      return {
        productId: p.productId,
        productName: p.productName,
        imageUrl: p.imageUrl,
        orders: p.orders,
        share,
        productQty: qty,
        variants: subRows,
      };
    }
    let sub = 0;
    subRows.forEach((r) => {
      r.qty = Math.round(qty * r.share);
      sub += r.qty;
    });
    let subDiff = qty - sub;
    let subSafety = subRows.length * 4;
    while (subDiff !== 0 && subSafety-- > 0) {
      const sorted = subRows.slice().sort((a, b) =>
        subDiff > 0 ? b.qty - a.qty : a.qty - b.qty,
      );
      const item = sorted[0];
      if (!item) break;
      if (subDiff > 0) {
        item.qty += 1;
        subDiff -= 1;
      } else if (item.qty > 0) {
        item.qty -= 1;
        subDiff += 1;
      } else break;
    }
    return {
      productId: p.productId,
      productName: p.productName,
      imageUrl: p.imageUrl,
      orders: p.orders,
      share,
      productQty: qty,
      variants: subRows.sort((a, b) => b.qty - a.qty),
    };
  });
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
  const [planTarget, setPlanTarget] = useState<number>(200);

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
      if (p.variants.length === 0) return false;
      if (q && !p.productName.toLowerCase().includes(q)) return false;
      if (stockPlanRiskFilter === 'all') return true;
      return p.variants.some((v) => v.risk === stockPlanRiskFilter);
    });
  }, [productBreakdown, stockPlanSearch, stockPlanRiskFilter]);

  const globalPlan = useMemo(
    () =>
      buildGlobalPlan({
        products: productBreakdown,
        totalOrders: data?.kpis.totalOrders ?? 0,
        target: planTarget,
      }),
    [productBreakdown, data, planTarget],
  );

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
        variantLabel(v),
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
  const bestCities = data?.bestCities ?? [];
  const bestCity = bestCities[0];

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

      {/* ═══ 1. HEADLINES ═══════════════════════════════════════════════ */}
      <section>
        <SectionHeader
          number={1}
          title={t('analytics.allOrders.section.headlines')}
          hint={t('analytics.allOrders.section.headlinesHint', { days: data?.windowDays ?? 30 })}
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
            title={t('analytics.allOrders.kpi.bestProduct')}
            value={data?.bestProduct ? data.bestProduct.productName : '—'}
            unit={data?.bestProduct ? `× ${fmt(data.bestProduct.orders)}` : ''}
            icon={Star}
            tone="amber"
          />
          <KPICard
            title={t('analytics.allOrders.kpi.topVariant')}
            value={
              kpis?.topVariant
                ? `${kpis.topVariant.productName} · ${variantLabel(kpis.topVariant)}`
                : '—'
            }
            unit={kpis?.topVariant ? `× ${fmt(kpis.topVariant.quantity)}` : ''}
            icon={Sparkles}
            tone="peach"
          />
          <KPICard
            title={t('analytics.allOrders.kpi.bestCity')}
            value={bestCity ? bestCity.city : '—'}
            unit={bestCity ? `× ${fmt(bestCity.orders)}` : ''}
            icon={MapPin}
            tone="mint"
          />
          <KPICard
            title={t('analytics.allOrders.kpi.topSource')}
            value={kpis?.topSource ? kpis.topSource.source : '—'}
            unit={kpis?.topSource ? `${kpis.topSource.pct.toFixed(1)}%` : ''}
            icon={TrendingUp}
            tone="sky"
          />
          <KPICard
            title={t('analytics.allOrders.kpi.aov')}
            value={kpis ? fmt(Math.round(data?.avgOrderValue ?? 0)) : '0'}
            unit="MAD"
            icon={Wallet}
            tone="lavender"
          />
          <KPICard
            title={t('analytics.allOrders.kpi.duplicates')}
            value={fmt(data?.duplicates.count ?? 0)}
            unit={data?.duplicates.pct ? `${data.duplicates.pct.toFixed(1)}%` : ''}
            icon={CopyIcon}
            tone="rose"
          />
        </div>
        {/* Secondary row — revenue + stock at risk + window */}
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
          <MiniKpi
            label={t('analytics.allOrders.kpi.totalRevenue')}
            value={`${fmt(Math.round(data?.totalRevenue ?? 0))} MAD`}
            tone="mint"
          />
          <MiniKpi
            label={t('analytics.allOrders.kpi.stockAtRisk')}
            value={fmt(kpis?.stockAtRisk ?? 0)}
            tone="rose"
          />
          <MiniKpi
            label={t('analytics.allOrders.kpi.window')}
            value={`${data?.windowDays ?? 30}d`}
            tone="lavender"
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
                      <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} />
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

      {/* ═══ 3. BEST CITIES ═══════════════════════════════════════════ */}
      {bestCities.length > 0 && (
        <section>
          <SectionHeader
            number={3}
            title={t('analytics.allOrders.section.cities')}
            hint={t('analytics.allOrders.section.citiesHint')}
          />
          <GlassCard className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="py-1.5 pr-2 w-8">#</th>
                    <th className="py-1.5 pr-2">{t('analytics.allOrders.cities.colCity')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.cities.colOrders')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.cities.colConfirmed')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.cities.colDelivered')}</th>
                    <th className="py-1.5 pr-2 text-right">{t('analytics.allOrders.cities.colRate')}</th>
                    <th className="py-1.5">{t('analytics.allOrders.cities.colShare')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const max = Math.max(1, ...bestCities.map((c) => c.orders));
                    return bestCities.map((c, i) => (
                      <tr key={c.city} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 text-gray-400">{i + 1}</td>
                        <td className="py-1.5 pr-2 font-semibold text-gray-900">{c.city}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-900">{fmt(c.orders)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{fmt(c.confirmed)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-700">{fmt(c.delivered)}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-500">
                          {c.confirmationRate.toFixed(1)}%
                        </td>
                        <td className="py-1.5">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                            <div
                              className="h-full bg-gradient-to-r from-tone-mint-300 to-tone-mint-500"
                              style={{ width: `${(c.orders / max) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </section>
      )}

      {/* ═══ 4. PRODUCT FOCUS ════════════════════════════════════════ */}
      {productBreakdown.length > 0 && (
        <section>
          <SectionHeader
            number={4}
            title={t('analytics.allOrders.section.spotlight')}
            hint={t('analytics.allOrders.section.spotlightHint')}
          />
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
                          ? variantLabel(spotlightKpis.top)
                          : '—'
                      }
                      tone="peach"
                      small
                    />
                  </div>
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

      {/* ═══ 5. GLOBAL PRODUCTION PLANNER ═══════════════════════════ */}
      {productBreakdown.length > 0 && (data?.kpis.totalOrders ?? 0) > 0 && (
        <section>
          <SectionHeader
            number={5}
            title={t('analytics.allOrders.section.plan')}
            hint={t('analytics.allOrders.section.planHint')}
          />
          <GlassCard className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
              <Calculator size={14} className="text-tone-lavender-500" />
              <span className="font-semibold text-gray-900">
                {t('analytics.allOrders.plan.intro')}
              </span>
              <input
                type="number"
                min={1}
                step={10}
                value={planTarget}
                onChange={(e) => setPlanTarget(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 rounded-btn border border-gray-200 bg-white px-2 py-1 text-right tabular-nums text-gray-900 outline-none focus:border-tone-lavender-300"
              />
              <span className="text-gray-500">{t('analytics.allOrders.plan.pieces')}</span>
              <span className="ml-auto text-[11px] text-gray-400">
                {t('analytics.allOrders.plan.basedOn', { orders: fmt(data?.kpis.totalOrders ?? 0) })}
              </span>
            </div>

            {globalPlan.length === 0 ? (
              <p className="text-center text-xs text-gray-400">
                {t('analytics.allOrders.plan.empty')}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {globalPlan.map((p) => (
                  <div
                    key={p.productId}
                    className="rounded-card border border-gray-100 bg-white p-3"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
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
                          {p.productName}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {fmt(p.orders)} {t('analytics.allOrders.byProduct.orders')}
                          {' · '}
                          {(p.share * 100).toFixed(1)}% {t('analytics.allOrders.plan.share')}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">
                          {t('analytics.allOrders.plan.toMake')}
                        </p>
                        <p className="text-base font-bold tabular-nums text-tone-lavender-500">
                          +{fmt(p.productQty)}
                        </p>
                      </div>
                    </div>
                    {p.variants.length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                        {p.variants.map((v) => (
                          <div
                            key={v.variantId}
                            className="rounded-btn border border-gray-100 bg-tone-lavender-50/40 px-2 py-1.5"
                          >
                            <p className="truncate text-[10px] text-gray-700">
                              {variantLabel(v)}
                            </p>
                            <div className="flex items-baseline justify-between">
                              <span className="text-[9px] text-gray-400">
                                {(v.share * 100).toFixed(0)}%
                              </span>
                              <span className="font-bold tabular-nums text-tone-lavender-500">
                                +{fmt(v.qty)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between rounded-card border-2 border-tone-lavender-200 bg-tone-lavender-50 px-3 py-2 text-xs">
                  <span className="font-bold text-gray-900">
                    {t('analytics.allOrders.plan.total')}
                  </span>
                  <span className="text-base font-bold tabular-nums text-tone-lavender-500">
                    +{fmt(globalPlan.reduce((s, p) => s + p.productQty, 0))} {t('analytics.allOrders.plan.pieces')}
                  </span>
                </div>
              </div>
            )}
          </GlassCard>
        </section>
      )}

      {/* ═══ 6. STOCK PLAN ════════════════════════════════════════ */}
      {productBreakdown.length > 0 && (
        <section>
          <SectionHeader
            number={6}
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
                {(['all', 'imminent', 'low', 'healthy', 'overstock', 'stale'] as const).map((r) => (
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
                ))}
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

