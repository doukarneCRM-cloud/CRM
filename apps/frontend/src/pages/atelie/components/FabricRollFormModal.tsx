import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type FabricType, type CreateFabricRollPayload } from '@/services/atelieApi';
import { useToastStore } from '@/store/toastStore';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function FabricRollFormModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation();
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
        title: t('atelie.fabricRollForm.toastSavedTitle'),
        body: t('atelie.fabricRollForm.toastSavedBody'),
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      pushToast({
        kind: 'error',
        title: t('atelie.fabricRollForm.toastFailTitle'),
        body: apiErrorMessage(err, t('atelie.fabricRollForm.toastFailBody')),
      });
    } finally {
      setSaving(false);
    }
  }

  const total = form.initialLength * form.unitCostPerMeter;

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('atelie.fabricRollForm.title')}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <CRMButton onClick={handleSave} disabled={!valid || saving}>
            {saving ? t('atelie.fabricRollForm.saving') : t('atelie.fabricRollForm.saveRoll')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <CRMSelect
          label={t('atelie.fabricRollForm.fabricType')}
          options={[
            { value: '', label: t('atelie.fabricRollForm.selectType') },
            ...types.map((ft) => ({ value: ft.id, label: ft.name })),
          ]}
          value={form.fabricTypeId}
          onChange={(v) => setForm({ ...form, fabricTypeId: v as string })}
        />

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label={t('atelie.fabricRollForm.color')}
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            placeholder={t('atelie.fabricRollForm.colorPlaceholder')}
          />
          <CRMInput
            label={t('atelie.fabricRollForm.widthOptional')}
            type="number"
            value={form.widthCm ?? ''}
            onChange={(e) =>
              setForm({ ...form, widthCm: e.target.value === '' ? null : Number(e.target.value) })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label={t('atelie.fabricRollForm.lengthM')}
            type="number"
            value={form.initialLength}
            onChange={(e) => setForm({ ...form, initialLength: Number(e.target.value) })}
          />
          <CRMInput
            label={t('atelie.fabricRollForm.pricePerMeter')}
            type="number"
            value={form.unitCostPerMeter}
            onChange={(e) => setForm({ ...form, unitCostPerMeter: Number(e.target.value) })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label={t('atelie.fabricRollForm.purchaseDate')}
            type="date"
            value={form.purchaseDate.slice(0, 10)}
            onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
          />
          <CRMInput
            label={t('atelie.fabricRollForm.supplierOptional')}
            value={form.supplier ?? ''}
            onChange={(e) => setForm({ ...form, supplier: e.target.value })}
          />
        </div>

        <CRMInput
          label={t('atelie.fabricRollForm.referenceOptional')}
          value={form.reference ?? ''}
          onChange={(e) => setForm({ ...form, reference: e.target.value })}
        />
        <CRMInput
          label={t('atelie.fabricRollForm.notesOptional')}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <div className="rounded-input bg-primary/5 px-3 py-2 text-xs text-primary">
          {t('atelie.fabricRollForm.totalNotePrefix')}
          <strong>{t('atelie.fabricRollForm.totalAmount', { total: total.toFixed(2) })}</strong>
          {t('atelie.fabricRollForm.totalNoteSuffix')}
        </div>
      </div>
    </GlassModal>
  );
}
