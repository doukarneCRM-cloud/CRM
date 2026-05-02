import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Check,
  Clock,
  ChevronRight,
  History,
  Upload,
  FileText,
  X,
  Wallet,
  Trash2,
  Package,
  MapPin,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { KPICard } from '@/components/ui/KPICard';
import { FilePreviewModal } from '@/components/ui/FilePreviewModal';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  moneyApi,
  type AgentCommissionRow,
  type AgentPendingOrder,
  type CommissionPayment,
} from '@/services/moneyApi';
import { getSocket } from '@/services/socket';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function fmtMAD(n: number): string {
  return `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function CommissionTab() {
  const { t } = useTranslation();
  const canManage = useAuthStore((s) => s.hasPermission(PERMISSIONS.MONEY_MANAGE));

  const [rows, setRows] = useState<AgentCommissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentCommissionRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    moneyApi
      .listAgentCommissions()
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, t('money.commission.loadFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Live: every order:delivered (and order:updated for shipping changes)
  // moves the per-agent commission totals. Refetch the agent rollup so
  // the cards stay accurate without a manual refresh.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }
    const onChange = () => setReloadKey((k) => k + 1);
    socket.on('order:delivered', onChange);
    socket.on('order:updated', onChange);
    return () => {
      socket?.off('order:delivered', onChange);
      socket?.off('order:updated', onChange);
    };
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.paid += r.paidTotal;
        acc.pending += r.pendingTotal;
        acc.delivered += r.deliveredCount;
        return acc;
      },
      { paid: 0, pending: 0, delivered: 0 },
    );
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPICard
          title={t('money.commission.kpi.owed')}
          value={fmtMAD(totals.pending)}
          icon={Clock}
          tone="amber"
        />
        <KPICard
          title={t('money.commission.kpi.paid')}
          value={fmtMAD(totals.paid)}
          icon={Check}
          tone="mint"
        />
        <KPICard
          title={t('money.commission.kpi.delivered')}
          value={totals.delivered.toLocaleString('fr-MA')}
          icon={Package}
          tone="sky"
        />
        <KPICard
          title={t('money.commission.kpi.agents')}
          value={rows.length.toString()}
          icon={Users}
          tone="lavender"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-[160px] rounded-card" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <GlassCard className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-gray-400">
          <Users size={28} className="text-gray-300" />
          <p className="text-sm">{t('money.commission.emptyAgents')}</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => (
            <button
              key={r.agentId}
              onClick={() => setSelected(r)}
              className="group text-left"
            >
              <GlassCard className="flex flex-col gap-3 transition-all group-hover:border-primary/30 group-hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AgentInitial name={r.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{r.name}</p>
                      <p className="truncate text-[11px] text-gray-400">{r.roleLabel}</p>
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-gray-300 transition-colors group-hover:text-primary" />
                </div>

                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.commission.card.owed')}</p>
                    <p className="text-lg font-bold text-amber-600">{fmtMAD(r.pendingTotal)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.commission.card.paid')}</p>
                    <p className="text-sm font-semibold text-emerald-600">{fmtMAD(r.paidTotal)}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-500">
                  <span>
                    <b className="text-gray-800">{r.pendingCount}</b> {t('money.commission.card.pending')}
                  </span>
                  <span>
                    <b className="text-gray-800">{r.paidCount}</b> {t('money.commission.card.paidLabel')}
                  </span>
                  <span>
                    {t('money.commission.card.rate')} <b className="text-gray-800">{fmtMAD(r.perOrderRate)}</b>
                  </span>
                </div>
              </GlassCard>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <AgentDrawer
          agent={selected}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onPaymentRecorded={() => {
            setSelected(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ─── Agent drawer ───────────────────────────────────────────────────────────

function AgentDrawer({
  agent,
  canManage,
  onClose,
  onPaymentRecorded,
}: {
  agent: AgentCommissionRow;
  canManage: boolean;
  onClose: () => void;
  onPaymentRecorded: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [showPayForm, setShowPayForm] = useState(false);

  return (
    <GlassModal open onClose={onClose} title={`${agent.name} · ${t('money.commission.drawer.titleSuffix')}`} size="2xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-card border border-amber-100 bg-amber-50/60 px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-amber-700">{t('money.commission.drawer.owed')}</p>
            <p className="text-xl font-bold text-amber-700">{fmtMAD(agent.pendingTotal)}</p>
            <p className="text-[11px] text-amber-700/80">{t('money.commission.drawer.orders', { count: agent.pendingCount })}</p>
          </div>
          <div className="rounded-card border border-emerald-100 bg-emerald-50/60 px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-emerald-700">{t('money.commission.drawer.paidTotal')}</p>
            <p className="text-xl font-bold text-emerald-700">{fmtMAD(agent.paidTotal)}</p>
            <p className="text-[11px] text-emerald-700/80">{t('money.commission.drawer.orders', { count: agent.paidCount })}</p>
          </div>
          <div className="rounded-card border border-gray-100 bg-white px-3 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{t('money.commission.drawer.totalEarned')}</p>
            <p className="text-xl font-bold text-gray-900">{fmtMAD(agent.total)}</p>
            <p className="text-[11px] text-gray-500">{t('money.commission.drawer.delivered', { count: agent.deliveredCount })}</p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-card border border-gray-100 bg-white p-1">
            <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
              <Clock size={13} /> {t('money.commission.drawer.pending')}
            </TabBtn>
            <TabBtn active={tab === 'history'} onClick={() => setTab('history')}>
              <History size={13} /> {t('money.commission.drawer.history')}
            </TabBtn>
          </div>

          {canManage && agent.pendingTotal > 0 && (
            <CRMButton
              leftIcon={<Wallet size={14} />}
              onClick={() => setShowPayForm(true)}
            >
              {t('money.commission.drawer.recordPayment')}
            </CRMButton>
          )}
        </div>

        {tab === 'pending' && <PendingOrders agentId={agent.agentId} />}
        {tab === 'history' && (
          <PaymentHistory agentId={agent.agentId} canManage={canManage} onChange={onPaymentRecorded} />
        )}

        {showPayForm && (
          <RecordPaymentModal
            agent={agent}
            onClose={() => setShowPayForm(false)}
            onSaved={onPaymentRecorded}
          />
        )}
      </div>
    </GlassModal>
  );
}

function AgentInitial({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
      {initials}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-accent hover:text-primary',
      )}
    >
      {children}
    </button>
  );
}

// ─── Pending orders list ────────────────────────────────────────────────────

function PendingOrders({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AgentPendingOrder[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    moneyApi
      .listAgentPendingOrders(agentId)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setErr(apiErrorMessage(e, t('money.commission.pendingOrders.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [agentId, t]);

  if (err)
    return (
      <div className="rounded-card border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
        {err}
      </div>
    );
  if (!rows) return <div className="skeleton h-[200px] rounded-card" />;
  if (rows.length === 0)
    return (
      <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-gray-400">
        <Check size={22} className="text-emerald-400" />
        <p className="text-xs">{t('money.commission.pendingOrders.cleared')}</p>
      </div>
    );

  return (
    <div className="max-h-[45vh] overflow-y-auto rounded-card border border-gray-100">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
          <tr>
            <th className="px-3 py-2 text-left">{t('money.commission.pendingOrders.columns.order')}</th>
            <th className="px-3 py-2 text-left">{t('money.commission.pendingOrders.columns.delivered')}</th>
            <th className="px-3 py-2 text-left">{t('money.commission.pendingOrders.columns.customer')}</th>
            <th className="px-3 py-2 text-right">{t('money.commission.pendingOrders.columns.commission')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-gray-50">
              <td className="px-3 py-2 font-semibold text-gray-900">{o.reference}</td>
              <td className="px-3 py-2 text-gray-500">{fmtDate(o.deliveredAt)}</td>
              <td className="px-3 py-2 text-gray-600">
                <div className="truncate">{o.customer.fullName}</div>
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                  <MapPin size={10} /> {o.customer.city}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-semibold text-amber-600">
                {fmtMAD(o.commissionAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Payment history ────────────────────────────────────────────────────────

function PaymentHistory({
  agentId,
  canManage,
  onChange,
}: {
  agentId: string;
  canManage: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CommissionPayment[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    moneyApi
      .listPaymentHistory(agentId)
      .then((r) => !cancelled && setRows(r))
      .catch((e) => !cancelled && setErr(apiErrorMessage(e, t('money.commission.history.loadFailed'))));
    return () => {
      cancelled = true;
    };
  }, [agentId, reload, t]);

  const handleDelete = async (id: string) => {
    if (!confirm(t('money.commission.history.reverseConfirm'))) return;
    try {
      await moneyApi.deletePayment(id);
      setReload((k) => k + 1);
      onChange();
    } catch (e) {
      setErr(apiErrorMessage(e, t('money.commission.history.reverseFailed')));
    }
  };

  if (err)
    return (
      <div className="rounded-card border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
        {err}
      </div>
    );
  if (!rows) return <div className="skeleton h-[200px] rounded-card" />;
  if (rows.length === 0)
    return (
      <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-gray-400">
        <History size={22} className="text-gray-300" />
        <p className="text-xs">{t('money.commission.history.empty')}</p>
      </div>
    );

  return (
    <>
    <div className="flex max-h-[45vh] flex-col gap-2 overflow-y-auto">
      {rows.map((p) => (
        <div key={p.id} className="rounded-card border border-gray-100 bg-white px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold text-emerald-700">{fmtMAD(p.amount)}</span>
                <span className="text-[11px] text-gray-400">{fmtDate(p.paidAt)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-gray-500">
                {t('money.commission.history.orders', { count: p.orderIds.length })}
                {p.recordedBy && ` · ${t('money.commission.history.by', { name: p.recordedBy.name })}`}
              </p>
              {p.notes && (
                <p className="mt-1 rounded-btn bg-gray-50 px-2 py-1 text-[11px] italic text-gray-600">
                  {p.notes}
                </p>
              )}
              {p.fileUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl(`${BASE_URL}${p.fileUrl}`)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <FileText size={11} /> {t('money.commission.history.proof')}
                </button>
              )}
            </div>
            {canManage && (
              <button
                onClick={() => handleDelete(p.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                aria-label={t('money.commission.history.reverseAria')}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
      <FilePreviewModal
        open={previewUrl !== null}
        onClose={() => setPreviewUrl(null)}
        url={previewUrl ?? ''}
        title={t('money.commission.history.proofPreviewTitle')}
      />
    </>
  );
}

// ─── Record payment modal ───────────────────────────────────────────────────

function RecordPaymentModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: AgentCommissionRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<AgentPendingOrder[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    moneyApi
      .listAgentPendingOrders(agent.agentId)
      .then((r) => {
        setOrders(r);
        setSelectedIds(new Set(r.map((o) => o.id)));
      })
      .catch((e) => setErr(apiErrorMessage(e, t('money.commission.recordModal.loadOrdersFailed'))));
  }, [agent.agentId, t]);

  const total = useMemo(() => {
    if (!orders) return 0;
    return orders
      .filter((o) => selectedIds.has(o.id))
      .reduce((s, o) => s + o.commissionAmount, 0);
  }, [orders, selectedIds]);

  const toggle = (id: string) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const handleUpload = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const res = await moneyApi.uploadCommissionFile(file);
      setFileUrl(res.url);
    } catch (e) {
      setErr(apiErrorMessage(e, t('money.commission.recordModal.uploadProofFailed')));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (total <= 0) return;
    setSaving(true);
    setErr(null);
    try {
      await moneyApi.recordPayment({
        agentId: agent.agentId,
        amount: Math.round(total * 100) / 100,
        orderIds: Array.from(selectedIds),
        notes: notes.trim() || null,
        fileUrl,
      });
      onSaved();
    } catch (e) {
      setErr(apiErrorMessage(e, t('money.commission.recordModal.recordFailed')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={onClose}
      title={t('money.commission.recordModal.title', { name: agent.name })}
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{t('money.commission.recordModal.amountToPay')}</p>
            <p className="text-lg font-bold text-emerald-700">{fmtMAD(total)}</p>
          </div>
          <div className="flex items-center gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </CRMButton>
            <CRMButton onClick={handleSubmit} loading={saving} disabled={total <= 0}>
              {t('money.commission.recordModal.confirmPayment')}
            </CRMButton>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {err && (
          <div className="rounded-card border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-800">{t('money.commission.recordModal.ordersToSettle')}</p>
            {orders && orders.length > 0 && (
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.size === orders.length ? new Set() : new Set(orders.map((o) => o.id)),
                  )
                }
              >
                {selectedIds.size === orders.length ? t('money.commission.recordModal.deselectAll') : t('money.commission.recordModal.selectAll')}
              </button>
            )}
          </div>
          {!orders ? (
            <div className="skeleton h-[180px] rounded-card" />
          ) : orders.length === 0 ? (
            <div className="rounded-card border border-gray-100 bg-gray-50 px-3 py-6 text-center text-xs text-gray-400">
              {t('money.commission.recordModal.nothingPending')}
            </div>
          ) : (
            <div className="max-h-[35vh] overflow-y-auto rounded-card border border-gray-100">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="w-8 px-3 py-2" />
                    <th className="px-3 py-2 text-left">{t('money.commission.recordModal.columns.order')}</th>
                    <th className="px-3 py-2 text-left">{t('money.commission.recordModal.columns.customer')}</th>
                    <th className="px-3 py-2 text-right">{t('money.commission.recordModal.columns.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const checked = selectedIds.has(o.id);
                    return (
                      <tr
                        key={o.id}
                        onClick={() => toggle(o.id)}
                        className={cn(
                          'cursor-pointer border-t border-gray-50 transition-colors',
                          checked ? 'bg-accent/50' : 'hover:bg-accent/20',
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggle(o.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                        </td>
                        <td className="px-3 py-2 font-semibold text-gray-900">{o.reference}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {o.customer.fullName} · {o.customer.city}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900">
                          {fmtMAD(o.commissionAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">{t('money.commission.recordModal.noteLabel')}</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('money.commission.recordModal.notePlaceholder')}
            className="w-full resize-none rounded-input border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">{t('money.commission.recordModal.proofLabel')}</span>
          {fileUrl ? (
            <div className="flex items-center justify-between rounded-card border border-gray-200 bg-gray-50 px-3 py-2">
              <a
                href={`${BASE_URL}${fileUrl}`}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-xs font-medium text-primary hover:underline"
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{fileUrl.split('/').pop()}</span>
              </a>
              <button
                onClick={() => setFileUrl(null)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                aria-label={t('money.commission.recordModal.removeProof')}
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex items-center justify-center gap-2 rounded-card border border-dashed border-gray-300 px-4 py-3 text-xs font-medium text-gray-500 transition-colors hover:border-primary hover:bg-accent/40 hover:text-primary',
                uploading && 'cursor-not-allowed opacity-60',
              )}
            >
              <Upload size={14} />
              {uploading ? t('money.commission.recordModal.uploading') : t('money.commission.recordModal.attachProof')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </GlassModal>
  );
}
