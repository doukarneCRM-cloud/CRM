import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Truck, Copy, RefreshCw } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { coliixApi, type ShipmentDetail } from '@/services/coliixApi';
import { getSocket } from '@/services/socket';
import { useToastStore } from '@/store/toastStore';
import { SHIPPING_STATUS_COLORS } from '@/constants/statusColors';

interface Props {
  orderId: string;
}

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('fr-MA', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Map ShipmentState (Coliix V2 enum) to our ShippingStatus dictionary so
// the badge uses the same palette as the rest of the CRM. pending +
// pushed are CRM-internal — render as not_shipped.
function statusKeyFor(state: string): keyof typeof SHIPPING_STATUS_COLORS {
  if (state === 'pending' || state === 'pushed') return 'not_shipped';
  if (state in SHIPPING_STATUS_COLORS) return state as keyof typeof SHIPPING_STATUS_COLORS;
  return 'not_shipped';
}

export function ShipmentTimeline({ orderId }: Props) {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [shipment, setShipment] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const detail = await coliixApi.getShipment(orderId);
      setShipment(detail);
    } catch {
      // 404 → no shipment yet — caller renders the "Mark as Shipped" CTA.
      setShipment(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Refetch on socket events that affect this shipment. Listening to
  // shipment:updated globally is acceptable — the payload contains
  // orderId so we ignore unrelated emits.
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const onUpdate = (payload: unknown) => {
        const p = payload as { orderId?: string };
        if (p?.orderId === orderId) refresh();
      };
      socket.on('shipment:updated', onUpdate);
      socket.on('order:updated', onUpdate);
      return () => {
        socket?.off('shipment:updated', onUpdate);
        socket?.off('order:updated', onUpdate);
      };
    } catch {
      // socket not ready — initial load already populated.
    }
  }, [orderId, refresh]);

  const copyTracking = async () => {
    if (!shipment) return;
    await navigator.clipboard.writeText(shipment.trackingCode);
    toast({ kind: 'success', title: t('coliix.timeline.copied') });
  };

  const onRefreshClick = () => {
    setRefreshing(true);
    refresh();
  };

  if (loading) {
    return <div className="skeleton h-32 w-full rounded-md" />;
  }

  if (!shipment) {
    return null; // caller renders the CTA
  }

  const cfg = SHIPPING_STATUS_COLORS[statusKeyFor(shipment.state)];

  return (
    <div className="flex flex-col gap-3 rounded-card border border-gray-100 bg-white p-3">
      {/* Header — tracking code + state pill */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-gray-400" />
          <code className="font-mono text-xs text-gray-700">{shipment.trackingCode}</code>
          <button
            onClick={copyTracking}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={t('common.copy') as string}
          >
            <Copy size={11} />
          </button>
          <span className="text-[10px] text-gray-400">· {shipment.account.hubLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
            {shipment.rawState && shipment.rawState !== cfg.label && (
              <span className="ml-1 text-[10px] opacity-70">· {shipment.rawState}</span>
            )}
          </span>
          <CRMButton
            variant="ghost"
            size="sm"
            leftIcon={<RefreshCw size={11} className={refreshing ? 'animate-spin' : ''} />}
            onClick={onRefreshClick}
            disabled={refreshing}
          >
            {t('common.refresh')}
          </CRMButton>
        </div>
      </div>

      {/* Events timeline */}
      {shipment.events.length === 0 ? (
        <p className="rounded bg-gray-50 px-3 py-3 text-center text-xs italic text-gray-400">
          {t('coliix.timeline.empty')}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {shipment.events.map((ev) => {
            const mapped = ev.mappedState ? statusKeyFor(ev.mappedState) : null;
            const evCfg = mapped ? SHIPPING_STATUS_COLORS[mapped] : null;
            return (
              <li key={ev.id} className="flex gap-2 text-xs">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                    evCfg ? evCfg.dot : 'bg-gray-300'
                  }`}
                />
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="font-semibold text-gray-800">
                      {ev.rawState ?? '—'}
                    </span>
                    {ev.mappedState && evCfg && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${evCfg.bg} ${evCfg.text}`}
                      >
                        → {evCfg.label}
                      </span>
                    )}
                    {!ev.mappedState && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                        {t('coliix.timeline.unmapped')}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400">· {ev.source}</span>
                  </div>
                  <div className="text-[11px] text-gray-500">{fmtDate(ev.occurredAt)}</div>
                  {ev.driverNote && (
                    <p className="mt-0.5 rounded bg-gray-50 px-2 py-1 text-[11px] italic text-gray-600">
                      "{ev.driverNote}"
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* COD + city footer */}
      <div className="flex flex-wrap gap-3 border-t border-gray-100 pt-2 text-[11px] text-gray-500">
        <span>
          {t('coliix.timeline.cod')}: <span className="font-semibold text-gray-700">{shipment.cod} MAD</span>
        </span>
        <span>
          {t('coliix.timeline.city')}: <span className="font-semibold text-gray-700">{shipment.city}</span>
        </span>
        <span>
          {t('coliix.timeline.goods')}: <span className="font-semibold text-gray-700">{shipment.goodsLabel}</span>
        </span>
      </div>
    </div>
  );
}
