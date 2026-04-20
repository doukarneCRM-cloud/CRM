import { useEffect, useState } from 'react';
import {
  Truck,
  Check,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Hash,
  DollarSign,
  Download,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { KPICard } from '@/components/ui/KPICard';
import { FbDateRangePicker } from '@/components/ui/FbDateRangePicker';
import { rowsToCsv, downloadCsv } from '@/lib/csv';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { moneyApi, type DeliveryInvoiceMonth, type DeliveryInvoicePayload } from '@/services/moneyApi';

function fmtMAD(n: number): string {
  return `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function exportMonthCsv(m: DeliveryInvoiceMonth) {
  const csv = rowsToCsv(
    ['Reference', 'Delivered', 'Customer', 'Phone', 'City', 'Tracking', 'Fee (MAD)', 'Status'],
    m.orders.map((o) => [
      o.reference,
      o.deliveredAt ? o.deliveredAt.slice(0, 10) : '',
      o.customer.fullName,
      o.customer.phone,
      o.customer.city,
      o.trackingId ?? '',
      o.shippingFee.toFixed(2),
      o.paidToCarrier ? 'Paid' : 'Unpaid',
    ]),
  );
  downloadCsv(`delivery-invoice_${m.period}.csv`, csv);
}

type Filter = 'all' | 'paid' | 'unpaid';

export function DeliveryInvoiceTab() {
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.MONEY_MANAGE));

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('unpaid');
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [data, setData] = useState<DeliveryInvoicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    moneyApi
      .listDeliveryInvoice({
        paidOnly: filter,
        search: debounced || undefined,
        dateFrom: dateRange.from ?? undefined,
        dateTo: dateRange.to ?? undefined,
      })
      .then((r) => {
        if (cancelled) return;
        setData(r);
        setSelected(new Set());
        if (r.months.length > 0 && !expanded) {
          setExpanded(r.months[0].period);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, 'Failed to load delivery invoice'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `expanded` intentionally omitted — we only auto-expand on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, debounced, reloadKey, dateRange.from, dateRange.to]);

  const setOrderPaid = async (orderIds: string[], paid: boolean) => {
    if (orderIds.length === 0) return;
    setBulkLoading(true);
    setError(null);
    try {
      await moneyApi.setCarrierPaid(orderIds, paid);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(apiErrorMessage(e, 'Failed to update paid status'));
    } finally {
      setBulkLoading(false);
    }
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard
          title="Delivered Orders"
          value={totals?.orders.toLocaleString('fr-MA') ?? '0'}
          icon={Truck}
          iconColor="#6366F1"
        />
        <KPICard
          title="Total Fees"
          value={fmtMAD(totals?.totalFees ?? 0)}
          icon={DollarSign}
          iconColor="#0EA5E9"
        />
        <KPICard
          title="Unpaid"
          value={fmtMAD(totals?.unpaidFees ?? 0)}
          icon={Clock}
          iconColor="#F59E0B"
        />
        <KPICard
          title="Paid"
          value={fmtMAD(totals?.paidFees ?? 0)}
          icon={Check}
          iconColor="#10B981"
        />
      </div>

      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <CRMInput
              leftIcon={<Search size={14} />}
              placeholder="Search reference, tracking, customer, city…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="flex-1 max-w-md"
            />
            <FbDateRangePicker
              value={dateRange}
              onChange={(r) => setDateRange(r)}
              placeholder="Any date"
            />
            <div className="flex items-center gap-1 rounded-card border border-gray-100 bg-white p-1">
              {(['unpaid', 'paid', 'all'] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors',
                    filter === f
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-500 hover:bg-accent hover:text-primary',
                  )}
                >
                  {f === 'all' ? 'All' : f === 'paid' ? 'Paid' : 'Unpaid'}
                </button>
              ))}
            </div>
          </div>

          {canManage && selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{selected.size} selected</span>
              <CRMButton
                size="sm"
                variant="secondary"
                onClick={() => setOrderPaid(Array.from(selected), false)}
                loading={bulkLoading}
              >
                Mark unpaid
              </CRMButton>
              <CRMButton
                size="sm"
                leftIcon={<Check size={13} />}
                onClick={() => setOrderPaid(Array.from(selected), true)}
                loading={bulkLoading}
              >
                Mark paid
              </CRMButton>
            </div>
          )}
        </div>

        {loading ? (
          <div className="skeleton h-[320px] w-full rounded-xl" />
        ) : !data || data.months.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-gray-400">
            <Truck size={28} className="text-gray-300" />
            <p className="text-sm">
              {debounced ? 'No orders match this search.' : 'No delivered orders yet.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {data.months.map((m) => {
              const isOpen = expanded === m.period;
              return (
                <div
                  key={m.period}
                  className="overflow-hidden rounded-card border border-gray-100 bg-white"
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : m.period)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/30"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-gray-900">{m.label}</p>
                      <p className="text-[11px] text-gray-400">
                        {m.orderCount} orders · {m.paidCount} paid · {m.unpaidCount} unpaid
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Unpaid</p>
                        <p className="text-sm font-bold text-amber-600">{fmtMAD(m.unpaidFees)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Total</p>
                        <p className="text-sm font-bold text-gray-900">{fmtMAD(m.totalFees)}</p>
                      </div>
                      <CRMButton
                        size="sm"
                        variant="ghost"
                        leftIcon={<Download size={13} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          exportMonthCsv(m);
                        }}
                      >
                        CSV
                      </CRMButton>
                      {canManage && m.unpaidCount > 0 && (
                        <CRMButton
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            const unpaidIds = m.orders
                              .filter((o) => !o.paidToCarrier)
                              .map((o) => o.id);
                            setOrderPaid(unpaidIds, true);
                          }}
                          disabled={bulkLoading}
                        >
                          Mark month paid
                        </CRMButton>
                      )}
                      {isOpen ? (
                        <ChevronUp size={18} className="text-gray-400" />
                      ) : (
                        <ChevronDown size={18} className="text-gray-400" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-gray-100">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                          <tr>
                            {canManage && (
                              <th className="w-8 px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={
                                    m.orders.length > 0 &&
                                    m.orders.every((o) => selected.has(o.id))
                                  }
                                  onChange={() => {
                                    setSelected((prev) => {
                                      const n = new Set(prev);
                                      const allSelected = m.orders.every((o) => n.has(o.id));
                                      for (const o of m.orders) {
                                        if (allSelected) n.delete(o.id);
                                        else n.add(o.id);
                                      }
                                      return n;
                                    });
                                  }}
                                  className="h-3.5 w-3.5 accent-primary"
                                />
                              </th>
                            )}
                            <th className="px-3 py-2 text-left">Order</th>
                            <th className="px-3 py-2 text-left">Delivered</th>
                            <th className="px-3 py-2 text-left">Customer</th>
                            <th className="px-3 py-2 text-left">Tracking</th>
                            <th className="px-3 py-2 text-right">Fee</th>
                            <th className="px-3 py-2 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.orders.map((o) => (
                            <tr key={o.id} className="border-t border-gray-50 hover:bg-accent/20">
                              {canManage && (
                                <td className="px-3 py-2.5">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(o.id)}
                                    onChange={() => toggle(o.id)}
                                    className="h-3.5 w-3.5 accent-primary"
                                  />
                                </td>
                              )}
                              <td className="px-3 py-2.5 font-semibold text-gray-900">
                                {o.reference}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">
                                {fmtDate(o.deliveredAt)}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600">
                                <div className="truncate">{o.customer.fullName}</div>
                                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                  <MapPin size={10} /> {o.customer.city}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 text-gray-500">
                                {o.trackingId ? (
                                  <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                    <Hash size={10} /> {o.trackingId}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                {fmtMAD(o.shippingFee)}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {o.paidToCarrier ? (
                                  <span className="inline-flex items-center gap-1 rounded-badge bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <Check size={10} /> Paid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-badge bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                    <Clock size={10} /> Unpaid
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
