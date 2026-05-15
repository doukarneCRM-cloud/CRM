import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, X } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import {
  moneyApi,
  type AgentPendingOrder,
  type PaymentMethod,
} from '@/services/moneyApi';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

function fmtMAD(n: number): string {
  return `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} MAD`;
}

/**
 * Shared record-payment modal — used by the Money › Commission tab AND
 * by the Team › Agents page so both surfaces speak the same payment
 * UX (Pay first N quick-picker, payment method pills, per-row
 * checkboxes, proof upload). Accepts a minimal agent shape so callers
 * don't have to reshape their data into the full AgentCommissionRow.
 */
export interface PayAgent {
  agentId: string;
  name: string;
}

export function RecordPaymentModal({
  agent,
  onClose,
  onSaved,
}: {
  agent: PayAgent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<AgentPendingOrder[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('cash');
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
        method,
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
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              {t('money.commission.recordModal.amountToPay')}
            </p>
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800">
              {t('money.commission.recordModal.ordersToSettle')}
            </p>
            {orders && orders.length > 0 && (
              <div className="flex items-center gap-3">
                <PayFirstNPicker
                  maxCount={orders.length}
                  selectedCount={selectedIds.size}
                  onApply={(n) => {
                    if (!orders) return;
                    setSelectedIds(new Set(orders.slice(0, n).map((o) => o.id)));
                  }}
                />
                <button
                  type="button"
                  className="text-[11px] font-semibold text-primary hover:underline"
                  onClick={() =>
                    setSelectedIds(
                      selectedIds.size === orders.length
                        ? new Set()
                        : new Set(orders.map((o) => o.id)),
                    )
                  }
                >
                  {selectedIds.size === orders.length
                    ? t('money.commission.recordModal.deselectAll')
                    : t('money.commission.recordModal.selectAll')}
                </button>
              </div>
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
                    <th className="px-3 py-2 text-left">
                      {t('money.commission.recordModal.columns.order')}
                    </th>
                    <th className="px-3 py-2 text-left">
                      {t('money.commission.recordModal.columns.customer')}
                    </th>
                    <th className="px-3 py-2 text-right">
                      {t('money.commission.recordModal.columns.amount')}
                    </th>
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
          <label className="text-sm font-medium text-gray-700">
            {t('money.commission.recordModal.methodLabel')}
          </label>
          <div className="flex flex-wrap gap-1">
            {(['cash', 'bank_transfer', 'card', 'other'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'rounded-btn border px-3 py-1.5 text-xs font-semibold transition-colors',
                  method === m
                    ? 'border-primary bg-primary text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-primary/40 hover:text-primary',
                )}
              >
                {t(`money.commission.recordModal.method.${m}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            {t('money.commission.recordModal.noteLabel')}
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder={t('money.commission.recordModal.notePlaceholder')}
            className="w-full resize-none rounded-input border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">
            {t('money.commission.recordModal.proofLabel')}
          </span>
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
              {uploading
                ? t('money.commission.recordModal.uploading')
                : t('money.commission.recordModal.attachProof')}
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

// Inline quick-pick for the "pay first N orders" UX — the agent's
// pending list is ordered oldest-first, so typing 10 + Apply selects
// exactly the 10 oldest unpaid orders. Saves the operator from
// individually unchecking 20 boxes when they only want to settle part
// of the agent's tab.
function PayFirstNPicker({
  maxCount,
  selectedCount,
  onApply,
}: {
  maxCount: number;
  selectedCount: number;
  onApply: (n: number) => void;
}) {
  const { t } = useTranslation();
  const [val, setVal] = useState<string>('');

  const apply = () => {
    const n = Math.max(0, Math.min(maxCount, Math.floor(Number(val) || 0)));
    if (n > 0) onApply(n);
  };

  return (
    <div className="flex items-center gap-1.5 rounded-btn border border-gray-200 bg-gray-50 px-2 py-1">
      <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {t('money.commission.recordModal.payFirstN')}
      </label>
      <input
        type="number"
        min={1}
        max={maxCount}
        step={1}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        placeholder={String(maxCount)}
        className="w-14 rounded-btn border border-gray-200 bg-white px-1.5 py-0.5 text-center text-xs text-gray-900 focus:border-primary focus:outline-none"
      />
      <button
        type="button"
        onClick={apply}
        disabled={!val || Number(val) <= 0}
        className="rounded-btn bg-primary px-2 py-0.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t('money.commission.recordModal.apply')}
      </button>
      <span className="text-[10px] text-gray-400">
        {t('money.commission.recordModal.payFirstNHint', {
          selected: selectedCount,
          total: maxCount,
        })}
      </span>
    </div>
  );
}
