import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Truck, Settings, Clock } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { ordersApi } from '@/services/ordersApi';
import type { OrderLog } from '@/types/orders';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';

// ─── Log type config ──────────────────────────────────────────────────────────

const LOG_TYPE_CONFIG = {
  confirmation: {
    icon: CheckCircle2,
    color: 'text-green-600',
    bg: 'bg-green-50',
    lineBg: 'bg-green-200',
  },
  shipping: {
    icon: Truck,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    lineBg: 'bg-blue-200',
  },
  system: {
    icon: Settings,
    color: 'text-gray-500',
    bg: 'bg-gray-100',
    lineBg: 'bg-gray-200',
  },
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('fr-MA', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Log entry ────────────────────────────────────────────────────────────────

function LogEntry({ log, isLast }: { log: OrderLog; isLast: boolean }) {
  const config = LOG_TYPE_CONFIG[log.type] ?? LOG_TYPE_CONFIG.system;
  const Icon = config.icon;

  return (
    <div className="flex gap-3">
      {/* Timeline line + icon */}
      <div className="flex flex-col items-center">
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', config.bg)}>
          <Icon size={14} className={config.color} />
        </div>
        {!isLast && <div className={cn('mt-1 w-0.5 flex-1', config.lineBg)} />}
      </div>

      {/* Content */}
      <div className="mb-4 min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{log.action}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-400">
          <span>{log.performedBy}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatDateTime(log.createdAt)}
          </span>
        </div>
        {log.meta && 'note' in log.meta && (
          <p className="mt-1 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {log.meta.note as string}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type LogFilter = 'all' | 'confirmation' | 'shipping' | 'system';

interface OrderLogsModalProps {
  orderId: string | null;
  orderReference?: string;
  defaultFilter?: LogFilter;
  onClose: () => void;
}

export function OrderLogsModal({
  orderId,
  orderReference,
  defaultFilter = 'all',
  onClose,
}: OrderLogsModalProps) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  // Agents working from the call center (without orders:view) only see
  // confirmation + shipping tabs — the backend also filters system entries
  // out of their response, so this just avoids showing empty tabs.
  const canSeeAll = hasPermission(PERMISSIONS.ORDERS_VIEW);

  const [logs, setLogs] = useState<OrderLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<LogFilter>(
    canSeeAll ? defaultFilter : 'confirmation',
  );

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    ordersApi.getLogs(orderId)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  const filtered = useMemo(
    () => (activeFilter === 'all' ? logs : logs.filter((l) => l.type === activeFilter)),
    [logs, activeFilter],
  );

  const filters: { key: LogFilter; label: string; count: number }[] = canSeeAll
    ? [
        { key: 'all', label: 'All', count: logs.length },
        { key: 'confirmation', label: 'Confirmation', count: logs.filter((l) => l.type === 'confirmation').length },
        { key: 'shipping', label: 'Shipping', count: logs.filter((l) => l.type === 'shipping').length },
        { key: 'system', label: 'System', count: logs.filter((l) => l.type === 'system').length },
      ]
    : [
        { key: 'confirmation', label: 'Confirmation', count: logs.filter((l) => l.type === 'confirmation').length },
        { key: 'shipping', label: 'Shipping', count: logs.filter((l) => l.type === 'shipping').length },
      ];

  return (
    <GlassModal
      open={!!orderId}
      onClose={onClose}
      title={`Order History${orderReference ? ` — ${orderReference}` : ''}`}
      size="md"
    >
      {/* Filter tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-gray-100 p-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all',
              activeFilter === f.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {f.label}
            {f.count > 0 && (
              <span
                className={cn(
                  'rounded-badge px-1.5 py-0.5 text-[10px] font-bold',
                  activeFilter === f.key ? 'bg-primary/10 text-primary' : 'bg-gray-200 text-gray-500',
                )}
              >
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="max-h-96 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-8 w-8 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5 pt-1">
                  <div className="skeleton h-3 w-3/4 rounded" />
                  <div className="skeleton h-2.5 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-gray-400">
            <Clock size={32} className="text-gray-200" />
            <p className="text-sm">No history yet</p>
          </div>
        ) : (
          <div className="pt-1">
            {filtered.map((log, i) => (
              <LogEntry key={log.id} log={log} isLast={i === filtered.length - 1} />
            ))}
          </div>
        )}
      </div>
    </GlassModal>
  );
}
