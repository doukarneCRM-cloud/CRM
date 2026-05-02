import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  Filter as FilterIcon,
  RefreshCw,
  X,
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassCard } from '@/components/ui/GlassCard';
import {
  coliixApi,
  type ColiixIntegrationError,
  type ColiixErrorType,
} from '@/services/coliixApi';
import { useToastStore } from '@/store/toastStore';
import { getSocket } from '@/services/socket';

type ResolvedFilter = 'unresolved' | 'resolved' | 'all';

const TYPES: ColiixErrorType[] = [
  'webhook_invalid_secret',
  'webhook_invalid_payload',
  'webhook_unknown_tracking',
  'mapping_unknown_wording',
  'city_unknown',
  'api_credential_invalid',
  'api_timeout',
  'api_unknown',
];

// Color tone per error type. Auth + secret = red (security signal); the
// rest = amber (operational signal an admin needs to triage).
const TYPE_TONE: Record<ColiixErrorType, { bg: string; text: string; dot: string }> = {
  webhook_invalid_secret:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  api_credential_invalid:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
  webhook_invalid_payload:  { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  webhook_unknown_tracking: { bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-500' },
  mapping_unknown_wording:  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  city_unknown:             { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  api_timeout:              { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
  api_unknown:              { bg: 'bg-gray-100',   text: 'text-gray-700',   dot: 'bg-gray-500' },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-MA', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export function ErrorsTab() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [rows, setRows] = useState<ColiixIntegrationError[]>([]);
  const [total, setTotal] = useState(0);
  const [unresolvedTotal, setUnresolvedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [resolvedFilter, setResolvedFilter] = useState<ResolvedFilter>('unresolved');
  const [typeFilter, setTypeFilter] = useState<ColiixErrorType | 'all'>('all');
  const [drawerError, setDrawerError] = useState<ColiixIntegrationError | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await coliixApi.listErrors({
        type: typeFilter === 'all' ? undefined : typeFilter,
        resolved:
          resolvedFilter === 'all'
            ? undefined
            : resolvedFilter === 'resolved'
              ? true
              : false,
        page,
        pageSize: 25,
      });
      setRows(result.data);
      setTotal(result.pagination.total);
      setUnresolvedTotal(result.unresolvedTotal);
    } finally {
      setLoading(false);
    }
  }, [page, resolvedFilter, typeFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live tail — surgical prepend on `coliix:error`. The backend ships the
  // full row inline so we don't need a network round-trip; we just merge
  // it into the visible page when it matches current filters, and tick the
  // counters either way. Avoids the old "any error → full repaginated
  // refetch + scroll loss" behaviour.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const handler = (payload: unknown) => {
      const row = payload as ColiixIntegrationError | undefined;
      if (!row || typeof row.id !== 'string') return;

      // Counters always tick — even if the row doesn't match the current
      // filter, the totals reflect the underlying truth.
      setUnresolvedTotal((n) => (row.resolved ? n : n + 1));
      setTotal((n) => n + 1);

      // Surgical insert into the visible page only when it would have
      // matched the current filters AND we're on page 1 (otherwise it
      // would shove an off-page row to the top). Page-1 + matching =
      // honest live tail; anything else stays out of sight until the
      // user navigates to it.
      if (page !== 1) return;
      if (typeFilter !== 'all' && row.type !== typeFilter) return;
      if (resolvedFilter === 'resolved' && !row.resolved) return;
      if (resolvedFilter === 'unresolved' && row.resolved) return;

      setRows((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        // Keep the page size; drop the oldest tail row to make room.
        const next = [row, ...prev];
        return next.length > 25 ? next.slice(0, 25) : next;
      });
    };

    // Cross-admin: when another admin resolves an error, mirror that into
    // our local table + counter so every open Errors tab stays in sync
    // without a full refetch.
    const onResolved = (payload: unknown) => {
      const id = (payload as { id?: string })?.id;
      if (!id) return;
      const resolvedAt = new Date().toISOString();
      setRows((prev) => {
        if (resolvedFilter === 'unresolved') return prev.filter((r) => r.id !== id);
        return prev.map((r) => (r.id === id ? { ...r, resolved: true, resolvedAt } : r));
      });
      setUnresolvedTotal((n) => Math.max(0, n - 1));
    };

    socket.on('coliix:error', handler);
    socket.on('coliix:error:resolved', onResolved);
    return () => {
      socket?.off('coliix:error', handler);
      socket?.off('coliix:error:resolved', onResolved);
    };
  }, [page, resolvedFilter, typeFilter]);

  const resolve = async (id: string) => {
    try {
      await coliixApi.resolveError(id);
      toast({ kind: 'success', title: t('coliix.errors.resolved') });
      if (drawerError?.id === id) setDrawerError(null);

      // Patch the row in place + tick the counter. If the user is filtering
      // to "unresolved", the just-resolved row drops off the page; otherwise
      // it stays visible with the resolved badge. No full refetch.
      const resolvedAt = new Date().toISOString();
      setRows((prev) => {
        if (resolvedFilter === 'unresolved') {
          return prev.filter((r) => r.id !== id);
        }
        return prev.map((r) => (r.id === id ? { ...r, resolved: true, resolvedAt } : r));
      });
      setUnresolvedTotal((n) => Math.max(0, n - 1));
    } catch {
      toast({ kind: 'error', title: t('coliix.errors.resolveFail') });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('coliix.errors.title')}</h2>
          <p className="text-xs text-gray-500">{t('coliix.errors.subtitle')}</p>
        </div>
        <CRMButton
          variant="ghost"
          size="sm"
          leftIcon={<RefreshCw size={12} />}
          onClick={refresh}
          loading={loading}
        >
          {t('common.refresh')}
        </CRMButton>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label={t('coliix.errors.statTotal')} value={total} />
        <Stat
          label={t('coliix.errors.statUnresolved')}
          value={unresolvedTotal}
          tone={unresolvedTotal > 0 ? 'red' : 'green'}
        />
        <Stat
          label={t('coliix.errors.statResolved')}
          value={total - unresolvedTotal}
          tone="green"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-md bg-gray-100 p-0.5">
          {(['unresolved', 'all', 'resolved'] as const).map((f) => (
            <button
              key={f}
              onClick={() => {
                setResolvedFilter(f);
                setPage(1);
              }}
              className={`rounded px-3 py-1 text-xs font-semibold ${
                resolvedFilter === f
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t(`coliix.errors.scope.${f}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1.5">
          <FilterIcon size={12} className="text-gray-400" />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value as never);
              setPage(1);
            }}
            className="bg-transparent text-xs focus:outline-none"
          >
            <option value="all">{t('coliix.errors.filterAllTypes')}</option>
            {TYPES.map((tt) => (
              <option key={tt} value={tt}>
                {t(`coliix.errors.types.${tt}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="skeleton h-32 w-full rounded-md" />
      ) : rows.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-300" />
          <p className="text-sm font-semibold text-gray-700">
            {t('coliix.errors.empty')}
          </p>
          <p className="mt-1 text-xs italic text-gray-400">
            {t('coliix.errors.emptyHint')}
          </p>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('coliix.errors.colWhen')}</th>
                <th className="px-4 py-2 font-semibold">{t('coliix.errors.colType')}</th>
                <th className="px-4 py-2 font-semibold">{t('coliix.errors.colMessage')}</th>
                <th className="px-4 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <ErrorRow
                  key={r.id}
                  row={r}
                  onOpen={() => setDrawerError(r)}
                  onResolve={() => resolve(r.id)}
                />
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-[11px] text-gray-500">
              <span>
                {t('coliix.errors.pageInfo', { page, totalPages, total })}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                >
                  ←
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50 disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      )}

      {/* Drawer */}
      {drawerError && (
        <ErrorDrawer
          row={drawerError}
          onClose={() => setDrawerError(null)}
          onResolve={() => resolve(drawerError.id)}
        />
      )}
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

function ErrorRow({
  row,
  onOpen,
  onResolve,
}: {
  row: ColiixIntegrationError;
  onOpen: () => void;
  onResolve: () => void;
}) {
  const { t } = useTranslation();
  const tone = TYPE_TONE[row.type];

  return (
    <tr
      className={`cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50 ${
        row.resolved ? 'opacity-60' : ''
      }`}
      onClick={onOpen}
    >
      <td className="px-4 py-2 font-mono text-[11px] text-gray-500">
        {fmtDate(row.createdAt)}
      </td>
      <td className="px-4 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${tone.bg} ${tone.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
          {t(`coliix.errors.types.${row.type}`)}
        </span>
      </td>
      <td className="px-4 py-2">
        <p className="line-clamp-1 text-gray-700">{row.message}</p>
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          {row.resolved ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
              <CheckCircle2 size={11} /> {t('coliix.errors.resolved')}
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onResolve();
              }}
              className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              {t('coliix.errors.resolve')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Drawer ─────────────────────────────────────────────────────────────────

function ErrorDrawer({
  row,
  onClose,
  onResolve,
}: {
  row: ColiixIntegrationError;
  onClose: () => void;
  onResolve: () => void;
}) {
  const { t } = useTranslation();
  const tone = TYPE_TONE[row.type];

  // Pretty-print meta JSON. Truncate massive payloads so the drawer
  // doesn't render a 50 KB blob.
  const metaText = useMemo(() => {
    if (!row.meta) return '';
    try {
      const s = JSON.stringify(row.meta, null, 2);
      return s.length > 4000 ? `${s.slice(0, 4000)}\n…(truncated)` : s;
    } catch {
      return '(unable to stringify meta)';
    }
  }, [row.meta]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close drawer"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-gray-900">
              {t('coliix.errors.drawerTitle')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-4">
          <div>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
              {t(`coliix.errors.types.${row.type}`)}
            </span>
            {row.resolved && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                <CheckCircle2 size={12} /> {t('coliix.errors.resolved')}
              </span>
            )}
          </div>

          <DetailRow label={t('coliix.errors.colWhen')} value={fmtDate(row.createdAt)} />
          {row.resolved && row.resolvedAt && (
            <DetailRow label={t('coliix.errors.resolvedAt')} value={fmtDate(row.resolvedAt)} />
          )}

          <div>
            <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {t('coliix.errors.colMessage')}
            </h4>
            <p className="rounded bg-gray-50 p-3 text-xs text-gray-700">{row.message}</p>
          </div>

          {row.shipmentId && (
            <DetailRow label={t('coliix.errors.shipmentId')} value={row.shipmentId} mono />
          )}
          {row.orderId && (
            <DetailRow label={t('coliix.errors.orderId')} value={row.orderId} mono />
          )}
          {row.accountId && (
            <DetailRow label={t('coliix.errors.accountId')} value={row.accountId} mono />
          )}

          {metaText && (
            <div>
              <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                {t('coliix.errors.payload')}
              </h4>
              <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-[11px] text-emerald-300">
                {metaText}
              </pre>
            </div>
          )}
        </div>

        {!row.resolved && (
          <div className="border-t border-gray-100 px-4 py-3">
            <CRMButton variant="primary" size="sm" onClick={onResolve} className="w-full">
              {t('coliix.errors.resolve')}
            </CRMButton>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</h4>
      <p className={`text-xs text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

// ─── Stat card ──────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = 'gray',
}: {
  label: string;
  value: number;
  tone?: 'gray' | 'red' | 'green';
}) {
  // Soft pastel tile keyed to severity. Matches the dashboard tone palette
  // — gray = neutral count, red = unresolved alarm, green = resolved/OK.
  const styles = {
    gray:  'bg-gradient-to-br from-tone-lavender-50 to-white border-tone-lavender-100 text-tone-lavender-500',
    red:   'bg-gradient-to-br from-tone-rose-50 to-white border-tone-rose-100 text-tone-rose-500',
    green: 'bg-gradient-to-br from-tone-mint-50 to-white border-tone-mint-100 text-tone-mint-500',
  } as const;
  const valueColors = {
    gray:  'text-gray-900',
    red:   'text-tone-rose-500',
    green: 'text-tone-mint-500',
  } as const;
  return (
    <div className={`rounded-card border px-4 py-3 ${styles[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${valueColors[tone]}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
