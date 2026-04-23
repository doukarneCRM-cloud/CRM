import { useEffect, useState } from 'react';
import {
  Truck,
  PackageCheck,
  PackageX,
  Timer,
  Banknote,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { GlassCard } from '@/components/ui/GlassCard';
import { KPICard } from '@/components/ui/KPICard';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';
import { SHIPPING_STATUS_COLORS, type ShippingStatus } from '@/constants/statusColors';
import { SHIPPING_HEX } from '@/pages/dashboard/statusHex';
import { analyticsApi, type DeliveryTabPayload } from '@/services/analyticsApi';
import { useAnalyticsFilters } from '../hooks/useAnalyticsFilters';

function fmt(n: number): string {
  return n.toLocaleString('fr-MA');
}

export function DeliveryTab() {
  const filters = useAnalyticsFilters();
  const [data, setData] = useState<DeliveryTabPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    analyticsApi
      .delivery(filters)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, 'Failed to load delivery analytics'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

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
          title="Shipped"
          value={fmt(kpis?.shipped ?? 0)}
          icon={Truck}
          iconColor="#0EA5E9"
          percentageChange={kpis?.percentageChanges.shipped}
        />
        <KPICard
          title="Delivered"
          value={fmt(kpis?.delivered ?? 0)}
          icon={PackageCheck}
          iconColor="#16A34A"
          percentageChange={kpis?.percentageChanges.delivered}
        />
        <KPICard
          title="Returned"
          value={fmt(kpis?.returned ?? 0)}
          icon={PackageX}
          iconColor="#F43F5E"
          percentageChange={kpis?.percentageChanges.returned}
        />
        <KPICard
          title="Delivery Rate"
          value={kpis ? kpis.deliveryRate.toFixed(1) : '0.0'}
          unit="%"
          iconColor="#22C55E"
          percentageChange={kpis?.percentageChanges.deliveryRate}
        />
        <KPICard
          title="Avg Delivery"
          value={kpis ? kpis.avgDeliveryDays.toFixed(1) : '0'}
          unit="days"
          icon={Timer}
          iconColor="#8B5CF6"
          percentageChange={kpis?.percentageChanges.avgDeliveryDays}
        />
        <KPICard
          title="Revenue (Delivered)"
          value={fmt(kpis?.revenue ?? 0)}
          unit="MAD"
          icon={Banknote}
          iconColor="#18181B"
          percentageChange={kpis?.percentageChanges.revenue}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <DeliveryTrendCard data={data?.trend ?? []} loading={loading} />
        <ShippingPipelineCard pipeline={data?.pipeline ?? []} loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CitiesCard cities={data?.cities ?? []} loading={loading} />
        <AgentsCard agents={data?.agents ?? []} loading={loading} />
      </div>

      <ProductsCard products={data?.products ?? []} loading={loading} />
    </div>
  );
}

