import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { AlertTriangle, Copy, UserRound, Package } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { cn } from '@/lib/cn';
import { ordersApi, type PendingSibling } from '@/services/ordersApi';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  keeperOrderId: string;
  keeperReference: string;
  keeperAgentName: string | null;
  siblings: PendingSibling[];
  onMerged: () => void;   // fired after successful merge (caller re-opens confirm popup)
  onSkip: () => void;     // user chose to proceed without merging
  onCancel: () => void;   // user closed the dialog entirely
}

export function DuplicateOrdersDialog({
  open,
  keeperOrderId,
  keeperReference,
  keeperAgentName,
  siblings,
  onMerged,
  onSkip,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(siblings.map((s) => s.id)));
    setError(null);
  }, [open, siblings]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selected.size === 0) {
      onSkip();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ordersApi.merge({
        keepOrderId: keeperOrderId,
        mergeOrderIds: Array.from(selected),
      });
      onMerged();
    } catch (e) {
      setError(apiErrorMessage(e, t('callCenter.duplicates.mergeFailed')));
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-5 shadow-2xl',
          'animate-in fade-in zoom-in-95 duration-150',
        )}
      >
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Copy size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-gray-900">
              {t('callCenter.duplicates.title')}
            </p>
            <p className="mt-0.5 text-[12px] text-gray-500">
              {t('callCenter.duplicates.intro', {
                count: siblings.length,
                reference: keeperReference,
              })}
            </p>
          </div>
        </div>

        <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-gray-50">
          {siblings.map((s) => {
            const mismatched = s.agentId && s.agent?.name !== keeperAgentName;
            return (
              <label
                key={s.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 border-b border-gray-100 p-2.5 last:border-b-0 transition',
                  selected.has(s.id) ? 'bg-white' : 'bg-gray-50 opacity-70',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={busy}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[12px] font-semibold text-gray-800">
                      {s.reference}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(s.createdAt).toLocaleDateString('fr-MA')}
                    </span>
                    <span className="ml-auto text-[12px] font-semibold text-gray-700">
                      {s.total.toLocaleString('fr-MA')} MAD
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                    <Package size={11} />
                    <span className="truncate">
                      {s.items.length > 2
                        ? t('callCenter.duplicates.itemsSummaryExtra', {
                            count: s.items.length,
                            products: s.items.slice(0, 2).map((it) => it.variant.product.name).join(', '),
                            extra: s.items.length - 2,
                          })
                        : t('callCenter.duplicates.itemsSummary', {
                            count: s.items.length,
                            products: s.items.map((it) => it.variant.product.name).join(', '),
                          })}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px]">
                    <UserRound size={11} className={mismatched ? 'text-amber-600' : 'text-gray-400'} />
                    <span className={mismatched ? 'font-semibold text-amber-700' : 'text-gray-500'}>
                      {s.agent?.name ?? t('callCenter.duplicates.unassigned')}
                    </span>
                    {mismatched && (
                      <span className="rounded-badge bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
                        {t('callCenter.duplicates.willBeReassigned')}
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-btn bg-blue-50 px-2.5 py-1.5 text-[11px] text-blue-700">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          <span>{t('callCenter.duplicates.mergedNote')}</span>
        </div>

        {error && (
          <div className="mt-2 flex items-start gap-1.5 rounded-btn bg-red-50 px-2 py-1.5 text-[11px] font-medium text-red-700">
            <AlertTriangle size={11} className="mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-2">
          <CRMButton variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </CRMButton>
          <div className="flex items-center gap-2">
            <CRMButton variant="secondary" size="sm" onClick={onSkip} disabled={busy}>
              {t('callCenter.duplicates.skipContinue')}
            </CRMButton>
            <CRMButton
              variant="primary"
              size="sm"
              onClick={handleMerge}
              loading={busy}
              disabled={selected.size === 0}
            >
              {t('callCenter.duplicates.mergeContinue', { count: selected.size })}
            </CRMButton>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
