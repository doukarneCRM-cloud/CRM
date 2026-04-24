import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type AtelieEmployee } from '@/services/atelieApi';
import {
  productionApi,
  type CreateRunPayload,
  type ProductTest,
} from '@/services/productionApi';
import { useToastStore } from '@/store/toastStore';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function NewRunModal({ open, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [tests, setTests] = useState<ProductTest[]>([]);
  const [employees, setEmployees] = useState<AtelieEmployee[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CreateRunPayload>({
    testId: null,
    startDate: todayISO(),
    endDate: null,
    notes: '',
    fabrics: [],
    sizes: [],
    workerIds: [],
  });

  useEffect(() => {
    if (!open) return;
    Promise.all([productionApi.listTests(), atelieApi.listEmployees(true)]).then(
      ([ts, emps]) => {
        setTests(ts);
        setEmployees(emps);
      },
    );
    setForm({
      testId: null,
      startDate: todayISO(),
      endDate: null,
      notes: '',
      fabrics: [],
      sizes: [],
      workerIds: [],
    });
  }, [open]);

  function applyTest(testId: string) {
    const found = tests.find((x) => x.id === testId);
    if (!found) {
      setForm({ ...form, testId: null, fabrics: [], sizes: [] });
      return;
    }
    setForm({
      ...form,
      testId: found.id,
      fabrics: found.fabrics.map((f) => ({ fabricTypeId: f.fabricTypeId, role: f.role })),
      sizes: found.sizes.map((s) => ({
        size: s.size,
        tracingMeters: s.tracingMeters,
        expectedPieces: 0,
        actualPieces: 0,
      })),
    });
  }

  function toggleWorker(id: string) {
    const ids = new Set(form.workerIds ?? []);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    setForm({ ...form, workerIds: Array.from(ids) });
  }

  function updateSize(
    i: number,
    patch: Partial<{ size: string; tracingMeters: number; expectedPieces: number }>,
  ) {
    const arr = [...(form.sizes ?? [])];
    arr[i] = { ...arr[i], ...patch };
    setForm({ ...form, sizes: arr });
  }

  async function save() {
    setSaving(true);
    try {
      await productionApi.createRun({
        ...form,
        notes: form.notes?.trim() || null,
        endDate: form.endDate || null,
      });
      pushToast({ kind: 'success', title: t('production.newRun.toast.createdTitle') });
      onSaved();
      onClose();
    } catch (err: unknown) {
      pushToast({
        kind: 'error',
        title: t('production.newRun.toast.saveFailedTitle'),
        body: apiErrorMessage(err, t('production.newRun.toast.saveFallback')),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={t('production.newRun.title')}
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <CRMButton onClick={save} disabled={saving || !form.startDate}>
            {saving ? t('production.newRun.saving') : t('production.newRun.create')}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <CRMSelect
          label={t('production.newRun.basedOn')}
          options={[
            { value: '', label: t('production.newRun.noTest') },
            ...tests.map((test) => ({ value: test.id, label: test.name })),
          ]}
          value={form.testId ?? ''}
          onChange={(v) => applyTest(v as string)}
        />

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label={t('production.newRun.startDate')}
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <CRMInput
            label={t('production.newRun.endDate')}
            type="date"
            value={form.endDate ?? ''}
            onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
          />
        </div>

        {/* Sizes with expected pieces */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">
              {t('production.newRun.sizesHeading')}
            </h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  sizes: [
                    ...(form.sizes ?? []),
                    { size: '', tracingMeters: 0, expectedPieces: 0 },
                  ],
                })
              }
              className="inline-flex items-center gap-1 rounded-btn bg-accent px-2 py-1 text-[11px] font-semibold text-primary hover:bg-accent/70"
            >
              <Plus size={11} /> {t('production.newRun.addSize')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.sizes ?? []).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMInput
                  className="w-24"
                  value={s.size}
                  placeholder={t('production.newRun.sizePlaceholder')}
                  onChange={(e) => updateSize(i, { size: e.target.value })}
                />
                <CRMInput
                  className="w-32"
                  type="number"
                  value={s.tracingMeters}
                  placeholder={t('production.newRun.tracingPlaceholder')}
                  onChange={(e) =>
                    updateSize(i, { tracingMeters: Number(e.target.value) })
                  }
                />
                <CRMInput
                  className="flex-1"
                  type="number"
                  value={s.expectedPieces}
                  placeholder={t('production.newRun.expectedPlaceholder')}
                  onChange={(e) =>
                    updateSize(i, { expectedPieces: Number(e.target.value) })
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
            {(form.sizes ?? []).length === 0 && (
              <p className="text-[11px] text-gray-400">
                {t('production.newRun.pickTestHint')}
              </p>
            )}
          </div>
        </div>

        {/* Workers */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-700">
            {t('production.newRun.assignWorkers')}
          </h3>
          {employees.length === 0 ? (
            <p className="text-[11px] text-gray-400">{t('production.newRun.noEmployees')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {employees.map((e) => {
                const selected = (form.workerIds ?? []).includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => toggleWorker(e.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      selected
                        ? 'border-primary bg-primary text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {e.name}
                    <span className="ml-1 text-[10px] opacity-70">{'\u00b7 '}{e.role}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <CRMInput
          label={t('production.newRun.notes')}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </GlassModal>
  );
}
