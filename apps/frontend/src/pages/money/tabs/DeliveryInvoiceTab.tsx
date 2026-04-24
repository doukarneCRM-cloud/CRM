import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Truck,
  Check,
  Clock,
  Search,
  ChevronDown,
  ChevronUp,
  MapPin,
  Hash,
  Download,
  Wallet,
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

function exportMonthCsv(
  m: DeliveryInvoiceMonth,
  t: (key: string) => string,
) {
  const csv = rowsToCsv(
    [
      t('money.delivery.export.headers.reference'),
      t('money.delivery.export.headers.delivered'),
      t('money.delivery.export.headers.customer'),
      t('money.delivery.export.headers.phone'),
      t('money.delivery.export.headers.city'),
      t('money.delivery.export.headers.tracking'),
      t('money.delivery.export.headers.orderTotal'),
      t('money.delivery.export.headers.carrierFee'),
      t('money.delivery.export.headers.netPayout'),
      t('money.delivery.export.headers.status'),
    ],
    m.orders.map((o) => [
      o.reference,
      o.deliveredAt ? o.deliveredAt.slice(0, 10) : '',
      o.customer.fullName,
      o.customer.phone,
      o.customer.city,
      o.trackingId ?? '',
      o.orderTotal.toFixed(2),
      o.shippingFee.toFixed(2),
      o.netPayout.toFixed(2),
      o.paidToCarrier ? t('money.delivery.export.statusReceived') : t('money.delivery.export.statusPending'),
    ]),
  );
  downloadCsv(`delivery-invoice_${m.period}.csv`, csv);
}

type Filter = 'all' | 'paid' | 'unpaid';

export function DeliveryInvoiceTab() {
  const { t } = useTranslation();
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
        if (!cancelled) setError(apiErrorMessage(e, t('money.delivery.loadFailed')));
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
      setError(apiErrorMessage(e, t('money.delivery.updateFailed')));
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
          title={t('money.delivery.kpi.delivered')}
          value={totals?.orders.toLocaleString('fr-MA') ?? '0'}
          subtitle={t('money.delivery.kpi.deliveredSubtitle', { amount: fmtMAD(totals?.totalFees ?? 0) })}
          icon={Truck}
          iconColor="#6366F1"
        />
        <KPICard
          title={t('money.delivery.kpi.totalPayout')}
          value={fmtMAD(totals?.totalPayout ?? 0)}
          subtitle={t('money.delivery.kpi.totalPayoutSubtitle')}
          icon={Wallet}
          iconColor="#0EA5E9"
        />
        <KPICard
          title={t('money.delivery.kpi.unpaidPayout')}
          value={fmtMAD(totals?.unpaidPayout ?? 0)}
          subtitle={t('money.delivery.kpi.unpaidPayoutSubtitle')}
          icon={Clock}
          iconColor="#F59E0B"
        />
        <KPICard
          title={t('money.delivery.kpi.received')}
          value={fmtMAD(totals?.paidPayout ?? 0)}
          subtitle={t('money.delivery.kpi.receivedSubtitle')}
          icon={Check}
          iconColor="#10B981"
        />
      </div>

      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <CRMInput
              leftIcon={<Search size={14} />}
              placeholder={t('money.delivery.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              wrapperClassName="flex-1 max-w-md"
            />
            <FbDateRangePicker
              value={dateRange}
              onChange={(r) => setDateRange(r)}
              placeholder={t('money.delivery.anyDate')}
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
                  {t(`money.delivery.filter.${f}`)}
                </button>
              ))}
            </div>
          </div>

          {canManage && selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{t('money.delivery.bulk.selected', { count: selected.size })}</span>
              <CRMButton
                size="sm"
                variant="secondary"
                onClick={() => setOrderPaid(Array.from(selected), false)}
                loading={bulkLoading}
              >
                {t('money.delivery.bulk.markPending')}
              </CRMButton>
              <CRMButton
                size="sm"
                leftIcon={<Check size={13} />}
                onClick={() => setOrderPaid(Array.from(selected), true)}
                loading={bulkLoading}
              >
                {t('money.delivery.bulk.markReceived')}
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
              {debounced ? t('money.delivery.emptySearch') : t('money.delivery.emptyNone')}
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
                        {t('money.delivery.month.summary', { orders: m.orderCount, paid: m.paidCount, unpaid: m.unpaidCount })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.delivery.month.unpaidPayout')}</p>
                        <p className="text-sm font-bold text-amber-600">{fmtMAD(m.unpaidPayout)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.delivery.month.totalPayout')}</p>
                        <p className="text-sm font-bold text-gray-900">{fmtMAD(m.totalPayout)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.delivery.month.fees')}</p>
                        <p className="text-xs font-semibold text-gray-500">{fmtMAD(m.totalFees)}</p>
                      </div>
                      <CRMButton
                        size="sm"
                        variant="ghost"
                        leftIcon={<Download size={13} />}
                        onClick={(e) => {
                          e.stopPropagation();
                          exportMonthCsv(m, t);
                        }}
                      >
                        {t('money.delivery.month.csv')}
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
                          {t('money.delivery.month.markMonth')}
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
                            <th className="px-3 py-2 text-left">{t('money.delivery.columns.order')}</th>
                            <th className="px-3 py-2 text-left">{t('money.delivery.columns.delivered')}</th>
                            <th className="px-3 py-2 text-left">{t('money.delivery.columns.customer')}</th>
                            <th className="px-3 py-2 text-left">{t('money.delivery.columns.tracking')}</th>
                            <th className="px-3 py-2 text-right">{t('money.delivery.columns.total')}</th>
                            <th className="px-3 py-2 text-right">{t('money.delivery.columns.fee')}</th>
                            <th className="px-3 py-2 text-right">{t('money.delivery.columns.payout')}</th>
                            <th className="px-3 py-2 text-right">{t('money.delivery.columns.status')}</th>
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
                              <td className="px-3 py-2.5 text-right text-gray-600">
                                {fmtMAD(o.orderTotal)}
                              </td>
                              <td className="px-3 py-2.5 text-right text-gray-500">
                                −{fmtMAD(o.shippingFee)}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                {fmtMAD(o.netPayout)}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {o.paidToCarrier ? (
                                  <span className="inline-flex items-center gap-1 rounded-badge bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                                    <Check size={10} /> {t('money.delivery.status.received')}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-badge bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                                    <Clock size={10} /> {t('money.delivery.status.pending')}
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
