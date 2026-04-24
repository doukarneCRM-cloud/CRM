import { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  SkipForward,
  Package,
  MapPin,
  Phone,
  Hash,
} from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { returnsApi, type ReturnOrder, type VerifyOutcome } from '@/services/returnsApi';

interface Props {
  order: ReturnOrder;
  onClose: () => void;
  onVerified: () => void;
}

/**
 * Physical-return verification modal. The three big action buttons at the
 * bottom (Done / Damaged / Skip) are the whole interaction — click-to-submit,
 * no radio-then-confirm two-step. "Skip" closes without saving so the agent
 * can defer a tricky package to a supervisor. Product photos are shown
 * prominently because matching the image against the parcel is the core
 * physical check.
 */
export function VerifyModal({ order, onClose, onVerified }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<VerifyOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const isVerified =
    order.shippingStatus === 'return_validated' || order.shippingStatus === 'return_refused';
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);

  const submit = async (outcome: VerifyOutcome) => {
    if (saving) return;
    setSaving(outcome);
    setErr(null);
    try {
      await returnsApi.verify(order.id, { outcome, note: note.trim() || null });
      onVerified();
    } catch (e) {
      setErr(apiErrorMessage(e, 'Failed to verify'));
      setSaving(null);
    }
  };

  return (
    <GlassModal open onClose={onClose} title={`Verify ${order.reference}`} size="xl">
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
        </div>

        {/* Items with photos — this is the main visual check */}
        <div>
          <p className="mb-2 text-[10px] uppercase tracking-wide text-gray-400">
            {totalItems} item{totalItems !== 1 && 's'} — match each against the parcel
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {order.items.map((it) => {
              const variantLabel = [it.variant.color, it.variant.size].filter(Boolean).join(' · ');
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-3 rounded-card border border-gray-200 bg-white px-3 py-2.5"
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-btn bg-gray-100">
                    {it.variant.product.imageUrl ? (
                      <img
                        src={it.variant.product.imageUrl}
                        alt={it.variant.product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <Package size={22} />
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 rounded-full bg-gray-900/80 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      ×{it.quantity}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {it.variant.product.name}
                    </p>
                    <p className="truncate text-[11px] text-gray-500">
                      {variantLabel || 'Default variant'}
                    </p>
                    <p className="truncate font-mono text-[10px] text-gray-400">
                      SKU {it.variant.sku}
                    </p>
                  </div>
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

            {/* 3 big action buttons — single click to submit */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ActionButton
                label="Done"
                hint="Good — restock"
                Icon={CheckCircle2}
                tone="good"
                loading={saving === 'good'}
                disabled={saving !== null}
                onClick={() => submit('good')}
              />
              <ActionButton
                label="Damaged"
                hint="Refuse — don't restock"
                Icon={AlertTriangle}
                tone="bad"
                loading={saving === 'damaged'}
                disabled={saving !== null}
                onClick={() => submit('damaged')}
              />
              <ActionButton
                label="Skip"
                hint="Decide later"
                Icon={SkipForward}
                tone="skip"
                loading={false}
                disabled={saving !== null}
                onClick={onClose}
              />
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}

type Tone = 'good' | 'bad' | 'skip';

interface ActionButtonProps {
  label: string;
  hint: string;
  Icon: typeof CheckCircle2;
  tone: Tone;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ActionButton({ label, hint, Icon, tone, loading, disabled, onClick }: ActionButtonProps) {
  const classes: Record<Tone, string> = {
    good: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-400 active:bg-emerald-200',
    bad: 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 hover:border-rose-400 active:bg-rose-200',
    skip: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-24 flex-col items-center justify-center gap-1 rounded-card border-2 font-bold transition-all disabled:cursor-not-allowed disabled:opacity-60',
        classes[tone],
      )}
    >
      <Icon size={28} strokeWidth={2.2} className={loading ? 'animate-pulse' : ''} />
      <span className="text-base leading-none">{loading ? 'Saving…' : label}</span>
      <span className="text-[11px] font-normal opacity-70">{hint}</span>
    </button>
  );
}
