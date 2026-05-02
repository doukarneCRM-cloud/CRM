import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  PackageSearch,
  Search,
  ScanLine,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Phone,
  Hash,
  Clock,
  Boxes,
  History,
  Undo2,
  Smartphone,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { KPICard } from '@/components/ui/KPICard';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { returnsApi, type ReturnOrder, type ReturnStats } from '@/services/returnsApi';
import { getSocket } from '@/services/socket';
import { ScannerModal } from './ScannerModal';
import { VerifyModal } from './VerifyModal';
import { PairPhoneModal } from './PairPhoneModal';

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-MA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Scope = 'pending' | 'verified' | 'all';

export default function ReturnsPage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [scope, setScope] = useState<Scope>(initialQ ? 'all' : 'pending');
  const [search, setSearch] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [verifying, setVerifying] = useState<ReturnOrder | null>(null);
  const [stats, setStats] = useState<ReturnStats | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    if (searchParams.has('q')) {
      searchParams.delete('q');
      setSearchParams(searchParams, { replace: true });
    }
    // intentionally one-shot on mount — we don't want to keep stripping if the user re-types
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    returnsApi
      .list({ scope, search: debounced || undefined, pageSize: 50 })
      .then((r) => {
        if (cancelled) return;
        setOrders(r.data);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, t('returns.loadFailed')));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, debounced, reloadKey]);

  // Stats are global (no filter dependency) so we refresh only when a verify
  // completes — those are the only writes that move the numbers.
  useEffect(() => {
    let cancelled = false;
    returnsApi
      .stats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // Non-fatal; the rest of the page still works. Dashboard is authoritative.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Phone→laptop scan bridge + cross-user list sync.
  //
  // Phone→laptop: agent scans on their phone, backend pushes the resolved
  //   order to this user's room → auto-open VerifyModal.
  //
  // Cross-user: when any other agent verifies a return on their machine,
  //   the order's status flips → emitOrderUpdated fires `order:updated`.
  //   We bump reloadKey so this user's list + stats reflect the change
  //   without a manual refresh. Bumping is fine here (page is small).
  useEffect(() => {
    const socket = getSocket();
    const onScanned = (order: ReturnOrder) => {
      setError(null);
      setVerifying(order);
    };
    const onScanFailed = (payload: { code: string }) => {
      setError(t('returns.noMatchCode', { code: payload.code }));
    };
    const onOrderUpdated = () => {
      setReloadKey((k) => k + 1);
    };
    socket.on('return:scanned', onScanned);
    socket.on('return:scan_failed', onScanFailed);
    socket.on('order:updated', onOrderUpdated);
    return () => {
      socket.off('return:scanned', onScanned);
      socket.off('return:scan_failed', onScanFailed);
      socket.off('order:updated', onOrderUpdated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanResult = async (value: string) => {
    setScannerOpen(false);
    try {
      const order = await returnsApi.scan(value);
      setVerifying(order);
    } catch (e) {
      setError(apiErrorMessage(e, t('returns.scanFailed')));
    }
  };

  const formatPct = (r: number) => `${(r * 100).toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('returns.title')}</h1>
          <p className="text-xs text-gray-400">{t('returns.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <CRMButton
            variant="secondary"
            leftIcon={<Smartphone size={16} />}
            onClick={() => setPairOpen(true)}
          >
            {t('returns.pairPhone')}
          </CRMButton>
          <CRMButton
            leftIcon={<ScanLine size={16} />}
            onClick={() => setScannerOpen(true)}
          >
            {t('returns.scanQr')}
          </CRMButton>
        </div>
      </div>

      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPICard
          title={t('returns.kpi.returnRate')}
          value={stats ? formatPct(stats.returnRate) : '—'}
          subtitle={
            stats
              ? t('returns.kpi.returnRateSubtitle', {
                  returned: stats.returnedTotal,
                  delivered: stats.deliveredCount,
                })
              : t('returns.kpi.matchesDashboard')
          }
          icon={Undo2}
          tone="rose"
        />
        <KPICard
          title={t('returns.kpi.pending')}
          value={stats ? stats.pendingCount.toString() : '—'}
          subtitle={t('returns.kpi.pendingSubtitle')}
          icon={Clock}
          tone="amber"
        />
        <KPICard
          title={t('returns.kpi.verified')}
          value={stats ? stats.verifiedTotal.toString() : '—'}
          subtitle={stats ? t('returns.kpi.verifiedSubtitle', { rate: formatPct(stats.verifiedRate) }) : undefined}
          icon={CheckCircle2}
          tone="mint"
        />
      </div>

      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CRMInput
            leftIcon={<Search size={14} />}
            placeholder={t('returns.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1 min-w-[240px]"
          />
          <div className="flex items-center gap-1 rounded-card border border-gray-100 bg-white p-1">
            {(
              [
                { id: 'pending' as Scope, label: t('returns.scope.pending'), icon: Clock },
                { id: 'verified' as Scope, label: t('returns.scope.verified'), icon: History },
                { id: 'all' as Scope, label: t('returns.scope.all'), icon: Boxes },
              ]
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setScope(tab.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors',
                    scope === tab.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-500 hover:bg-accent hover:text-primary',
                  )}
                >
                  <Icon size={12} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-[140px] rounded-card" />
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center text-gray-400">
            <PackageSearch size={28} className="text-gray-300" />
            <p className="text-sm">
              {debounced
                ? t('returns.empty.search')
                : scope === 'pending'
                  ? t('returns.empty.pending')
                  : t('returns.empty.verified')}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {orders.map((o) => (
              <ReturnCard key={o.id} order={o} onVerify={() => setVerifying(o)} />
            ))}
          </div>
        )}
      </GlassCard>

      {scannerOpen && (
        <ScannerModal onClose={() => setScannerOpen(false)} onResult={handleScanResult} />
      )}

      {pairOpen && <PairPhoneModal onClose={() => setPairOpen(false)} />}

      {verifying && (
        <VerifyModal
          order={verifying}
          onClose={() => setVerifying(null)}
          onVerified={() => {
            setVerifying(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ─── Return card ────────────────────────────────────────────────────────────

function ReturnCard({ order, onVerify }: { order: ReturnOrder; onVerify: () => void }) {
  const { t } = useTranslation();
  const isVerified =
    order.shippingStatus === 'return_validated' || order.shippingStatus === 'return_refused';
  const isGood = order.shippingStatus === 'return_validated';
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-card border bg-white px-4 py-3 transition-all hover:shadow-md',
        isVerified
          ? isGood
            ? 'border-emerald-200'
            : 'border-rose-200'
          : 'border-amber-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{order.reference}</p>
          <p className="text-[11px] text-gray-400">{fmtDate(order.updatedAt)}</p>
        </div>
        <StatusPill status={order.shippingStatus} />
      </div>

      <div className="flex items-start gap-2 text-xs">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-800">{order.customer.fullName}</p>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <Phone size={10} /> {order.customer.phoneDisplay}
          </div>
          <div className="flex items-center gap-1 text-[11px] text-gray-500">
            <MapPin size={10} /> {order.customer.city}
          </div>
        </div>
        <div className="text-right text-[11px] text-gray-500">
          {order.coliixTrackingId && (
            <div className="inline-flex items-center gap-1 font-mono">
              <Hash size={10} /> {order.coliixTrackingId}
            </div>
          )}
          <div className="mt-0.5 inline-flex items-center gap-1">
            <Boxes size={10} /> {t('returns.card.itemCount', { count: totalItems })}
          </div>
        </div>
      </div>

      {order.returnNote && (
        <p className="rounded-btn bg-gray-50 px-2 py-1 text-[11px] italic text-gray-600">
          “{order.returnNote}”
        </p>
      )}

      {isVerified ? (
        <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-500">
          <span>{order.returnVerifiedBy?.name ?? '—'}</span>
          <span>{fmtDate(order.returnVerifiedAt)}</span>
        </div>
      ) : (
        <CRMButton size="sm" onClick={onVerify} leftIcon={<CheckCircle2 size={13} />}>
          {t('returns.card.verify')}
        </CRMButton>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    returned: { label: t('returns.status.returned'), cls: 'bg-amber-100 text-amber-700', Icon: Clock },
    attempted: { label: t('returns.status.attempted'), cls: 'bg-amber-100 text-amber-700', Icon: Clock },
    lost: { label: t('returns.status.lost'), cls: 'bg-rose-100 text-rose-700', Icon: AlertTriangle },
    return_validated: {
      label: t('returns.status.returnValidated'),
      cls: 'bg-emerald-100 text-emerald-700',
      Icon: CheckCircle2,
    },
    return_refused: {
      label: t('returns.status.returnRefused'),
      cls: 'bg-rose-100 text-rose-700',
      Icon: XCircle,
    },
  };
  const entry = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600', Icon: Clock };
  const Icon = entry.Icon;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-0.5 text-[10px] font-bold',
        entry.cls,
      )}
    >
      <Icon size={10} /> {entry.label}
    </span>
  );
}
