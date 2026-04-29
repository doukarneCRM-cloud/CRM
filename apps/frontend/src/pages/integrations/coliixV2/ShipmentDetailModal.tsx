/**
 * Shipment detail — vertical timeline of every event with the source icon
 * (webhook bolt / poll cycle / push arrow / manual hand). Used as a modal
 * launched from anywhere a shipment id is known.
 */

import { useEffect, useState } from 'react';
import {
  Loader2,
  Webhook,
  RotateCw,
  Send,
  Hand,
  RefreshCcw,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassModal } from '@/components/ui/GlassModal';
import {
  coliixV2Api,
  SHIPMENT_STATE_COLOR,
  SHIPMENT_STATE_LABEL,
  type ShipmentDetail,
  type ShipmentEventSource,
} from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  shipmentId: string | null;
  onClose: () => void;
}

const SOURCE_ICON: Record<ShipmentEventSource, React.ReactNode> = {
  webhook: <Webhook className="h-3.5 w-3.5" />,
  poll: <RotateCw className="h-3.5 w-3.5" />,
  push: <Send className="h-3.5 w-3.5" />,
  manual: <Hand className="h-3.5 w-3.5" />,
};

export function ShipmentDetailModal({ open, shipmentId, onClose }: Props) {
  const [detail, setDetail] = useState<ShipmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!shipmentId) return;
    setLoading(true);
    try {
      const d = await coliixV2Api.shipment(shipmentId);
      setDetail(d);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load shipment'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && shipmentId) reload();
    if (!open) {
      setDetail(null);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipmentId]);

  async function handleRefresh() {
    if (!shipmentId) return;
    setBusy('refresh');
    try {
      await coliixV2Api.refreshShipment(shipmentId);
      await reload();
    } catch (err) {
      setError(apiErrorMessage(err, 'Refresh failed'));
    } finally {
      setBusy(null);
    }
  }

  async function handleCancel() {
    if (!shipmentId) return;
    const reason = window.prompt('Reason for cancelling? (optional)') ?? '';
    setBusy('cancel');
    try {
      await coliixV2Api.cancelShipment(shipmentId, reason || undefined);
      await reload();
    } catch (err) {
      setError(apiErrorMessage(err, 'Cancel failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="Shipment detail" size="2xl">
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : !detail ? (
        <div className="py-12 text-center text-sm text-gray-500">No shipment selected.</div>
      ) : (
        <>
          {error && (
            <div className="mb-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <Field label="Tracking">
              <span className="font-mono text-xs">{detail.trackingCode ?? '—'}</span>
            </Field>
            <Field label="Status">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${SHIPMENT_STATE_COLOR[detail.state]}`}
              >
                {SHIPMENT_STATE_LABEL[detail.state]}
              </span>
              {detail.rawState && (
                <span className="ml-2 text-xs text-gray-500">({detail.rawState})</span>
              )}
            </Field>
            <Field label="Recipient">{detail.recipientName} · {detail.recipientPhone}</Field>
            <Field label="City / Address">{detail.city} — {detail.address}</Field>
            <Field label="Goods">{detail.goodsLabel} × {detail.goodsQty}</Field>
            <Field label="COD">{Number(detail.cod).toFixed(2)} MAD</Field>
          </div>

          {detail.lastPushError && (
            <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              <span className="font-semibold">Last push error:</span> {detail.lastPushError}
            </div>
          )}

          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Timeline
          </h4>
          <div className="max-h-[40vh] space-y-3 overflow-auto pr-1">
            {detail.events.map((e) => (
              <div
                key={e.id}
                className="rounded-lg border border-gray-100 bg-white p-3 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-gray-100 p-1 text-gray-600">
                      {SOURCE_ICON[e.source]}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{e.rawState}</span>
                    {e.mappedState && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SHIPMENT_STATE_COLOR[e.mappedState]}`}
                      >
                        {SHIPMENT_STATE_LABEL[e.mappedState]}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400">
                    {new Date(e.occurredAt).toLocaleString()}
                  </span>
                </div>
                {e.driverNote && (
                  <p className="mt-1 text-xs italic text-gray-600">"{e.driverNote}"</p>
                )}
              </div>
            ))}
            {detail.events.length === 0 && (
              <p className="py-4 text-center text-xs text-gray-400">No events yet.</p>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
            <CRMButton
              size="sm"
              variant="ghost"
              onClick={handleRefresh}
              loading={busy === 'refresh'}
              leftIcon={<RefreshCcw className="h-4 w-4" />}
            >
              Refresh now
            </CRMButton>
            {!['delivered', 'returned', 'refused', 'lost', 'cancelled'].includes(detail.state) && (
              <CRMButton
                size="sm"
                variant="danger"
                onClick={handleCancel}
                loading={busy === 'cancel'}
                leftIcon={<Ban className="h-4 w-4" />}
              >
                Cancel locally
              </CRMButton>
            )}
          </div>
        </>
      )}
    </GlassModal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}
