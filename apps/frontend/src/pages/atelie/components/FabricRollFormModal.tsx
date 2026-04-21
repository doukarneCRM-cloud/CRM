import { useEffect, useState } from 'react';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type FabricType, type CreateFabricRollPayload } from '@/services/atelieApi';
import { useToastStore } from '@/store/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FabricRollFormModal({ open, onClose, onSaved }: Props) {
  const pushToast = useToastStore((s) => s.push);
  const [types, setTypes] = useState<FabricType[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<CreateFabricRollPayload>({
    fabricTypeId: '',
    color: '',
    widthCm: null,
    initialLength: 0,
    unitCostPerMeter: 0,
    purchaseDate: todayIso(),
    supplier: '',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (!open) return;
    atelieApi.listFabricTypes().then(setTypes);
    setForm({
      fabricTypeId: '',
      color: '',
      widthCm: null,
      initialLength: 0,
      unitCostPerMeter: 0,
      purchaseDate: todayIso(),
      supplier: '',
      reference: '',
      notes: '',
    });
  }, [open]);

  const valid =
    form.fabricTypeId &&
    form.color.trim().length > 0 &&
    form.initialLength > 0 &&
    form.unitCostPerMeter >= 0;

  async function handleSave() {
    if (!valid) return;
    setSaving(true);
    try {
      await atelieApi.createFabricRoll({
        ...form,
        color: form.color.trim(),
        supplier: form.supplier?.trim() || null,
        reference: form.reference?.trim() || null,
        notes: form.notes?.trim() || null,
        purchaseDate: new Date(form.purchaseDate).toISOString(),
      });
      pushToast({
        kind: 'success',
        title: 'Roll saved',
        body: 'Expense added to Money automatically.',
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save roll';
      pushToast({ kind: 'error', title: 'Save failed', body: msg });
    } finally {
      setSaving(false);
    }
  }

  const total = form.initialLength * form.unitCostPerMeter;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="Purchase fabric roll"
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <CRMButton onClick={handleSave} disabled={!valid || saving}>
            {saving ? 'Saving…' : 'Save roll'}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMSelect
          label="Fabric type"
          options={[
            { value: '', label: 'Select a type…' },
            ...types.map((t) => ({ value: t.id, label: t.name })),
          ]}
          value={form.fabricTypeId}
          onChange={(v) => setForm({ ...form, fabricTypeId: v as string })}
        />

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            placeholder="Navy blue"
          />
          <CRMInput
            label="Width (cm, optional)"
            type="number"
            value={form.widthCm ?? ''}
            onChange={(e) =>
              setForm({ ...form, widthCm: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Length (m)"
            type="number"
            value={form.initialLength}
            onChange={(e) => setForm({ ...form, initialLength: Number(e.target.value) })}
          />
          <CRMInput
            label="MAD / meter"
            type="number"
            value={form.unitCostPerMeter}
            onChange={(e) => setForm({ ...form, unitCostPerMeter: Number(e.target.value) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Purchase date"
            type="date"
            value={form.purchaseDate.slice(0, 10)}
            onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
          />
          <CRMInput
            label="Supplier (optional)"
            value={form.supplier ?? ''}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
        </div>

        <CRMInput
          label="Reference (optional)"
          value={form.reference ?? ''}
          onChange={(e) => setForm({ ...form, reference: e.target.value })}
        />
        <CRMInput
          label="Notes (optional)"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <div className="rounded-input bg-primary/5 px-3 py-2 text-xs text-primary">
          Total: <strong>{total.toFixed(2)} MAD</strong> — will be added to Money as an expense.
        </div>
      </div>
    </GlassModal>
  );
}
