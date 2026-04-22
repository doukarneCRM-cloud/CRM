import { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, RotateCcw, X } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  automationApi,
  type AutomationTrigger,
  type LogsQuery,
  type MessageLogRow,
  type MessageLogStatus,
} from '@/services/automationApi';

const TRIGGER_OPTS: { value: AutomationTrigger | ''; label: string }[] = [
  { value: '', label: 'All triggers' },
  { value: 'confirmation_confirmed', label: 'Order confirmed' },
  { value: 'confirmation_cancelled', label: 'Order cancelled' },
  { value: 'confirmation_unreachable', label: 'Client unreachable' },
  { value: 'shipping_picked_up', label: 'Picked up' },
  { value: 'shipping_in_transit', label: 'In transit' },
  { value: 'shipping_out_for_delivery', label: 'Out for delivery' },
  { value: 'shipping_delivered', label: 'Delivered' },
  { value: 'shipping_returned', label: 'Returned' },
  { value: 'shipping_return_validated', label: 'Return validated' },
  { value: 'commission_paid', label: 'Commission paid' },
];

const STATUS_OPTS: { value: MessageLogStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'sending', label: 'Sending' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Failed' },
];

const STATUS_STYLES: Record<MessageLogStatus, string> = {
  queued: 'bg-gray-100 text-gray-600',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-indigo-100 text-indigo-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const PAGE_SIZE = 50;

export function LogsTab() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.AUTOMATION_MANAGE);
  const pushToast = useToastStore((s) => s.push);

  const [rows, setRows] = useState<MessageLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [trigger, setTrigger] = useState<AutomationTrigger | ''>('');
  const [status, setStatus] = useState<MessageLogStatus | ''>('');
  const [detail, setDetail] = useState<MessageLogRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q: LogsQuery = { limit: PAGE_SIZE, offset };
      if (trigger) q.trigger = trigger;
      if (status) q.status = status;
      const res = await automationApi.listLogs(q);
      setRows(res.rows);
      setTotal(res.total);
    } finally {
      setLoading(false);
    }
  }, [offset, trigger, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (row: MessageLogRow) => {
    try {
      await automationApi.retryLog(row.id);
      pushToast({ kind: 'success', title: 'Re-enqueued' });
      await load();
    } catch {
      pushToast({ kind: 'error', title: 'Retry failed' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <GlassCard padding="md">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Trigger</p>
            <CRMSelect
              value={trigger}
              onChange={(v) => {
                setOffset(0);
                setTrigger((Array.isArray(v) ? v[0] : v) as AutomationTrigger | '');
              }}
              options={TRIGGER_OPTS}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-gray-400">Status</p>
            <CRMSelect
              value={status}
              onChange={(v) => {
                setOffset(0);
                setStatus((Array.isArray(v) ? v[0] : v) as MessageLogStatus | '');
              }}
              options={STATUS_OPTS}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {total} message{total === 1 ? '' : 's'}
            </span>
            <CRMButton
              size="sm"
              variant="ghost"
              leftIcon={<RefreshCcw size={13} />}
              onClick={() => void load()}
            >
              Refresh
            </CRMButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="none" className="overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Trigger</th>
                <th className="px-3 py-2 text-left">Recipient</th>
                <th className="px-3 py-2 text-left">Order</th>
                <th className="px-3 py-2 text-left">Agent</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-xs text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-12 text-center text-xs text-gray-400">
                    No messages yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setDetail(r)}
                    className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-accent/40"
                  >
                    <td className="px-3 py-2 text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">{r.trigger}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">
                      {r.recipientPhone}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">
                      {r.order?.reference ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-700">{r.agent?.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-badge px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[r.status]}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.status === 'failed' && canManage && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void retry(r);
                          }}
                          className="inline-flex items-center gap-1 rounded-btn border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:border-primary hover:text-primary"
                        >
                          <RotateCcw size={11} /> Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
            <span>
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-2">
              <CRMButton
                size="sm"
                variant="ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                Prev
              </CRMButton>
              <CRMButton
                size="sm"
                variant="ghost"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next
              </CRMButton>
            </div>
          </div>
        )}
      </GlassCard>

      <GlassModal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Message detail"
        size="xl"
      >
        {detail && (
          <div className="flex flex-col gap-3 text-sm">
            <DetailRow label="Trigger" value={detail.trigger} />
            <DetailRow label="Recipient" value={detail.recipientPhone} mono />
            <DetailRow label="Order" value={detail.order?.reference ?? '—'} />
            <DetailRow label="Agent" value={detail.agent?.name ?? '—'} />
            <DetailRow
              label="Status"
              value={
                <span
                  className={`rounded-badge px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[detail.status]}`}
                >
                  {detail.status}
                </span>
              }
            />
            <DetailRow
              label="Created"
              value={new Date(detail.createdAt).toLocaleString()}
            />
            {detail.sentAt && (
              <DetailRow
                label="Sent"
                value={new Date(detail.sentAt).toLocaleString()}
              />
            )}
            {detail.providerId && <DetailRow label="Provider id" value={detail.providerId} mono />}
            {detail.error && (
              <div className="rounded-btn bg-red-50 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                  Error
                </p>
                <p className="whitespace-pre-wrap text-xs text-red-700">{detail.error}</p>
              </div>
            )}
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                Body
              </p>
              <p className="whitespace-pre-wrap rounded-btn border border-gray-200 bg-white p-3 text-sm text-gray-700">
                {detail.body}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <CRMButton size="sm" variant="ghost" leftIcon={<X size={13} />} onClick={() => setDetail(null)}>
                Close
              </CRMButton>
              {detail.status === 'failed' && canManage && (
                <CRMButton
                  size="sm"
                  leftIcon={<RotateCcw size={13} />}
                  onClick={async () => {
                    await retry(detail);
                    setDetail(null);
                  }}
                >
                  Retry
                </CRMButton>
              )}
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-3">
      <span className="text-[11px] uppercase tracking-wide text-gray-400">{label}</span>
      <span className={mono ? 'font-mono text-sm text-gray-700' : 'text-sm text-gray-700'}>
        {value}
      </span>
    </div>
  );
}
