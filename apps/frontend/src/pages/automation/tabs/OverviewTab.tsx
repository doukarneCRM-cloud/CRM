import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  RefreshCw,
  Smartphone,
  UserX,
  XCircle,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useToastStore } from '@/store/toastStore';
import { getSocket } from '@/services/socket';
import {
  automationApi,
  type AutomationTrigger,
  type MessageLogRow,
  type MessageLogStatus,
  type OverviewSnapshot,
  type OverviewSessionRow,
} from '@/services/automationApi';

function triggerLabel(t: TFunction, trigger: AutomationTrigger): string {
  return t(`automation.triggers.${trigger}`);
}

const STATUS_DOTS: Record<MessageLogStatus, string> = {
  queued: 'bg-gray-400',
  sending: 'bg-blue-500',
  sent: 'bg-green-500',
  delivered: 'bg-emerald-600',
  failed: 'bg-orange-500',
  dead: 'bg-red-600',
};

export function OverviewTab() {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [snapshot, setSnapshot] = useState<OverviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await automationApi.getOverview();
      setSnapshot(snap);
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: t('automation.overview.loadFailed') });
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
    const id = setInterval(load, 20_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onUpdate = (payload: Partial<MessageLogRow> & { id: string }) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const feed = prev.feed.map((row) =>
          row.id === payload.id ? { ...row, ...payload } : row,
        );
        return { ...prev, feed };
      });
    };
    // Rate-limit toast is owned by the global useOrderNotifications hook now
    // (fires on every page, not just here). We still need to refresh the
    // local feed so the affected message rows show their new "rate-limited"
    // status without waiting for the next polling tick.
    const onRateLimited = () => {
      void load();
    };
    socket.on('message_log:updated', onUpdate);
    socket.on('whatsapp:rate_limited', onRateLimited);
    return () => {
      socket.off('message_log:updated', onUpdate);
      socket.off('whatsapp:rate_limited', onRateLimited);
    };
  }, [load, pushToast, t]);

  const handleRequeue = async (id: string) => {
    setBusyId(id);
    try {
      await automationApi.requeueLog(id);
      pushToast({ kind: 'success', title: t('automation.overview.requeued') });
      await load();
    } catch (err) {
      console.error(err);
      pushToast({ kind: 'error', title: t('automation.overview.requeueFailed') });
    } finally {
      setBusyId(null);
    }
  };

  const maxTrigger = useMemo(
    () => Math.max(1, ...(snapshot?.topTriggers.map((tr) => tr.count) ?? [0])),
    [snapshot],
  );

  if (loading && !snapshot)
    return <div className="p-4 text-sm text-gray-500">{t('automation.overview.loading')}</div>;
  if (!snapshot) return null;

  const { sessions, queue, feed, topTriggers, optOuts7d } = snapshot;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Top KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <KpiCard icon={Activity} label={t('automation.overview.kpi.queued')} value={queue.queued} tone="gray" />
        <KpiCard icon={Clock} label={t('automation.overview.kpi.sending')} value={queue.sending} tone="blue" />
        <KpiCard icon={CheckCircle2} label={t('automation.overview.kpi.sent')} value={queue.sent + queue.delivered} tone="green" />
        <KpiCard icon={XCircle} label={t('automation.overview.kpi.failed')} value={queue.failed} tone="orange" />
        <KpiCard icon={AlertTriangle} label={t('automation.overview.kpi.dead')} value={queue.dead} tone="red" />
        <KpiCard icon={UserX} label={t('automation.overview.kpi.optOuts7d')} value={optOuts7d} tone="gray" />
      </div>

      {/* ── Session health + top triggers ────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <GlassCard className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Smartphone size={14} /> {t('automation.overview.sessionsHealth')}
            </h2>
            <button onClick={load} className="rounded-btn p-1 text-gray-500 hover:bg-gray-100">
              <RefreshCw size={12} />
            </button>
          </div>
          {sessions.length === 0 ? (
            <div className="text-sm text-gray-500">{t('automation.overview.noSessions')}</div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <SessionHealthRow key={s.id} session={s} />
              ))}
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
            <Gauge size={14} /> {t('automation.overview.topTriggers')}
          </h2>
          {topTriggers.length === 0 ? (
            <div className="text-sm text-gray-500">{t('automation.overview.noActivity')}</div>
          ) : (
            <div className="space-y-2">
              {topTriggers.map((tr) => (
                <div key={tr.trigger} className="flex items-center gap-2 text-xs">
                  <span className="w-28 shrink-0 truncate text-gray-600">{triggerLabel(t, tr.trigger)}</span>
                  <div className="flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-2 bg-primary"
                      style={{ width: `${(tr.count / maxTrigger) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right font-semibold text-gray-700">{tr.count}</span>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── Live feed ───────────────────────────────────────────────── */}
      <GlassCard>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
          <Activity size={14} /> {t('automation.overview.liveFeed')}
        </h2>
        {feed.length === 0 ? (
          <div className="text-sm text-gray-500">{t('automation.overview.noRecent')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-2">{t('automation.overview.columns.when')}</th>
                  <th className="px-2">{t('automation.overview.columns.trigger')}</th>
                  <th className="px-2">{t('automation.overview.columns.agent')}</th>
                  <th className="px-2">{t('automation.overview.columns.order')}</th>
                  <th className="px-2">{t('automation.overview.columns.to')}</th>
                  <th className="px-2">{t('automation.overview.columns.status')}</th>
                  <th className="px-2">{t('automation.overview.columns.error')}</th>
                  <th className="px-2"></th>
                </tr>
              </thead>
              <tbody>
                {feed.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 text-xs">
                    <td className="py-2 pr-2 text-gray-500">{formatTime(row.createdAt)}</td>
                    <td className="px-2">{triggerLabel(t, row.trigger)}</td>
                    <td className="px-2">{row.agent?.name ?? '—'}</td>
                    <td className="px-2 font-mono">{row.order?.reference ?? '—'}</td>
                    <td className="px-2 font-mono">{row.recipientPhone}</td>
                    <td className="px-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${STATUS_DOTS[row.status]}`} />
                        {t(`automation.status.${row.status}`)}
                      </span>
                    </td>
                    <td className="max-w-[180px] truncate px-2 text-red-600">{row.error ?? ''}</td>
                    <td className="px-2">
                      {(row.status === 'dead' || row.status === 'failed') && (
                        <CRMButton
                          size="sm"
                          variant="secondary"
                          disabled={busyId === row.id}
                          onClick={() => handleRequeue(row.id)}
                        >
                          <RefreshCw size={10} />
                          {t('automation.overview.requeue')}
                        </CRMButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

function SessionHealthRow({ session }: { session: OverviewSessionRow }) {
  const { t } = useTranslation();
  const hourlyPct = Math.min(100, (session.hourlyUsed / Math.max(1, session.hourlyLimit)) * 100);
  const dailyPct = Math.min(100, (session.dailyUsed / Math.max(1, session.dailyLimit)) * 100);
  const heartbeatAgeMin = session.lastHeartbeat
    ? Math.floor((Date.now() - new Date(session.lastHeartbeat).getTime()) / 60000)
    : null;
  const isStale = heartbeatAgeMin !== null && heartbeatAgeMin > 5;
  const dot =
    session.status === 'connected'
      ? 'bg-green-500'
      : session.status === 'connecting'
        ? 'bg-yellow-500'
        : session.status === 'error'
          ? 'bg-red-500'
          : 'bg-gray-400';

  return (
    <div className="rounded-btn border border-gray-100 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          <span className="text-sm font-semibold text-primary">{session.userName}</span>
          <span className="text-xs text-gray-500">{session.phoneNumber ?? '—'}</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600">
            {t('automation.overview.session.sent', { count: session.sentToday })}
          </span>
          <span className="text-red-600">
            {t('automation.overview.session.failed', { count: session.failedToday })}
          </span>
          {isStale && (
            <span className="flex items-center gap-1 text-orange-600">
              <AlertTriangle size={10} />{' '}
              {t('automation.overview.session.stale', { minutes: heartbeatAgeMin })}
            </span>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <UsageBar
          label={t('automation.overview.session.hourly')}
          used={session.hourlyUsed}
          limit={session.hourlyLimit}
          pct={hourlyPct}
        />
        <UsageBar
          label={t('automation.overview.session.daily')}
          used={session.dailyUsed}
          limit={session.dailyLimit}
          pct={dailyPct}
        />
      </div>
    </div>
  );
}

function UsageBar({ label, used, limit, pct }: { label: string; used: number; limit: number; pct: number }) {
  const color = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-orange-500' : 'bg-primary';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-gray-500">
        <span>{label}</span>
        <span>
          {used} / {limit}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'gray' | 'blue' | 'green' | 'orange' | 'red';
}) {
  const toneMap = {
    gray: 'text-gray-600 bg-gray-100',
    blue: 'text-blue-600 bg-blue-100',
    green: 'text-green-600 bg-green-100',
    orange: 'text-orange-600 bg-orange-100',
    red: 'text-red-600 bg-red-100',
  };
  return (
    <GlassCard padding="sm">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-btn ${toneMap[tone]}`}>
          <Icon size={14} />
        </div>
        <div>
          <div className="text-lg font-bold text-primary">{value}</div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
    </GlassCard>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
