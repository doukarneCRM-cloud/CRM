import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Search, UserCheck, AlertTriangle } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { supportApi } from '@/services/ordersApi';
import { ordersApi } from '@/services/ordersApi';
import type { AgentOption } from '@/types/orders';
import { cn } from '@/lib/cn';

export interface AssignOrderSummary {
  id: string;
  reference: string;
  agentName: string | null;
}

interface AgentPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, assigns a single order. */
  orderId?: string;
  /** If provided, bulk-assigns multiple orders. */
  orderIds?: string[];
  /** For bulk mode: per-order metadata so we can split unassigned vs already-assigned. */
  orderSummaries?: AssignOrderSummary[];
  onSuccess?: () => void;
}

type Step = 'pick' | 'confirm-reassign';

export function AgentPickerModal({
  open,
  onClose,
  orderId,
  orderIds,
  orderSummaries,
  onSuccess,
}: AgentPickerModalProps) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [reassignChecked, setReassignChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supportApi.agents()
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelected(null);
      setStep('pick');
      setReassignChecked({});
    }
  }, [open]);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.label.toLowerCase().includes(search.toLowerCase()),
  );

  // Split selected orders into unassigned vs already-assigned.
  // Falls back to treating everything as unassigned when summaries aren't provided
  // (e.g. single-order flow).
  const { unassignedIds, alreadyAssigned } = useMemo(() => {
    if (!orderSummaries || orderSummaries.length === 0) {
      return {
        unassignedIds: orderIds ?? (orderId ? [orderId] : []),
        alreadyAssigned: [] as AssignOrderSummary[],
      };
    }
    const unassignedIds: string[] = [];
    const alreadyAssigned: AssignOrderSummary[] = [];
    for (const o of orderSummaries) {
      if (o.agentName) alreadyAssigned.push(o);
      else unassignedIds.push(o.id);
    }
    return { unassignedIds, alreadyAssigned };
  }, [orderSummaries, orderIds, orderId]);

  const selectedAgent = agents.find((a) => a.id === selected) ?? null;

  const performAssign = async (ids: string[]) => {
    if (!selected || ids.length === 0) return;
    setSubmitting(true);
    try {
      if (orderId && !orderIds) {
        await ordersApi.assign(orderId, selected);
      } else {
        await ordersApi.bulk({ orderIds: ids, action: 'assign', agentId: selected });
      }
      onSuccess?.();
      onClose();
    } catch {
      // ignore — global error handler
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignClick = () => {
    if (!selected) return;
    // If any selected orders are already assigned, move to the confirmation step
    // so the user can pick which ones to reassign.
    if (alreadyAssigned.length > 0) {
      const initial: Record<string, boolean> = {};
      for (const o of alreadyAssigned) initial[o.id] = false;
      setReassignChecked(initial);
      setStep('confirm-reassign');
      return;
    }
    void performAssign(unassignedIds);
  };

  const handleConfirmReassign = () => {
    const chosenReassign = alreadyAssigned
      .filter((o) => reassignChecked[o.id])
      .map((o) => o.id);
    void performAssign([...unassignedIds, ...chosenReassign]);
  };

  const toggleAllReassign = (value: boolean) => {
    const next: Record<string, boolean> = {};
    for (const o of alreadyAssigned) next[o.id] = value;
    setReassignChecked(next);
  };

  const count = orderIds?.length ?? (orderId ? 1 : 0);
  const reassignSelectedCount = alreadyAssigned.filter((o) => reassignChecked[o.id]).length;
  const totalToAssign = unassignedIds.length + reassignSelectedCount;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={
        step === 'confirm-reassign'
          ? t('orders.agentPicker.confirmReassign')
          : count > 1
            ? t('orders.agentPicker.titleBulk', { count })
            : t('orders.agentPicker.titleSingle')
      }
      size="sm"
    >
      {step === 'pick' && (
        <>
          {/* Search */}
          <div className="mb-3 flex items-center gap-2 rounded-input border border-gray-200 bg-gray-50 px-3 py-2">
            <Search size={14} className="shrink-0 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('orders.agentPicker.searchPlaceholder')}
              className="w-full bg-transparent text-sm text-gray-700 outline-none placeholder-gray-400"
            />
          </div>

          {/* Agent list */}
          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
            {loading ? (
              <div className="flex flex-col gap-1 p-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex flex-col gap-1">
                      <div className="skeleton h-3 w-24 rounded" />
                      <div className="skeleton h-2.5 w-16 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">{t('orders.agentPicker.noAgentsFound')}</div>
            ) : (
              <ul>
                {filtered.map((agent) => (
                  <li key={agent.id}>
                    <button
                      onClick={() => setSelected(agent.id === selected ? null : agent.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        'first:rounded-t-xl last:rounded-b-xl',
                        selected === agent.id
                          ? 'bg-accent/70'
                          : 'hover:bg-gray-50',
                      )}
                    >
                      <AvatarChip name={agent.name} subtitle={agent.role.label} size="sm" />
                      {selected === agent.id && (
                        <UserCheck size={14} className="ml-auto shrink-0 text-primary" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Bulk split hint */}
          {alreadyAssigned.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p>
                {unassignedIds.length > 0 ? (
                  <Trans
                    i18nKey="orders.agentPicker.splitHintMixed"
                    values={{ unassigned: unassignedIds.length, alreadyAssigned: alreadyAssigned.length }}
                    components={{ b: <b /> }}
                  />
                ) : (
                  <Trans
                    i18nKey="orders.agentPicker.splitHintAllAssigned"
                    values={{ count: alreadyAssigned.length }}
                    components={{ b: <b /> }}
                  />
                )}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <CRMButton variant="secondary" className="flex-1" onClick={onClose}>
              {t('common.cancel')}
            </CRMButton>
            <CRMButton
              variant="primary"
              className="flex-1"
              disabled={!selected || (unassignedIds.length === 0 && alreadyAssigned.length === 0)}
              loading={submitting}
              onClick={handleAssignClick}
            >
              {alreadyAssigned.length > 0 ? t('orders.agentPicker.next') : t('orders.agentPicker.assign')}
            </CRMButton>
          </div>
        </>
      )}

      {step === 'confirm-reassign' && (
        <>
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
            {unassignedIds.length > 0 && (
              <p className="mb-1">
                <Trans
                  i18nKey="orders.agentPicker.reassignUnassignedLine"
                  values={{
                    count: unassignedIds.length,
                    agent: selectedAgent?.name ?? t('orders.agentPicker.theSelectedAgent'),
                  }}
                  components={{ b: <b /> }}
                />
              </p>
            )}
            <p>
              <Trans
                i18nKey="orders.agentPicker.reassignTickHint"
                values={{ count: alreadyAssigned.length }}
                components={{ b: <b /> }}
              />
            </p>
          </div>

          <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-gray-500">
            <span>{t('orders.agentPicker.alreadyAssigned')}</span>
            <div className="flex gap-3">
              <button
                className="text-primary hover:underline"
                onClick={() => toggleAllReassign(true)}
              >
                {t('orders.agentPicker.selectAll')}
              </button>
              <button
                className="text-gray-500 hover:underline"
                onClick={() => toggleAllReassign(false)}
              >
                {t('orders.agentPicker.clear')}
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-100">
            <ul>
              {alreadyAssigned.map((o) => (
                <li key={o.id}>
                  <label
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50',
                      'first:rounded-t-xl last:rounded-b-xl cursor-pointer',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={!!reassignChecked[o.id]}
                      onChange={(e) =>
                        setReassignChecked((prev) => ({ ...prev, [o.id]: e.target.checked }))
                      }
                      className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">#{o.reference}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        <Trans
                          i18nKey="orders.agentPicker.currentlyAssignedTo"
                          values={{ agent: o.agentName ?? '' }}
                          components={{ b: <b /> }}
                        />
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4 flex gap-2">
            <CRMButton variant="secondary" className="flex-1" onClick={() => setStep('pick')}>
              {t('common.back')}
            </CRMButton>
            <CRMButton
              variant="primary"
              className="flex-1"
              loading={submitting}
              disabled={totalToAssign === 0}
              onClick={handleConfirmReassign}
            >
              {t('orders.agentPicker.assignCount', { count: totalToAssign })}
            </CRMButton>
          </div>
        </>
      )}
    </GlassModal>
  );
}