// ─── Trend ───────────────────────────────────────────────────────────────────
function DeliveryTrendCard({
  data,
  loading,
}: {
  data: DeliveryTabPayload['trend'];
  loading: boolean;
}) {
  return (
    <GlassCard className="lg:col-span-2 flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Delivery Trend</h3>
        <p className="text-[11px] text-gray-400">Delivered vs returned per day</p>
      </div>
      {loading ? (
        <div className="skeleton h-[220px] w-full rounded-xl" />
      ) : data.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs text-gray-400">
          No data in range
        </div>
      ) : (
        <div className="h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="grad-delivered" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16A34A" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-returned" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="delivered"
                stroke="#16A34A"
                fill="url(#grad-delivered)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="returned"
                stroke="#F43F5E"
                fill="url(#grad-returned)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </GlassCard>
  );
}

// ─── Pipeline ────────────────────────────────────────────────────────────────
function ShippingPipelineCard({
  pipeline,
  loading,
}: {
  pipeline: DeliveryTabPayload['pipeline'];
  loading: boolean;
}) {
  const max = Math.max(1, ...pipeline.map((p) => p.count));

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Shipping Pipeline</h3>
        <p className="text-[11px] text-gray-400">Orders at each stage</p>
      </div>
      {loading ? (
        <div className="skeleton h-[220px] w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-2 overflow-y-auto pr-1">
          {pipeline.map((b) => {
            const cfg = SHIPPING_STATUS_COLORS[b.status as ShippingStatus];
            const color = SHIPPING_HEX[b.status as ShippingStatus] ?? '#9CA3AF';
            return (
              <div key={b.status} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium text-gray-700">
                      {cfg?.label ?? b.status}
                    </span>
                    <span className="text-xs font-bold text-gray-900">{b.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(b.count / max) * 100}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Cities ──────────────────────────────────────────────────────────────────
function CitiesCard({
  cities,
  loading,
}: {
  cities: DeliveryTabPayload['cities'];
  loading: boolean;
}) {
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Top Cities · Delivery</h3>
        <p className="text-[11px] text-gray-400">Avg time per city · success rate</p>
      </div>
      {loading ? (
        <div className="skeleton h-[260px] w-full rounded-xl" />
      ) : cities.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          No data
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                <th className="py-2">City</th>
                <th className="py-2 text-right">Orders</th>
                <th className="py-2 text-right">Delivered</th>
                <th className="py-2 text-right">Returned</th>
                <th className="py-2 text-right">Avg days</th>
                <th className="py-2 text-right">Rate</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((c) => (
                <tr key={c.city} className="border-t border-gray-50">
                  <td className="py-2 font-medium text-gray-700">{c.city}</td>
                  <td className="py-2 text-right text-gray-600">{c.orders}</td>
                  <td className="py-2 text-right font-semibold text-green-700">{c.delivered}</td>
                  <td className="py-2 text-right text-rose-600">{c.returned}</td>
                  <td className="py-2 text-right text-gray-600">{c.avgDeliveryDays || '—'}</td>
                  <td className="py-2 text-right">
                    <span
                      className={cn(
                        'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                        c.deliveryRate >= 70
                          ? 'bg-green-100 text-green-700'
                          : c.deliveryRate >= 40
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {c.deliveryRate.toFixed(0)}%
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

// ─── Agents ──────────────────────────────────────────────────────────────────
function AgentsCard({
  agents,
  loading,
}: {
  agents: DeliveryTabPayload['agents'];
  loading: boolean;
}) {
  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Top Agents · Delivery</h3>
        <p className="text-[11px] text-gray-400">Confirmed vs delivered + revenue</p>
      </div>
      {loading ? (
        <div className="skeleton h-[260px] w-full rounded-xl" />
      ) : agents.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          No data
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
                <span className="text-xs font-bold text-primary">
                  {fmt(a.revenue)} <span className="font-normal text-gray-400">MAD</span>
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
                <Stat label="Confirmed" value={a.confirmed} color="text-blue-700" />
                <Stat label="Delivered" value={a.delivered} color="text-green-700" />
                <Stat label="Returned" value={a.returned} color="text-rose-600" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${a.deliveryRate}%` }}
                  />
                </div>
                <span className="text-[11px] font-semibold text-gray-600">
                  {a.deliveryRate.toFixed(0)}%
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

// ─── Products with variant drilldown ─────────────────────────────────────────
function ProductsCard({
  products,
  loading,
}: {
  products: DeliveryTabPayload['products'];
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <GlassCard className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Top Products · Delivery</h3>
        <p className="text-[11px] text-gray-400">
          Tap a row to see best-performing variants
        </p>
      </div>
      {loading ? (
        <div className="skeleton h-[300px] w-full rounded-xl" />
      ) : products.length === 0 ? (
        <div className="flex h-[180px] items-center justify-center text-xs text-gray-400">
          No data
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
                      // eslint-disable-next-line @next/next/no-img-element
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
                      {p.orders} orders · {p.delivered} delivered · {p.returned} returned
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs font-bold text-primary">
                      {fmt(p.revenue)} <span className="text-[10px] text-gray-400">MAD</span>
                    </span>
                    <span
                      className={cn(
                        'rounded-badge px-2 py-0.5 text-[10px] font-bold',
                        p.deliveryRate >= 70
                          ? 'bg-green-100 text-green-700'
                          : p.deliveryRate >= 40
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700',
                      )}
                    >
                      {p.deliveryRate.toFixed(0)}%
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
                      <p className="text-[11px] text-gray-400">No variant breakdown</p>
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
                                {v.delivered}/{v.orders}
                              </span>
                              <span
                                className={cn(
                                  'font-bold',
                                  v.deliveryRate >= 70 ? 'text-green-700' : 'text-gray-700',
                                )}
                              >
                                {v.deliveryRate.toFixed(0)}%
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
