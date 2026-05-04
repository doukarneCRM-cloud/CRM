/**
 * Smart Répartition — production planner for one model (product).
 *
 * Flow:
 *   1. Pick a model + date range (existing analytics filters apply too).
 *   2. Adjust status weights — sliders give live feedback on the demand
 *      table since the math is client-side.
 *   3. Set production targets per color (how many pieces to make).
 *   4. Tweak business rules (min XXL, boost M / L, max XXL %).
 *   5. Click "Calculate" → see final per-(color × size) plan that
 *      matches the targets exactly.
 *   6. Insights panel surfaces most/least demanded sizes + suggestions.
 *
 * Backend returns raw (color, size, lifecycle-status) counts. Every
 * weight, rule, and target is applied here so sliders update instantly
 * without refetching.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Package,
  Calculator,
  RotateCcw,
  Sparkles,
  Lightbulb,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { compareSizes } from '@/lib/sizeOrder';
import {
  analyticsApi,
  type SmartRepartitionPayload,
  type LifecycleStatus,
} from '@/services/analyticsApi';
import { supportApi } from '@/services/ordersApi';
import type { Product } from '@/types/orders';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';

// ─── Types ──────────────────────────────────────────────────────────────────

type StatusWeights = Record<LifecycleStatus, number>;

const DEFAULT_WEIGHTS: StatusWeights = {
  delivered: 1.0,
  shipped: 0.9,
  confirmed: 0.7,
  pending: 0.5,
  returned: 0.2,
  cancelled: 0.0,
};

interface Rules {
  minXXL: number;
  boostM: number; // percent (e.g. 10 = +10%)
  boostL: number;
  maxXXLPct: number; // percent of total target (0 = no cap)
  applyRules: boolean;
}

const DEFAULT_RULES: Rules = {
  minXXL: 2,
  boostM: 10,
  boostL: 10,
  maxXXLPct: 0,
  applyRules: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

const STATUS_TONE: Record<LifecycleStatus, { bg: string; text: string }> = {
  delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  shipped: { bg: 'bg-sky-50', text: 'text-sky-700' },
  confirmed: { bg: 'bg-tone-lavender-50', text: 'text-tone-lavender-500' },
  pending: { bg: 'bg-amber-50', text: 'text-amber-700' },
  returned: { bg: 'bg-rose-50', text: 'text-rose-700' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

const ALL_STATUSES: LifecycleStatus[] = [
  'delivered',
  'shipped',
  'confirmed',
  'pending',
  'returned',
  'cancelled',
];

// ─── Repartition algorithm ──────────────────────────────────────────────────

interface RepartitionResult {
  color: string;
  perSize: Map<string, number>;
  total: number;
}

function computeRepartition({
  weightedDemand,
  colors,
  sizes,
  targets,
  rules,
}: {
  weightedDemand: Map<string, Map<string, number>>;
  colors: string[];
  sizes: string[];
  targets: Map<string, number>;
  rules: Rules;
}): RepartitionResult[] {
  return colors.map((color) => {
    const target = targets.get(color) ?? 0;
    const perSize = new Map<string, number>();
    if (target <= 0) {
      sizes.forEach((s) => perSize.set(s, 0));
      return { color, perSize, total: 0 };
    }

    const colorDemand = weightedDemand.get(color) ?? new Map<string, number>();

    // Step 1 — initial percentages from weighted demand. If no demand
    // at all (brand-new product), fall back to even distribution so we
    // still produce something rather than zeroing out every size.
    const totalDemand = sizes.reduce((s, sz) => s + (colorDemand.get(sz) ?? 0), 0);
    const pcts = new Map<string, number>();
    if (totalDemand <= 0) {
      const even = 1 / sizes.length;
      sizes.forEach((s) => pcts.set(s, even));
    } else {
      sizes.forEach((s) => pcts.set(s, (colorDemand.get(s) ?? 0) / totalDemand));
    }

    // Step 2 — apply boosts to M and L (when rules are on).
    if (rules.applyRules) {
      if (rules.boostM > 0 && pcts.has('M')) {
        pcts.set('M', pcts.get('M')! * (1 + rules.boostM / 100));
      }
      if (rules.boostL > 0 && pcts.has('L')) {
        pcts.set('L', pcts.get('L')! * (1 + rules.boostL / 100));
      }
      // Renormalize after boosts so the percentages still sum to 1.
      const sumAfterBoost = Array.from(pcts.values()).reduce((a, b) => a + b, 0);
      if (sumAfterBoost > 0) {
        for (const [s, p] of pcts) pcts.set(s, p / sumAfterBoost);
      }
    }

    // Step 3 — initial integer quantities by rounding.
    sizes.forEach((s) => perSize.set(s, Math.round(target * (pcts.get(s) ?? 0))));

    // Step 4 — enforce min XXL.
    if (rules.applyRules && rules.minXXL > 0 && sizes.includes('XXL')) {
      const cur = perSize.get('XXL') ?? 0;
      if (cur < rules.minXXL) {
        const deficit = rules.minXXL - cur;
        perSize.set('XXL', rules.minXXL);
        // Take from the largest non-XXL size.
        const others = sizes.filter((s) => s !== 'XXL').sort(
          (a, b) => (perSize.get(b) ?? 0) - (perSize.get(a) ?? 0),
        );
        if (others.length > 0) {
          const largest = others[0];
          perSize.set(largest, Math.max(0, (perSize.get(largest) ?? 0) - deficit));
        }
      }
    }

    // Step 5 — enforce max XXL %.
    if (rules.applyRules && rules.maxXXLPct > 0 && sizes.includes('XXL')) {
      const max = Math.floor((target * rules.maxXXLPct) / 100);
      const cur = perSize.get('XXL') ?? 0;
      if (cur > max) {
        const excess = cur - max;
        perSize.set('XXL', max);
        const others = sizes.filter((s) => s !== 'XXL');
        const otherTotal = others.reduce((a, s) => a + (perSize.get(s) ?? 0), 0);
        if (otherTotal > 0) {
          others.forEach((s) => {
            const share = (perSize.get(s) ?? 0) / otherTotal;
            perSize.set(s, (perSize.get(s) ?? 0) + Math.round(excess * share));
          });
        }
      }
    }

    // Step 6 — adjust rounding so the total matches target exactly.
    let sum = sizes.reduce((s, sz) => s + (perSize.get(sz) ?? 0), 0);
    let diff = target - sum;
    let safety = sizes.length * 4;
    while (diff !== 0 && safety-- > 0) {
      const sortedSizes = sizes
        .slice()
        .sort((a, b) =>
          diff > 0
            ? (perSize.get(b) ?? 0) - (perSize.get(a) ?? 0)
            : (perSize.get(a) ?? 0) - (perSize.get(b) ?? 0),
        );
      let adjusted = false;
      for (const s of sortedSizes) {
        const cur = perSize.get(s) ?? 0;
        if (diff > 0) {
          perSize.set(s, cur + 1);
          diff -= 1;
          adjusted = true;
          break;
        } else if (cur > 0) {
          perSize.set(s, cur - 1);
          diff += 1;
          adjusted = true;
          break;
        }
      }
      if (!adjusted) break;
    }

    sum = sizes.reduce((s, sz) => s + (perSize.get(sz) ?? 0), 0);
    return { color, perSize, total: sum };
  });
}

// ─── Insights ───────────────────────────────────────────────────────────────

interface Insight {
  kind: 'most' | 'least' | 'returns' | 'tip';
  text: string;
}

function generateInsights({
  weightedTotalsBySize,
  rawCounts,
  rows,
  sizes,
  totalOrders,
}: {
  weightedTotalsBySize: Map<string, number>;
  rawCounts: Record<LifecycleStatus, number>;
  rows: SmartRepartitionPayload['rows'];
  sizes: string[];
  totalOrders: number;
}): Insight[] {
  const out: Insight[] = [];
  if (totalOrders === 0) {
    return [{ kind: 'tip', text: 'No orders yet for this model — adjust filters or pick a different product.' }];
  }

  // Most / least demanded size.
  const sortedBySize = [...weightedTotalsBySize.entries()].sort(
    (a, b) => b[1] - a[1],
  );
  if (sortedBySize.length > 0 && sortedBySize[0][1] > 0) {
    out.push({
      kind: 'most',
      text: `Most demanded size: ${sortedBySize[0][0]} (${Math.round(
        (sortedBySize[0][1] /
          sortedBySize.reduce((a, b) => a + b[1], 0)) *
          100,
      )}% of weighted demand)`,
    });
  }
  if (sortedBySize.length > 1 && sortedBySize[sortedBySize.length - 1][1] > 0) {
    out.push({
      kind: 'least',
      text: `Least demanded size: ${
        sortedBySize[sortedBySize.length - 1][0]
      } — consider trimming production`,
    });
  }

  // Return rate per size — flag if any size has > 25% return rate.
  const shippedBySize = new Map<string, number>();
  const returnedBySize = new Map<string, number>();
  for (const r of rows) {
    if (r.status === 'shipped' || r.status === 'delivered' || r.status === 'returned') {
      shippedBySize.set(r.size, (shippedBySize.get(r.size) ?? 0) + r.count);
    }
    if (r.status === 'returned') {
      returnedBySize.set(r.size, (returnedBySize.get(r.size) ?? 0) + r.count);
    }
  }
  let highReturn: { size: string; rate: number } | null = null;
  for (const s of sizes) {
    const shipped = shippedBySize.get(s) ?? 0;
    const returned = returnedBySize.get(s) ?? 0;
    if (shipped >= 5) {
      const rate = returned / shipped;
      if (rate > 0.25 && (!highReturn || rate > highReturn.rate)) {
        highReturn = { size: s, rate };
      }
    }
  }
  if (highReturn) {
    out.push({
      kind: 'returns',
      text: `High return rate on ${highReturn.size} (${Math.round(
        highReturn.rate * 100,
      )}%) — investigate sizing or quality`,
    });
  }

  // Generic tip based on pending volume.
  const pendingShare = totalOrders > 0 ? rawCounts.pending / totalOrders : 0;
  if (pendingShare > 0.3) {
    out.push({
      kind: 'tip',
      text: `${Math.round(pendingShare * 100)}% of orders are still pending — confirm them before locking the production plan`,
    });
  }

  return out;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

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

function WeightSlider({
  label,
  value,
  tone,
  onChange,
}: {
  label: string;
  value: number;
  tone: { bg: string; text: string };
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-20 truncate text-[11px] font-semibold capitalize', tone.text)}>
        {label}
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-tone-lavender-500"
      />
      <input
        type="number"
        min={0}
        max={1}
        step={0.1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(1, Number(e.target.value) || 0)))}
        className="w-14 rounded-btn border border-gray-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-gray-900 outline-none focus:border-tone-lavender-300"
      />
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export function SmartRepartitionTab() {
  const { t } = useTranslation();
  const filters = useAnalyticsFilters();
  const [products, setProducts] = useState<Product[]>([]);
  const [modelId, setModelId] = useState<string | null>(null);
  const [data, setData] = useState<SmartRepartitionPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weights, setWeights] = useState<StatusWeights>(DEFAULT_WEIGHTS);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [computed, setComputed] = useState<RepartitionResult[] | null>(null);

  // Load products list once.
  useEffect(() => {
    let cancelled = false;
    supportApi
      .products()
      .then((r) => {
        if (cancelled) return;
        setProducts(r);
        if (!modelId && r.length > 0) setModelId(r[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch repartition data when model or filters change.
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .smartRepartition({ ...filters, modelId })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // Initialise targets with zeros so the form starts editable.
        setTargets((prev) => {
          const next: Record<string, number> = {};
          for (const c of d.colors) {
            next[c] = prev[c] ?? 0;
          }
          return next;
        });
        // Reset previous result — operator must hit Calculate again.
        setComputed(null);
      })
      .catch((e) => {
        if (!cancelled)
          setError(apiErrorMessage(e, t('analytics.smartRep.error')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [modelId, filters, t]);

  // ── Derived: weighted demand per (color, size) ─────────────────────────
  const sortedSizes = useMemo(() => {
    if (!data) return [];
    return [...data.sizes].sort(compareSizes);
  }, [data]);

  const weightedDemand = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    if (!data) return m;
    for (const row of data.rows) {
      const w = weights[row.status] ?? 0;
      if (!m.has(row.color)) m.set(row.color, new Map());
      const colorMap = m.get(row.color)!;
      colorMap.set(row.size, (colorMap.get(row.size) ?? 0) + row.count * w);
    }
    return m;
  }, [data, weights]);

  const weightedTotalsBySize = useMemo(() => {
    const m = new Map<string, number>();
    for (const colorMap of weightedDemand.values()) {
      for (const [size, val] of colorMap) {
        m.set(size, (m.get(size) ?? 0) + val);
      }
    }
    return m;
  }, [weightedDemand]);

  const grandTotal = useMemo(
    () =>
      Array.from(weightedTotalsBySize.values()).reduce((a, b) => a + b, 0),
    [weightedTotalsBySize],
  );

  const totalTarget = useMemo(
    () => Object.values(targets).reduce((a, b) => a + (Number(b) || 0), 0),
    [targets],
  );

  const insights = useMemo(() => {
    if (!data) return [];
    return generateInsights({
      weightedTotalsBySize,
      rawCounts: data.rawCounts,
      rows: data.rows,
      sizes: sortedSizes,
      totalOrders: data.totalOrders,
    });
  }, [data, weightedTotalsBySize, sortedSizes]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name })),
    [products],
  );

  const handleCalculate = () => {
    if (!data) return;
    const targetMap = new Map<string, number>();
    for (const c of data.colors) {
      targetMap.set(c, Math.max(0, Math.round(targets[c] ?? 0)));
    }
    const result = computeRepartition({
      weightedDemand,
      colors: data.colors,
      sizes: sortedSizes,
      targets: targetMap,
      rules,
    });
    setComputed(result);
  };

  const resetWeights = () => setWeights(DEFAULT_WEIGHTS);
  const resetRules = () => setRules(DEFAULT_RULES);

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ═══ 1. MODEL PICKER ═══════════════════════════════════════════ */}
      <section>
        <SectionHeader
          number={1}
          title={t('analytics.smartRep.section.model')}
          hint={t('analytics.smartRep.section.modelHint')}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              {t('analytics.smartRep.modelLabel')}
            </p>
            <CRMSelect
              options={productOptions}
              value={modelId ?? ''}
              onChange={(v) => setModelId(typeof v === 'string' ? v : v[0] ?? null)}
              searchable
              placeholder={t('analytics.smartRep.modelPh')}
            />
          </div>
          {data?.product && (
            <div className="rounded-card border border-gray-100 bg-white p-3 sm:col-span-2">
              <div className="flex items-center gap-3">
                {data.product.imageUrl ? (
                  <img
                    src={data.product.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-gray-200"
                  />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400">
                    <Package size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-gray-900">
                    {data.product.name}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {t('analytics.smartRep.basedOn', {
                      orders: fmt(data.totalOrders),
                      days: data.windowDays,
                    })}
                  </p>
                </div>
                {data.totalOrders > 0 && (
                  <div className="hidden gap-1 sm:flex">
                    {ALL_STATUSES.map((s) => {
                      const c = data.rawCounts[s];
                      if (c <= 0) return null;
                      return (
                        <span
                          key={s}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                            STATUS_TONE[s].bg,
                            STATUS_TONE[s].text,
                          )}
                        >
                          {s}: {fmt(c)}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {loading && !data && (
        <p className="text-center text-xs text-gray-400">{t('common.loading')}</p>
      )}

      {data && data.totalOrders === 0 && (
        <div className="rounded-card border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          {t('analytics.smartRep.noOrders')}
        </div>
      )}

      {data && data.totalOrders > 0 && (
        <>
          {/* ═══ 2. STATUS WEIGHTS + DEMAND ANALYSIS ═══════════════════ */}
          <section>
            <SectionHeader
              number={2}
              title={t('analytics.smartRep.section.demand')}
              hint={t('analytics.smartRep.section.demandHint')}
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* Status weights */}
              <GlassCard className="p-4 lg:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t('analytics.smartRep.statusWeights')}
                  </p>
                  <button
                    onClick={resetWeights}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700"
                  >
                    <RotateCcw size={10} /> {t('analytics.smartRep.reset')}
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {ALL_STATUSES.map((s) => (
                    <WeightSlider
                      key={s}
                      label={t(`analytics.smartRep.status.${s}`)}
                      value={weights[s]}
                      tone={STATUS_TONE[s]}
                      onChange={(v) =>
                        setWeights((prev) => ({ ...prev, [s]: v }))
                      }
                    />
                  ))}
                </div>
              </GlassCard>

              {/* Demand analysis table */}
              <GlassCard className="p-4 lg:col-span-2">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t('analytics.smartRep.demandTable')}
                  </p>
                  <span className="text-[10px] text-gray-400">
                    {t('analytics.smartRep.weightedTotal', { total: grandTotal.toFixed(1) })}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2">{t('analytics.smartRep.col.color')}</th>
                        {sortedSizes.map((s) => (
                          <th key={s} className="py-1.5 pr-2 text-right">
                            {s}
                          </th>
                        ))}
                        <th className="py-1.5 pr-2 text-right">{t('analytics.smartRep.col.total')}</th>
                        <th className="py-1.5 text-right">{t('analytics.smartRep.col.share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.colors.map((c) => {
                        const colorMap = weightedDemand.get(c) ?? new Map<string, number>();
                        const colorTotal = sortedSizes.reduce(
                          (s, sz) => s + (colorMap.get(sz) ?? 0),
                          0,
                        );
                        return (
                          <tr key={c} className="border-b border-gray-50">
                            <td className="py-1.5 pr-2 font-semibold text-gray-900">{c}</td>
                            {sortedSizes.map((s) => (
                              <td
                                key={s}
                                className="py-1.5 pr-2 text-right tabular-nums text-gray-700"
                              >
                                {(colorMap.get(s) ?? 0).toFixed(1)}
                              </td>
                            ))}
                            <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-gray-900">
                              {colorTotal.toFixed(1)}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-gray-500">
                              {grandTotal > 0
                                ? `${((colorTotal / grandTotal) * 100).toFixed(1)}%`
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-50 font-semibold">
                        <td className="py-1.5 pr-2 text-gray-700">
                          {t('analytics.smartRep.col.total')}
                        </td>
                        {sortedSizes.map((s) => (
                          <td
                            key={s}
                            className="py-1.5 pr-2 text-right tabular-nums text-gray-900"
                          >
                            {(weightedTotalsBySize.get(s) ?? 0).toFixed(1)}
                          </td>
                        ))}
                        <td className="py-1.5 pr-2 text-right tabular-nums text-gray-900">
                          {grandTotal.toFixed(1)}
                        </td>
                        <td className="py-1.5 text-right text-gray-400">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </div>
          </section>

          {/* ═══ 3. TARGETS + RULES ═══════════════════════════════════ */}
          <section>
            <SectionHeader
              number={3}
              title={t('analytics.smartRep.section.targets')}
              hint={t('analytics.smartRep.section.targetsHint')}
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {/* Production targets */}
              <GlassCard className="p-4 lg:col-span-2">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {t('analytics.smartRep.targetsTitle')}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {data.colors.map((c) => (
                    <div
                      key={c}
                      className="flex items-center gap-2 rounded-btn border border-gray-100 bg-white px-3 py-1.5"
                    >
                      <span className="flex-1 truncate text-xs font-semibold text-gray-700">
                        {c}
                      </span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={targets[c] ?? 0}
                        onChange={(e) =>
                          setTargets((prev) => ({
                            ...prev,
                            [c]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        className="w-20 rounded-btn border border-gray-200 px-2 py-0.5 text-right text-xs tabular-nums text-gray-900 outline-none focus:border-tone-lavender-300"
                      />
                      <span className="text-[10px] text-gray-400">
                        {t('analytics.smartRep.pcs')}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
                  <span className="font-semibold text-gray-700">
                    {t('analytics.smartRep.col.total')}
                  </span>
                  <span className="font-bold tabular-nums text-tone-lavender-500">
                    {fmt(totalTarget)} {t('analytics.smartRep.pcs')}
                  </span>
                </div>
              </GlassCard>

              {/* Rules */}
              <GlassCard className="p-4 lg:col-span-1">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                    {t('analytics.smartRep.rulesTitle')}
                  </p>
                  <button
                    onClick={resetRules}
                    className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-700"
                  >
                    <RotateCcw size={10} /> {t('analytics.smartRep.reset')}
                  </button>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <RuleInput
                    label={t('analytics.smartRep.rules.minXXL')}
                    value={rules.minXXL}
                    suffix="pcs"
                    onChange={(v) => setRules((p) => ({ ...p, minXXL: v }))}
                  />
                  <RuleInput
                    label={t('analytics.smartRep.rules.boostM')}
                    value={rules.boostM}
                    suffix="%"
                    onChange={(v) => setRules((p) => ({ ...p, boostM: v }))}
                  />
                  <RuleInput
                    label={t('analytics.smartRep.rules.boostL')}
                    value={rules.boostL}
                    suffix="%"
                    onChange={(v) => setRules((p) => ({ ...p, boostL: v }))}
                  />
                  <RuleInput
                    label={t('analytics.smartRep.rules.maxXXL')}
                    value={rules.maxXXLPct}
                    suffix="%"
                    onChange={(v) => setRules((p) => ({ ...p, maxXXLPct: v }))}
                  />
                  <label className="mt-1 flex items-center gap-2 text-[11px] text-gray-600">
                    <input
                      type="checkbox"
                      checked={rules.applyRules}
                      onChange={(e) => setRules((p) => ({ ...p, applyRules: e.target.checked }))}
                      className="accent-tone-lavender-500"
                    />
                    {t('analytics.smartRep.rules.applyToggle')}
                  </label>
                </div>
              </GlassCard>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={handleCalculate}
                disabled={totalTarget <= 0}
                className={cn(
                  'flex items-center gap-2 rounded-card px-6 py-3 text-sm font-bold text-white shadow-md transition-all',
                  totalTarget > 0
                    ? 'bg-gradient-to-r from-tone-lavender-500 to-tone-lavender-300 hover:shadow-lg active:scale-[0.98]'
                    : 'cursor-not-allowed bg-gray-300',
                )}
              >
                <Sparkles size={16} />
                {t('analytics.smartRep.calculate')}
              </button>
            </div>
          </section>

          {/* ═══ 4. RESULT ═══════════════════════════════════════════ */}
          {computed && (
            <section>
              <SectionHeader
                number={4}
                title={t('analytics.smartRep.section.result')}
                hint={t('analytics.smartRep.section.resultHint')}
              />
              <GlassCard className="p-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-[10px] uppercase tracking-wide text-gray-400">
                        <th className="py-1.5 pr-2">{t('analytics.smartRep.col.color')}</th>
                        {sortedSizes.map((s) => (
                          <th key={s} className="py-1.5 pr-2 text-right">
                            {s}
                          </th>
                        ))}
                        <th className="py-1.5 pr-2 text-right">{t('analytics.smartRep.col.total')}</th>
                        <th className="py-1.5 text-right">{t('analytics.smartRep.col.share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computed.map((c) => (
                        <tr key={c.color} className="border-b border-gray-50">
                          <td className="py-2 pr-2 font-semibold text-gray-900">{c.color}</td>
                          {sortedSizes.map((s) => (
                            <td
                              key={s}
                              className="py-2 pr-2 text-right tabular-nums text-gray-900"
                            >
                              {fmt(c.perSize.get(s) ?? 0)}
                            </td>
                          ))}
                          <td className="py-2 pr-2 text-right tabular-nums font-bold text-tone-lavender-500">
                            {fmt(c.total)}
                          </td>
                          <td className="py-2 text-right tabular-nums text-gray-500">
                            {totalTarget > 0
                              ? `${((c.total / totalTarget) * 100).toFixed(1)}%`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                        <td className="py-2 pr-2 text-gray-700">
                          {t('analytics.smartRep.col.total')}
                        </td>
                        {sortedSizes.map((s) => {
                          const colTotal = computed.reduce(
                            (a, c) => a + (c.perSize.get(s) ?? 0),
                            0,
                          );
                          return (
                            <td
                              key={s}
                              className="py-2 pr-2 text-right tabular-nums text-gray-900"
                            >
                              {fmt(colTotal)}
                            </td>
                          );
                        })}
                        <td className="py-2 pr-2 text-right tabular-nums text-tone-lavender-500">
                          {fmt(computed.reduce((a, c) => a + c.total, 0))}
                        </td>
                        <td className="py-2 text-right text-gray-400">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </GlassCard>
            </section>
          )}

          {/* ═══ 5. INSIGHTS ════════════════════════════════════════ */}
          {insights.length > 0 && (
            <section>
              <SectionHeader
                number={5}
                title={t('analytics.smartRep.section.insights')}
                hint={t('analytics.smartRep.section.insightsHint')}
              />
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {insights.map((ins, i) => {
                  const ICONS = {
                    most: <TrendingUp size={14} className="text-emerald-600" />,
                    least: <TrendingUp size={14} className="rotate-180 text-gray-400" />,
                    returns: <AlertTriangle size={14} className="text-rose-600" />,
                    tip: <Lightbulb size={14} className="text-amber-600" />,
                  };
                  return (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-card border border-gray-100 bg-white px-3 py-2"
                    >
                      <div className="mt-0.5 shrink-0">{ICONS[ins.kind]}</div>
                      <p className="text-xs text-gray-700">{ins.text}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RuleInput({
  label,
  value,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex-1 truncate text-[11px] text-gray-600">{label}</span>
      <input
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-16 rounded-btn border border-gray-200 bg-white px-1.5 py-0.5 text-right text-xs tabular-nums text-gray-900 outline-none focus:border-tone-lavender-300"
      />
      {suffix && <span className="w-6 text-[10px] text-gray-400">{suffix}</span>}
    </div>
  );
}

// Suppress unused-import warning when Calculator icon isn't imported elsewhere.
void Calculator;
