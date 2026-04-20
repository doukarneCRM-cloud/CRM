import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Package,
  MapPin,
  Phone,
  Hash,
  AlertTriangle,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { returnsApi, type ReturnOrder, type VerifyOutcome } from '@/services/returnsApi';

interface Props {
  order: ReturnOrder;
  onClose: () => void;
  onVerified: () => void;
}

const OUTCOMES: Array<{
  id: VerifyOutcome;
  label: string;
  hint: string;
  Icon: typeof CheckCircle2;
  activeCls: string;
  idleCls: string;
}> = [
  {
    id: 'good',
    label: 'Received — good',
    hint: 'Restock the items so they can be re-shipped.',
    Icon: CheckCircle2,
    activeCls: 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200',
    idleCls: 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/50',
  },
  {
    id: 'damaged',
    label: 'Damaged',
    hint: 'Do not restock — package arrived broken.',
    Icon: AlertTriangle,
    activeCls: 'border-amber-400 bg-amber-50 ring-2 ring-amber-200',
    idleCls: 'border-gray-200 hover:border-amber-300 hover:bg-amber-50/50',
  },
  {
    id: 'wrong',
    label: 'Wrong / mismatched',
    hint: 'Not the items we shipped — investigate separately.',
    Icon: XCircle,
    activeCls: 'border-rose-400 bg-rose-50 ring-2 ring-rose-200',
    idleCls: 'border-gray-200 hover:border-rose-300 hover:bg-rose-50/50',
  },
];

export function VerifyModal({ order, onClose, onVerified }: Props) {
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isVerified =
    order.shippingStatus === 'return_validated' || order.shippingStatus === 'return_refused';
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);

  const handleConfirm = async () => {
    if (!outcome) return;
    setSaving(true);
    setErr(null);
    try {
      await returnsApi.verify(order.id, { outcome, note: note.trim() || null });
      onVerified();
    } catch (e) {
      setErr(apiErrorMessage(e, 'Failed to verify'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassModal
      open
      onClose={onClose}
      title={`Verify ${order.reference}`}
      size="xl"
      footer={
        !isVerified && (
          <div className="flex items-center justify-end gap-2">
            <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </CRMButton>
            <CRMButton
              onClick={handleConfirm}
              loading={saving}
              disabled={!outcome}
              variant={outcome === 'good' ? 'primary' : outcome ? 'danger' : 'primary'}
            >
              Confirm verification
            </CRMButton>
          </div>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {err && (
          <div className="rounded-card border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
            {err}
          </div>
        )}

        {/* Order summary */}
        <div className="rounded-card border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-gray-900">{order.customer.fullName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <Phone size={11} /> {order.customer.phoneDisplay}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin size={11} /> {order.customer.city}
                </span>
                {order.coliixTrackingId && (
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Hash size={11} /> {order.coliixTrackingId}
                  </span>
                )}
              </div>
              {order.customer.address && (
                <p className="mt-1 text-[11px] text-gray-500">{order.customer.address}</p>
              )}
            </div>
          </div>

          {/* Items */}
          <div className="mt-3 flex flex-col gap-1.5 border-t border-gray-200 pt-2.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">
              {totalItems} item{totalItems !== 1 && 's'} to verify
            </p>
            {order.items.map((it) => {
              const variantLabel = [it.variant.color, it.variant.size].filter(Boolean).join(' · ');
              return (
                <div
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-btn bg-white px-2.5 py-1.5 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Package size={12} className="shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-800">{it.variant.product.name}</p>
                      <p className="truncate text-[10px] text-gray-400">
                        {variantLabel || 'Default'} · SKU {it.variant.sku}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-badge bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
                    ×{it.quantity}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {isVerified ? (
          <div className="rounded-card border border-gray-100 bg-white px-3 py-3 text-sm">
            <p className="font-semibold text-gray-800">
              Already verified by {order.returnVerifiedBy?.name ?? 'unknown'}
            </p>
            {order.returnNote && (
              <p className="mt-1 rounded-btn bg-gray-50 px-2 py-1 text-xs italic text-gray-600">
                “{order.returnNote}”
              </p>
            )}
          </div>
        ) : (
          <>
            <div>
              <p className="mb-2 text-sm font-semibold text-gray-800">Outcome</p>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                {OUTCOMES.map((o) => {
                  const Icon = o.Icon;
                  const active = outcome === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setOutcome(o.id)}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-card border bg-white px-3 py-3 text-left transition-all',
                        active ? o.activeCls : o.idleCls,
                      )}
                    >
                      <Icon
                        size={18}
                        className={
                          o.id === 'good'
                            ? 'text-emerald-600'
                            : o.id === 'damaged'
                              ? 'text-amber-600'
                              : 'text-rose-600'
                        }
                      />
                      <p className="text-sm font-semibold text-gray-900">{o.label}</p>
                      <p className="text-[11px] text-gray-500">{o.hint}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Any detail worth keeping on the record"
                className="w-full resize-none rounded-input border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}
