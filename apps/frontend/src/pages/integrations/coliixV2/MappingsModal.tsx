/**
 * V2 mappings editor — admin-editable Coliix wording → ShipmentState.
 * Lists every known wording with a count of shipments currently in each
 * bucket; PATCH writes the new bucket and re-buckets in one call.
 */

import { useEffect, useState } from 'react';
import { Loader2, Save, AlertTriangle } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassModal } from '@/components/ui/GlassModal';
import {
  coliixV2Api,
  SHIPMENT_STATE_LABEL,
  type MappingRow,
  type ShipmentState,
} from '@/services/coliixV2Api';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATES: ShipmentState[] = [
  'pending',
  'pushed',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'refused',
  'returned',
  'lost',
  'cancelled',
];

export function MappingsModal({ open, onClose }: Props) {
  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { internalState?: ShipmentState; isTerminal?: boolean }>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    coliixV2Api
      .listMappings()
      .then((m) => setRows(m))
      .catch((err) => setError(apiErrorMessage(err, 'Could not load mappings')))
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave(row: MappingRow) {
    const edit = edits[row.id];
    if (!edit?.internalState) return;
    setSavingId(row.id);
    try {
      const r = await coliixV2Api.updateMapping(row.id, {
        internalState: edit.internalState,
        isTerminal: edit.isTerminal ?? row.isTerminal,
      });
      setRows((prev) => prev.map((p) => (p.id === row.id ? { ...p, ...r.mapping } : p)));
      setEdits((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save mapping'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <GlassModal open={open} onClose={onClose} title="Coliix V2 — Status mappings" size="3xl">
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="text-left text-xs font-medium text-gray-500">
                <th className="border-b border-gray-200 py-2">Coliix wording</th>
                <th className="border-b border-gray-200 py-2">Maps to</th>
                <th className="border-b border-gray-200 py-2">Terminal?</th>
                <th className="border-b border-gray-200 py-2 text-right">Shipments</th>
                <th className="border-b border-gray-200 py-2 text-right">Save</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const edit = edits[r.id];
                const internalState = edit?.internalState ?? r.internalState;
                const isTerminal = edit?.isTerminal ?? r.isTerminal;
                const dirty =
                  edit !== undefined &&
                  (internalState !== r.internalState || isTerminal !== r.isTerminal);
                return (
                  <tr key={r.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-mono text-xs">{r.rawWording}</td>
                    <td className="py-2">
                      <select
                        className="rounded-md border border-gray-200 px-2 py-1 text-sm"
                        value={internalState}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], internalState: e.target.value as ShipmentState },
                          }))
                        }
                      >
                        {STATES.map((s) => (
                          <option key={s} value={s}>
                            {SHIPMENT_STATE_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={isTerminal}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [r.id]: { ...prev[r.id], isTerminal: e.target.checked },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2 text-right text-xs text-gray-600">
                      {r.shipmentCount.toLocaleString()}
                    </td>
                    <td className="py-2 text-right">
                      <CRMButton
                        size="sm"
                        variant="ghost"
                        loading={savingId === r.id}
                        disabled={!dirty || savingId === r.id}
                        onClick={() => handleSave(r)}
                        leftIcon={<Save className="h-3.5 w-3.5" />}
                      >
                        Save
                      </CRMButton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassModal>
  );
}
