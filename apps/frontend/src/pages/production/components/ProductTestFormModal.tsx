import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type FabricType, type Material } from '@/services/atelieApi';
import { productionApi, type CreateProductTestPayload } from '@/services/productionApi';
import { useToastStore } from '@/store/toastStore';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductTestFormModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [accessories, setAccessories] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);

  const blankForm: CreateProductTestPayload = {
    name: '',
    videoUrl: '',
    description: '',
    laborMadPerPiece: null,
    confirmationFee: null,
    deliveryFee: null,
    markupPercent: 40,
    notes: '',
    fabrics: [],
    sizes: [],
    accessories: [],
  };
  const [form, setForm] = useState<CreateProductTestPayload>(blankForm);

  useEffect(() => {
    if (!open) return;
    Promise.all([atelieApi.listFabricTypes(), atelieApi.listMaterials({})]).then(
      ([ft, mats]) => {
        setFabricTypes(ft);
        setAccessories(mats.filter((m) => m.category !== 'fabric'));
      },
    );
    setForm(blankForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await productionApi.createTest({
        ...form,
        name: form.name.trim(),
        videoUrl: form.videoUrl?.trim() || null,
        description: form.description?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      pushToast({ kind: 'success', title: t('production.testForm.toast.savedTitle') });
      onSaved();
      onClose();
    } catch (err: unknown) {
      pushToast({
        kind: 'error',
        title: t('production.testForm.toast.saveFailedTitle'),
        body: apiErrorMessage(err, t('production.testForm.toast.saveFallback')),
      });
    } finally {
      setSaving(false);
    }
  }

  function updateFabric(i: number, patch: Partial<{ fabricTypeId: string; role: string }>) {
    const arr = [...(form.fabrics ?? [])];
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, fabrics: arr });
  }

  function updateSize(
    i: number,
    patch: Partial<{ size: string; tracingMeters: number }>,
  ) {
    const arr = [...(form.sizes ?? [])];
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, sizes: arr });
  }

  function updateAcc(
    i: number,
    patch: Partial<{ materialId: string; quantityPerPiece: number }>,
  ) {
    const arr = [...(form.accessories ?? [])];
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, accessories: arr });
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('production.testForm.title')}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <CRMButton onClick={save} disabled={!form.name.trim() || saving}>
            {saving ? t('production.testForm.saving') : t('production.testForm.saveTest')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <CRMInput
          label={t('production.testForm.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder={t('production.testForm.namePlaceholder')}
        />

        <CRMInput
          label={t('production.testForm.videoUrl')}
          value={form.videoUrl ?? ''}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
          placeholder={t('production.testForm.videoUrlPlaceholder')}
        />

        {/* Cost-calc inputs. estimatedCostPerPiece + suggestedPrice are
            COMPUTED by the backend on save — admins enter labor / fees /
            markup here and the right-rail panel on the detail page shows
            the resulting numbers. */}
        <div className="rounded-card border border-gray-100 bg-gray-50/50 p-3">
          <h3 className="mb-2 text-xs font-semibold text-gray-700">
            {t('production.samples.form.pricingHeading')}
          </h3>
          <p className="mb-3 text-[10px] text-gray-500">
            {t('production.samples.form.pricingHint')}
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CRMInput
              label={t('production.samples.form.laborPerPiece')}
              type="number"
              value={form.laborMadPerPiece ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  laborMadPerPiece: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <CRMInput
              label={t('production.samples.form.confirmationFee')}
              type="number"
              value={form.confirmationFee ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  confirmationFee: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <CRMInput
              label={t('production.samples.form.deliveryFee')}
              type="number"
              value={form.deliveryFee ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  deliveryFee: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
            <CRMInput
              label={t('production.samples.form.markupPercent')}
              type="number"
              value={form.markupPercent ?? ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  markupPercent: e.target.value === '' ? null : Number(e.target.value),
                })
              }
            />
          </div>
        </div>

        {/* Fabrics */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">
              {t('production.testForm.fabricsHeading')}
            </h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  fabrics: [...(form.fabrics ?? []), { fabricTypeId: '', role: 'main' }],
                })
              }
              className="inline-flex items-center gap-1 rounded-btn bg-accent px-2 py-1 text-[11px] font-semibold text-primary hover:bg-accent/70"
            >
              <Plus size={11} /> {t('production.testForm.addFabric')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.fabrics ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMSelect
                  options={[
                    { value: '', label: t('production.testForm.selectFabric') },
                    ...fabricTypes.map((ft) => ({ value: ft.id, label: ft.name })),
                  ]}
                  value={f.fabricTypeId}
                  onChange={(v) => updateFabric(i, { fabricTypeId: v as string })}
                  className="flex-1"
                />
                <CRMInput
                  className="w-36"
                  value={f.role}
                  placeholder={t('production.testForm.rolePlaceholder')}
                  onChange={(e) => updateFabric(i, { role: e.target.value })}
                />
                <button
                  onClick={() =>
                    setForm({
                      ...form,
                      fabrics: (form.fabrics ?? []).filter((_, idx) => idx !== i),
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sizes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">
              {t('production.testForm.sizesHeading')}
            </h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  sizes: [...(form.sizes ?? []), { size: '', tracingMeters: 0 }],
                })
              }
              className="inline-flex items-center gap-1 rounded-btn bg-accent px-2 py-1 text-[11px] font-semibold text-primary hover:bg-accent/70"
            >
              <Plus size={11} /> {t('production.testForm.addSize')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.sizes ?? []).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMInput
                  className="w-24"
                  value={s.size}
                  placeholder={t('production.testForm.sizePlaceholder')}
                  onChange={(e) => updateSize(i, { size: e.target.value })}
                />
                <CRMInput
                  className="flex-1"
                  type="number"
                  value={s.tracingMeters}
                  placeholder={t('production.testForm.tracingPlaceholder')}
                  onChange={(e) =>
                    updateSize(i, { tracingMeters: Number(e.target.value) })
                  }
                />
                <button
                  onClick={() =>
                    setForm({
                      ...form,
                      sizes: (form.sizes ?? []).filter((_, idx) => idx !== i),
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Accessories */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">
              {t('production.testForm.accessoriesHeading')}
            </h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  accessories: [
                    ...(form.accessories ?? []),
                    { materialId: '', quantityPerPiece: 0 },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded-btn bg-accent px-2 py-1 text-[11px] font-semibold text-primary hover:bg-accent/70"
            >
              <Plus size={11} /> {t('production.testForm.addAccessory')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.accessories ?? []).map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMSelect
                  options={[
                    { value: '', label: t('production.testForm.selectAccessory') },
                    ...accessories.map((m) => ({
                      value: m.id,
                      label: t('production.testForm.accessoryLabel', {
                        name: m.name,
                        unit: m.unit,
                      }),
                    })),
                  ]}
                  value={a.materialId}
                  onChange={(v) => updateAcc(i, { materialId: v as string })}
                  className="flex-1"
                />
                <CRMInput
                  className="w-32"
                  type="number"
                  value={a.quantityPerPiece}
                  placeholder={t('production.testForm.qtyPlaceholder')}
                  onChange={(e) =>
                    updateAcc(i, { quantityPerPiece: Number(e.target.value) })
                  }
                />
                <button
                  onClick={() =>
                    setForm({
                      ...form,
                      accessories: (form.accessories ?? []).filter((_, idx) => idx !== i),
                    })
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-700">
            {t('production.samples.form.description')}
          </label>
          <textarea
            rows={3}
            value={form.description ?? ''}
            placeholder={t('production.samples.form.descriptionPlaceholder')}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-input border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <CRMInput
          label={t('production.testForm.notes')}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </GlassModal>
  );
}
