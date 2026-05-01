import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, RefreshCw, Webhook, Zap, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { coliixApi, type AccountHealth } from '@/services/coliixApi';
import { getSocket } from '@/services/socket';

// Buckets for "last seen" timestamps. The eye reads at-a-glance: green
// = recent activity, amber = stale, red = nothing in the rolling window.
const FRESH_MS = 5 * 60_000; // 5 min
const STALE_MS = 24 * 60 * 60_000; // 24h

function freshnessTone(iso: string | null): 'green' | 'amber' | 'red' | 'gray' {
  if (!iso) return 'gray';
  const age = Date.now() - new Date(iso).getTime();
  if (age < FRESH_MS) return 'green';
  if (age < STALE_MS) return 'amber';
  return 'red';
}

function fmtRelative(iso: string | null): string {
  if (!iso) return 'never';
  const age = Date.now() - new Date(iso).getTime();
  const min = Math.floor(age / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

const TONE_BG: Record<'green' | 'amber' | 'red' | 'gray', string> = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-500',
};

export function HealthStrip() {
  const [rows, setRows] = useState<AccountHealth[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setRows(await coliixApi.listHealth());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Surgical patches keyed off accountId. Both events now carry the
  // account they originated from, so we can bump just that hub's tile
  // without refetching the whole strip (or even hitting the network).
  // Falls back to a full refresh if the payload is missing the hint —
  // back-compat with older emits.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const onShipment = (payload: unknown) => {
      const accId = (payload as { accountId?: string })?.accountId;
      const source = (payload as { source?: string })?.source;
      if (!accId) {
        refresh();
        return;
      }
      const now = new Date().toISOString();
      setRows((prev) =>
        prev.map((r) =>
          r.accountId === accId
            ? {
                ...r,
                ...(source === 'webhook' ? { lastWebhookAt: now } : {}),
                ...(source === 'poll' ? { lastPollAt: now } : {}),
                // Even when source is unknown, bump whichever timestamp is
                // older so the tile lights up — this is a real signal.
                ...(!source
                  ? {
                      lastWebhookAt:
                        new Date(r.lastWebhookAt ?? 0).getTime() >
                        new Date(r.lastPollAt ?? 0).getTime()
                          ? r.lastWebhookAt
                          : now,
                    }
                  : {}),
              }
            : r,
        ),
      );
    };

    const onError = (payload: unknown) => {
      const accId = (payload as { accountId?: string })?.accountId;
      const message = (payload as { message?: string })?.message ?? null;
      if (!accId) return; // Errors without an account scope don't touch hub tiles.
      setRows((prev) =>
        prev.map((r) =>
          r.accountId === accId
            ? { ...r, lastError: message, errorCount24h: (r.errorCount24h ?? 0) + 1 }
            : r,
        ),
      );
    };

    socket.on('shipment:updated', onShipment);
    socket.on('coliix:error', onError);
    return () => {
      socket?.off('shipment:updated', onShipment);
      socket?.off('coliix:error', onError);
    };
  }, [refresh]);

  // Hide entirely when there's no hub yet — the empty state inside
  // SetupTab handles that case.
  if (!loading && rows.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {loading && rows.length === 0
        ? Array.from({ length: 1 }).map((_, i) => (
            <GlassCard key={i} className="p-3">
              <div className="skeleton h-16 w-full rounded" />
            </GlassCard>
          ))
        : rows.map((row) => <HealthCard key={row.accountId} row={row} onRefresh={refresh} />)}
    </div>
  );
}

function HealthCard({ row, onRefresh }: { row: AccountHealth; onRefresh: () => void }) {
  const { t } = useTranslation();
  const webhookTone = freshnessTone(row.lastWebhookAt);
  const pollTone = freshnessTone(row.lastPollAt);
  const errorTone =
    row.errorCount24h === 0 ? 'green' : row.errorCount24h < 5 ? 'amber' : 'red';
  const credentialOk = !row.lastError && row.lastHealthAt;
  const overallTone =
    row.lastError || webhookTone === 'red' || errorTone === 'red'
      ? 'red'
      : webhookTone === 'amber' || errorTone === 'amber'
        ? 'amber'
        : 'green';

  return (
    <GlassCard className="flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity
            size={14}
            className={
              overallTone === 'green'
                ? 'text-emerald-500'
                : overallTone === 'amber'
                  ? 'text-amber-500'
                  : 'text-red-500'
            }
          />
          <h4 className="text-sm font-bold text-gray-900">{row.hubLabel}</h4>
          {!row.isActive && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-500">
              {t('coliix.health.inactive')}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title={t('common.refresh') as string}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
        <Pill
          icon={<Webhook size={10} />}
          label={t('coliix.health.webhook')}
          value={fmtRelative(row.lastWebhookAt)}
          tone={webhookTone}
        />
        <Pill
          icon={<Zap size={10} />}
          label={t('coliix.health.poll')}
          value={fmtRelative(row.lastPollAt)}
          tone={pollTone}
        />
        <Pill
          icon={<AlertTriangle size={10} />}
          label={t('coliix.health.errors24h')}
          value={String(row.errorCount24h)}
          tone={errorTone}
        />
      </div>

      {row.lastError ? (
        <p className="rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
          ⚠ {row.lastError}
        </p>
      ) : credentialOk ? (
        <p className="flex items-center gap-1 text-[10px] text-emerald-600">
          <CheckCircle2 size={10} /> {t('coliix.health.credsOk')}
        </p>
      ) : (
        <p className="text-[10px] italic text-gray-400">
          {t('coliix.health.credsUntested')}
        </p>
      )}
    </GlassCard>
  );
}

function Pill({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'green' | 'amber' | 'red' | 'gray';
}) {
  return (
    <div className={`flex flex-col items-start gap-0.5 rounded px-1.5 py-1 ${TONE_BG[tone]}`}>
      <div className="flex items-center gap-1 font-semibold uppercase tracking-wide opacity-75">
        {icon}
        {label}
      </div>
      <div className="font-bold leading-tight">{value}</div>
    </div>
  );
}
