import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { KPICard } from '@/components/ui/KPICard';
import { apiErrorMessage } from '@/lib/apiError';
import { cn } from '@/lib/cn';
import { returnsApi, type ReturnOrder } from '@/services/returnsApi';
import { ScannerModal } from './ScannerModal';
import { VerifyModal } from './VerifyModal';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [scope, setScope] = useState<Scope>(initialQ ? 'all' : 'pending');
  const [search, setSearch] = useState(initialQ);
  const [debounced, setDebounced] = useState(initialQ);
  const [orders, setOrders] = useState<ReturnOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [verifying, setVerifying] = useState<ReturnOrder | null>(null);

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
        setTotal(r.pagination.total);
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, 'Failed to load returns'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, debounced, reloadKey]);

  const handleScanResult = async (value: string) => {
    setScannerOpen(false);
    try {
      const order = await returnsApi.scan(value);
      setVerifying(order);
    } catch (e) {
      setError(apiErrorMessage(e, 'No order matches this scan'));
    }
  };

  const pendingCount = scope === 'pending' ? total : undefined;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Return Verification</h1>
          <p className="text-xs text-gray-400">
            Physically check orders the carrier bounced back. Restock saleable items.
          </p>
        </div>
        <CRMButton
          leftIcon={<ScanLine size={16} />}
          onClick={() => setScannerOpen(true)}
        >
          Scan QR
        </CRMButton>
      </div>

      {error && (
        <div className="rounded-card border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <KPICard
          title="Pending verification"
          value={(pendingCount ?? '—').toString()}
          icon={Clock}
          iconColor="#F59E0B"
        />
        <KPICard
          title="Showing"
          value={orders.length.toString()}
          icon={PackageSearch}
          iconColor="#6366F1"
        />
        <KPICard
          title="Total in scope"
          value={total.toString()}
          icon={Boxes}
          iconColor="#10B981"
        />
      </div>

      <GlassCard className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <CRMInput
            leftIcon={<Search size={14} />}
            placeholder="Search phone, name, city, reference, or tracking ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1 min-w-[240px]"
          />
          <div className="flex items-center gap-1 rounded-card border border-gray-100 bg-white p-1">
            {(
              [
                { id: 'pending' as Scope, label: 'Pending', icon: Clock },
                { id: 'verified' as Scope, label: 'Verified', icon: History },
                { id: 'all' as Scope, label: 'All', icon: Boxes },
              ]
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setScope(t.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-btn px-3 py-1.5 text-xs font-semibold transition-colors',
                    scope === t.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-gray-500 hover:bg-accent hover:text-primary',
                  )}
                >
                  <Icon size={12} />
                  {t.label}
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
                ? 'No orders match this search.'
                : scope === 'pending'
                  ? 'Nothing pending — all clear.'
                  : 'No verified returns yet.'}
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
            <Boxes size={10} /> {totalItems} item{totalItems !== 1 && 's'}
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
          Verify
        </CRMButton>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    returned: { label: 'Returned', cls: 'bg-amber-100 text-amber-700', Icon: Clock },
    attempted: { label: 'Attempted', cls: 'bg-amber-100 text-amber-700', Icon: Clock },
    lost: { label: 'Lost', cls: 'bg-rose-100 text-rose-700', Icon: AlertTriangle },
    return_validated: {
      label: 'Validated',
      cls: 'bg-emerald-100 text-emerald-700',
      Icon: CheckCircle2,
    },
    return_refused: {
      label: 'Refused',
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
