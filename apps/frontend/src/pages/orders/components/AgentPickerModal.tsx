import { useEffect, useState } from 'react';
import { Search, UserCheck } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { AvatarChip } from '@/components/ui/AvatarChip';
import { supportApi } from '@/services/ordersApi';
import { ordersApi } from '@/services/ordersApi';
import type { AgentOption } from '@/types/orders';
import { cn } from '@/lib/cn';

interface AgentPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, assigns a single order. */
  orderId?: string;
  /** If provided, bulk-assigns multiple orders. */
  orderIds?: string[];
  onSuccess?: () => void;
}

export function AgentPickerModal({
  open,
  onClose,
  orderId,
  orderIds,
  onSuccess,
}: AgentPickerModalProps) {
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
    }
  }, [open]);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.label.toLowerCase().includes(search.toLowerCase()),
  );

  const handleAssign = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      if (orderId) {
        await ordersApi.assign(orderId, selected);
      } else if (orderIds && orderIds.length > 0) {
        await ordersApi.bulk({ orderIds, action: 'assign', agentId: selected });
      }
      onSuccess?.();
      onClose();
    } catch {
      // ignore — global error handler
    } finally {
      setSubmitting(false);
    }
  };

  const count = orderIds?.length ?? (orderId ? 1 : 0);

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={`Assign Agent${count > 1 ? ` (${count} orders)` : ''}`}
      size="sm"
    >
      {/* Search */}
      <div className="mb-3 flex items-center gap-2 rounded-input border border-gray-200 bg-gray-50 px-3 py-2">
        <Search size={14} className="shrink-0 text-gray-400" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agent..."
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
          <div className="py-8 text-center text-sm text-gray-400">No agents found</div>
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

      {/* Actions */}
      <div className="mt-4 flex gap-2">
        <CRMButton variant="secondary" className="flex-1" onClick={onClose}>
          Cancel
        </CRMButton>
        <CRMButton
          variant="primary"
          className="flex-1"
          disabled={!selected}
          loading={submitting}
          onClick={handleAssign}
        >
          Assign
        </CRMButton>
      </div>
    </GlassModal>
  );
}
