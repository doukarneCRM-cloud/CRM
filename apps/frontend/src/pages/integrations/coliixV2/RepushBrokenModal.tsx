/**
 * Pick + re-push parcels created with the Commentaire / Marchandise bug.
 * Modal lists every detected candidate (Shipment.note starting with [id:),
 * lets the operator deselect any to skip, and executes the cancel + re-push
 * loop on confirm.
 */

import { useEffect, useState } from 'react';
import { Loader2, RefreshCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassModal } from '@/components/ui/GlassModal';
import { coliixV2Api } from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';

interface Candidate {
  shipmentId: string;
  orderReference: string;
  trackingCode: string | null;
  state: string;
  note: string | null;
  goodsLabel: string;
  customerName: string;
  city: string;
}

interface ResultRow {
  orderReference: string;
  ok: boolean;
  newShipmentId?: string;
  error?: string;
}

interface Props {
  open: boolean;
  accountId: string | null;
  onClose: () => void;
}

export function RepushBrokenModal({ open, accountId, onClose }: Props) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    setLoading(true);
    setError(null);
    setResults(null);
    coliixV2Api
      .repushPreview(accountId)
      .then((r) => {
        setCandidates(r.candidates);
        setSelected(new Set(r.candidates.map((c) => c.shipmentId)));
      })
      .catch((err) => setError(apiErrorMessage(err, 'Could not load candidates')))
      .finally(() => setLoading(false));
  }, [open, accountId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleExecute() {
    if (!accountId || selected.size === 0) return;
    if (
      !window.confirm(
        `Re-push ${selected.size} parcel(s)?\n\n` +
          'Each will get a NEW Coliix tracking code with corrected Commentaire + Marchandise.\n' +
          'The OLD parcel still exists at Coliix — cancel it via Coliix support to avoid double charge.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await coliixV2Api.repushExecute(accountId, Array.from(selected));
      setResults(
        r.results.map((row) => ({
          orderReference: row.orderReference,
          ok: row.ok,
          newShipmentId: row.newShipmentId,
          error: row.error,
        })),
      );
    } catch (err) {
      setError(apiErrorMessage(err, 'Re-push failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="Re-push broken parcels" size="3xl">
      <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
        These shipments were created with the Commentaire bug ([id:…]) and missing variant
        info on the Marchandise. Re-pushing creates new Coliix parcels with corrected
        labels. The OLD broken parcels still exist at Coliix — cancel them via Coliix
        support to avoid being charged for double delivery.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      ) : results ? (
        <div className="rounded-lg border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
            Results — {results.filter((r) => r.ok).length} ok / {results.filter((r) => !r.ok).length} failed
          </div>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2">
                      {r.ok ? (
                        <CheckCircle2 className="inline h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="inline h-4 w-4 text-red-600" />
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{r.orderReference}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.ok ? `New shipment ${r.newShipmentId?.slice(-8) ?? ''}` : r.error}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !candidates || candidates.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 p-8 text-center text-sm text-gray-600">
          ✅ No broken parcels detected — every V2 push on this account looks clean.
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>
              {selected.size} of {candidates.length} selected
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set(candidates.map((c) => c.shipmentId)))}
                className="text-primary hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-gray-500 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-auto rounded-md border border-gray-200">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="px-2 py-1 w-8"></th>
                  <th className="px-2 py-1">Order</th>
                  <th className="px-2 py-1">Tracking</th>
                  <th className="px-2 py-1">Customer / City</th>
                  <th className="px-2 py-1">Marchandise (broken)</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.shipmentId} className="border-t border-gray-100">
                    <td className="px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selected.has(c.shipmentId)}
                        onChange={() => toggle(c.shipmentId)}
                      />
                    </td>
                    <td className="px-2 py-1 font-mono">{c.orderReference}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-gray-500">
                      {c.trackingCode ?? '—'}
                    </td>
                    <td className="px-2 py-1">
                      {c.customerName}
                      <span className="text-gray-400"> · {c.city}</span>
                    </td>
                    <td className="px-2 py-1 text-gray-600">{c.goodsLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
        <CRMButton variant="ghost" onClick={onClose}>
          Close
        </CRMButton>
        {!results && candidates && candidates.length > 0 && (
          <CRMButton
            onClick={handleExecute}
            loading={busy}
            disabled={busy || selected.size === 0}
            leftIcon={<RefreshCcw className="h-4 w-4" />}
          >
            Re-push {selected.size}
          </CRMButton>
        )}
      </div>
    </GlassModal>
  );
}
