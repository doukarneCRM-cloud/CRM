import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import {
  atelieApi,
  type Material,
  type CreateMaterialPayload,
  type MaterialCategory,
  type MaterialUnit,
} from '@/services/atelieApi';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  material?: Material | null;
}

export function MaterialFormModal({ open, onClose, onSaved, material }: Props) {
  const { t } = useTranslation();
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

  const CATEGORY_OPTIONS = useMemo(
    () => [
      { value: 'fabric', label: t('atelie.accessories.categoryFabric') },
      { value: 'accessory', label: t('atelie.accessories.categoryAccessory') },
      { value: 'needle', label: t('atelie.accessories.categoryNeedle') },
      { value: 'thread', label: t('atelie.accessories.categoryThread') },
      { value: 'other', label: t('atelie.accessories.categoryOther') },
    ],
    [t],
  );

  const UNIT_OPTIONS = useMemo(
    () => [
      { value: 'meter', label: t('atelie.materialForm.units.meter') },
      { value: 'piece', label: t('atelie.materialForm.units.piece') },
      { value: 'kilogram', label: t('atelie.materialForm.units.kilogram') },
      { value: 'spool', label: t('atelie.materialForm.units.spool') },
      { value: 'box', label: t('atelie.materialForm.units.box') },
    ],
    [t],
  );

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
      setError(t('atelie.materialForm.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      if (material) await atelieApi.updateMaterial(material.id, form);
      else await atelieApi.createMaterial(form);
      onSaved();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err, t('atelie.materialForm.saveFailed')));
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={material ? t('atelie.materialForm.titleEdit') : t('atelie.materialForm.titleNew')}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <CRMButton variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </CRMButton>
          <CRMButton onClick={submit} loading={saving}>
            {material ? t('atelie.materialForm.save') : t('atelie.materialForm.create')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMInput
          label={t('atelie.materialForm.name')}
          required
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-3">
          <CRMSelect
            label={t('atelie.materialForm.category')}
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(v) => setForm((f) => ({ ...f, category: v as MaterialCategory }))}
          />
          <CRMSelect
            label={t('atelie.materialForm.unit')}
            options={UNIT_OPTIONS}
            value={form.unit}
            onChange={(v) => setForm((f) => ({ ...f, unit: v as MaterialUnit }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label={t('atelie.materialForm.initialStock')}
            type="number"
            min={0}
            value={form.stock ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, stock: Number(e.target.value) }))}
          />
          <CRMInput
            label={t('atelie.materialForm.lowThreshold')}
            type="number"
            min={0}
            value={form.lowStockThreshold ?? 0}
            onChange={(e) => setForm((f) => ({ ...f, lowStockThreshold: Number(e.target.value) }))}
          />
        </div>
        <CRMInput
          label={t('atelie.materialForm.unitCost')}
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
          label={t('atelie.materialForm.supplier')}
          value={form.supplier ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
        />
        <CRMInput
          label={t('atelie.materialForm.notes')}
          value={form.notes ?? ''}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </GlassModal>
  );
}
