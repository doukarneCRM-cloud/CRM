import { useEffect, useState } from 'react';
import { GlassModal, CRMInput, CRMButton, CRMSelect } from '@/components/ui';
import { atelieApi, type Material, type MovementType, type MaterialMovement } from '@/services/atelieApi';

const TYPE_OPTIONS = [
  { value: 'in', label: 'Stock in (+ add)' },
  { value: 'out', label: 'Stock out (− remove)' },
  { value: 'adjustment', label: 'Set to exact value' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  material: Material | null;
  onSaved: () => void;
}

export function MovementModal({ open, onClose, material, onSaved }: Props) {
  const [type, setType] = useState<MovementType>('in');
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<MaterialMovement[]>([]);

  useEffect(() => {
    if (!open || !material) return;
    setType('in');
    setQty(0);
    setReason('');
    setError(null);
    atelieApi.listMovements(material.id, 20).then(setHistory).catch(() => setHistory([]));
  }, [open, material]);

  if (!material) return null;

  async function submit() {
    if (qty <= 0) {
      setError('Quantity must be > 0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await atelieApi.recordMovement(material!.id, { type, quantity: qty, reason: reason.trim() || undefined });
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message ?? 'Failed to record movement';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={`Stock — ${material.name}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            Close
          </CRMButton>
          <CRMButton onClick={submit} loading={saving}>
            Record movement
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Current stock</p>
            <p className="text-xl font-bold text-gray-900">
              {material.stock} <span className="text-sm font-normal text-gray-500">{material.unit}</span>
            </p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Low threshold</p>
            <p className="text-sm font-semibold text-gray-700">{material.lowStockThreshold}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <CRMSelect
            label="Type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as MovementType)}
            className="col-span-2"
          />
          <CRMInput
            label="Quantity"
            type="number"
            min={0}
            step={0.01}
            value={qty}
            onChange={(e) => setQty(Number(e.target.value))}
          />
        </div>
        <CRMInput
          label="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-700">Recent movements</h3>
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-left font-medium">Type</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-left font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-center text-sm text-gray-400">
                      No movements yet.
                    </td>
                  </tr>
                )}
                {history.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-600">
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <TypeTag t={m.type} />
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{m.quantity}</td>
                    <td className="px-3 py-2 text-gray-500">{m.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}

function TypeTag({ t }: { t: MovementType }) {
  const map = {
    in: 'bg-green-50 text-green-600',
    out: 'bg-red-50 text-red-600',
    adjustment: 'bg-blue-50 text-blue-600',
  } as const;
  const label = { in: 'IN', out: 'OUT', adjustment: 'SET' } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[t]}`}>
      {label[t]}
    </span>
  );
}
