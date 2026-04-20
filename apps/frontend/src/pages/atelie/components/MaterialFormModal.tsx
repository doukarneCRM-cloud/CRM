import { useEffect, useState } from 'react';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import {
  atelieApi,
  type Material,
  type CreateMaterialPayload,
  type MaterialCategory,
  type MaterialUnit,
} from '@/services/atelieApi';

const CATEGORY_OPTIONS = [
  { value: 'fabric', label: 'Fabric' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'needle', label: 'Needle' },
  { value: 'thread', label: 'Thread' },
  { value: 'other', label: 'Other' },
];

const UNIT_OPTIONS = [
  { value: 'meter', label: 'Meter' },
  { value: 'piece', label: 'Piece' },
  { value: 'kilogram', label: 'Kilogram' },
  { value: 'spool', label: 'Spool' },
  { value: 'box', label: 'Box' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  material?: Material | null;
}

export function MaterialFormModal({ open, onClose, onSaved, material }: Props) {
  const [form, setForm] = useState<CreateMaterialPayload>({
    name: '',
    category: 'fabric',
    unit: 'meter',
    stock: 0,
    lowStockThreshold: 0,
    unitCost: null,
    supplier: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        material
          ? {
              name: material.name,
              category: material.category,
              unit: material.unit,
              stock: material.stock,
              lowStockThreshold: material.lowStockThreshold,
              unitCost: material.unitCost,
              supplier: material.supplier ?? '',
              notes: material.notes ?? '',
            }
          : {
              name: '',
              category: 'fabric',
              unit: 'meter',
              stock: 0,
              lowStockThreshold: 0,
              unitCost: null,
              supplier: '',
              notes: '',
            },
      );
    }
  }, [open, material]);

  async function submit() {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (material) await atelieApi.updateMaterial(material.id, form);
      else await atelieApi.createMaterial(form);
      onSaved();
      onClose();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error
          ?.message ?? 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={material ? 'Edit material' : 'New material'}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </CRMButton>
          <CRMButton onClick={submit} loading={saving}>
            {material ? 'Save' : 'Create'}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label="Name"
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <CRMSelect
            label="Category"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v as MaterialCategory }))}
          />
          <CRMSelect
            label="Unit"
            options={UNIT_OPTIONS}
            value={form.unit}
            onChange={(v) => setForm((f) => ({ ...f, unit: v as MaterialUnit }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Initial stock"
            type="number"
            min={0}
            value={form.stock ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
          />
          <CRMInput
            label="Low-stock threshold"
            type="number"
            min={0}
            value={form.lowStockThreshold ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: Number(e.target.value) }))}
          />
        </div>
        <CRMInput
          label="Unit cost (MAD, optional)"
          type="number"
          min={0}
          step={0.01}
          value={form.unitCost ?? ''}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              unitCost: e.target.value === '' ? null : Number(e.target.value),
            }))
          }
        />
        <CRMInput
          label="Supplier"
          value={form.supplier ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
        />
        <CRMInput
          label="Notes"
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </GlassModal>
  );
}
