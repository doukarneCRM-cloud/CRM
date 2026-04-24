import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, GitMerge, Loader2, Phone, User } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { ordersApi, type DuplicateGroup, type DuplicateOrder } from '@/services/ordersApi';
import { cn } from '@/lib/cn';

interface MergeDuplicatesModalProps {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}

function variantLabel(item: DuplicateOrder['items'][number]) {
  const parts = [item.variant.color, item.variant.size].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Default';
}

function itemsSummary(order: DuplicateOrder): string {
  return order.items
    .map((it) => `${it.variant.product.name} · ${variantLabel(it)} ×${it.quantity}`)
    .join(', ');
}

// ─── Group panel ─────────────────────────────────────────────────────────────

function GroupPanel({
  group,
  onMerged,
}: {
  group: DuplicateGroup;
  onMerged: () => void;
}) {
  const { t } = useTranslation();
  // Keeper defaults to the oldest order (already sorted asc by backend)
  const [keepId, setKeepId] = useState<string>(group.orders[0].id);
  const [mergeIds, setMergeIds] = useState<Set<string>>(
    new Set(group.orders.filter((o) => o.id !== group.orders[0].id).map((o) => o.id)),
  );
  const [merging, setMerging] = useState(false);

  const toggleMerge = useCallback((id: string) => {
    setMergeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setKeeper = useCallback((id: string) => {
    setKeepId(id);
    setMergeIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleMerge = async () => {
    if (group.needsReassignment) return;
    if (mergeIds.size === 0) return;
    setMerging(true);
    try {
      await ordersApi.merge({
        keepOrderId: keepId,
        mergeOrderIds: Array.from(mergeIds),
      });
      onMerged();
    } catch {
      // ignore — global handler
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="rounded-card border border-gray-100 bg-white p-4">
      {/* Customer header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <User size={14} className="shrink-0 text-primary" />
            <span className="truncate text-sm font-semibold text-gray-900">
              {group.customer.fullName}
            </span>
            <span className="rounded-badge bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
              {t('orders.merge.orderCount', { count: group.orders.length })}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1 font-mono">
              <Phone size={10} />
              {group.customer.phoneDisplay}
            </span>
            <span>{group.customer.city}</span>
          </div>
        </div>

        {group.needsReassignment && (
          <div className="flex items-center gap-1.5 rounded-badge bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            <AlertTriangle size={11} />
            {t('orders.merge.needsReassignment')}
          </div>
        )}
      </div>

      {/* Orders list */}
      <div className="flex flex-col gap-2">
        {group.orders.map((order) => {
          const isKeeper = order.id === keepId;
          const isMerge = mergeIds.has(order.id);
          return (
            <div
              key={order.id}
              className={cn(
                'grid grid-cols-[auto_auto_1fr_auto] items-start gap-3 rounded-xl border px-3 py-2 transition-colors',
                isKeeper && 'border-primary/40 bg-primary/5',
                isMerge && 'border-red-200 bg-red-50/50',
                !isKeeper && !isMerge && 'border-gray-100 bg-gray-50/40',
              )}
            >
              {/* Keeper radio */}
              <label className="flex items-center pt-1" title={t('orders.merge.keepThisOrder')}>
                <input
                  type="radio"
                  name={`keep-${group.customerId}`}
                  checked={isKeeper}
                  onChange={() => setKeeper(order.id)}
                  className="h-4 w-4 accent-primary"
                />
              </label>

              {/* Merge checkbox */}
              <label className="flex items-center pt-1" title={t('orders.merge.mergeIntoKeeper')}>
                <input
                  type="checkbox"
                  checked={isMerge}
                  disabled={isKeeper}
                  onChange={() => toggleMerge(order.id)}
                  className="h-4 w-4 rounded accent-red-500 disabled:opacity-30"
                />
              </label>

              {/* Details */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-gray-800">
                    {order.reference}
                  </span>
                  {isKeeper && (
                    <span className="rounded-badge bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      {t('orders.merge.keeper')}
                    </span>
                  )}
                  {isMerge && (
                    <span className="rounded-badge bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      {t('orders.merge.willMerge')}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-gray-500">
                  {itemsSummary(order)}
                </p>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {new Date(order.createdAt).toLocaleString('fr-MA', {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span className="mx-1.5 text-gray-300">·</span>
                  {order.agent ? (
                    <span className="font-medium text-gray-600">{order.agent.name}</span>
                  ) : (
                    <span className="font-medium text-orange-500">{t('orders.merge.unassigned')}</span>
                  )}
                </p>
              </div>

              {/* Total */}
              <div className="pt-1 text-right">
                <span className="text-sm font-bold text-gray-900">
                  {order.total.toLocaleString('fr-MA')}
                </span>
                <span className="ml-1 text-[10px] text-gray-400">MAD</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">
          {group.needsReassignment
            ? t('orders.merge.askReassignFirst')
            : t('orders.merge.combiningHint', { count: mergeIds.size })}
        </p>
        <CRMButton
          variant="primary"
          size="sm"
          leftIcon={<GitMerge size={13} />}
          disabled={group.needsReassignment || mergeIds.size === 0}
          loading={merging}
          onClick={handleMerge}
        >
          {mergeIds.size > 0
            ? t('orders.merge.mergeButtonCount', { count: mergeIds.size })
            : t('orders.merge.mergeButton')}
        </CRMButton>
      </div>
    </div>
  );
}

// ─── Main modal ──────────────────────────────────────────────────────────────

export function MergeDuplicatesModal({ open, onClose, onMerged }: MergeDuplicatesModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ordersApi.duplicates();
      setGroups(res.groups);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchGroups();
  }, [open, fetchGroups]);

  const handleAfterMerge = () => {
    onMerged();
    fetchGroups();
  };

  return (
    <GlassModal open={open} onClose={onClose} title={t('orders.merge.title')} size="xl">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-gray-400">
          <GitMerge size={32} className="text-gray-300" />
          <p className="text-sm">{t('orders.merge.noDuplicatesDetected')}</p>
          <p className="text-xs text-gray-400">
            {t('orders.merge.noDuplicatesHint')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 160px)' }}>
          <p className="text-xs text-gray-500">
            {t('orders.merge.intro')}
          </p>
          {groups.map((g) => (
            <GroupPanel key={g.customerId} group={g} onMerged={handleAfterMerge} />
          ))}
        </div>
      )}

      <div className="mt-5 flex justify-end border-t border-gray-100 pt-4">
        <CRMButton variant="secondary" onClick={onClose}>
          {t('common.close')}
        </CRMButton>
      </div>
    </GlassModal>
  );
}
