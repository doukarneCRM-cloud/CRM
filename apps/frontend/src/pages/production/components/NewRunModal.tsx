import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type AtelieEmployee } from '@/services/atelieApi';
import {
  productionApi,
  type CreateRunPayload,
  type ProductTest,
} from '@/services/productionApi';
import { useToastStore } from '@/store/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function NewRunModal({ open, onClose, onSaved }: Props) {
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
    const t = tests.find((x) => x.id === testId);
    if (!t) {
      setForm({ ...form, testId: null, fabrics: [], sizes: [] });
      return;
    }
    setForm({
      ...form,
      testId: t.id,
      fabrics: t.fabrics.map((f) => ({ fabricTypeId: f.fabricTypeId, role: f.role })),
      sizes: t.sizes.map((s) => ({
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
      pushToast({ kind: 'success', title: 'Run created' });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not create run';
      pushToast({ kind: 'error', title: 'Save failed', body: msg });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title="New production run"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <CRMButton onClick={save} disabled={saving || !form.startDate}>
            {saving ? 'Saving…' : 'Create run'}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <CRMSelect
          label="Based on product test (optional — pre-fills sizes & fabrics)"
          options={[
            { value: '', label: 'No test (blank run)' },
            ...tests.map((t) => ({ value: t.id, label: t.name })),
          ]}
          value={form.testId ?? ''}
          onChange={(v) => applyTest(v as string)}
        />

        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={(e) => setForm({ ...form, startDate: e.target.value })}
          />
          <CRMInput
            label="End date (optional)"
            type="date"
            value={form.endDate ?? ''}
            onChange={(e) => setForm({ ...form, endDate: e.target.value || null })}
          />
        </div>

        {/* Sizes with expected pieces */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">Sizes & expected pieces</h3>
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
              <Plus size={11} /> Add size
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.sizes ?? []).map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMInput
                  className="w-24"
                  value={s.size}
                  placeholder="S / M"
                  onChange={(e) => updateSize(i, { size: e.target.value })}
                />
                <CRMInput
                  className="w-32"
                  type="number"
                  value={s.tracingMeters}
                  placeholder="Tracing (m)"
                  onChange={(e) =>
                    updateSize(i, { tracingMeters: Number(e.target.value) })
                  }
                />
                <CRMInput
                  className="flex-1"
                  type="number"
                  value={s.expectedPieces}
                  placeholder="Expected pieces"
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
                Pick a test above to pre-fill, or add sizes manually.
              </p>
            )}
          </div>
        </div>

        {/* Workers */}
        <div>
          <h3 className="mb-2 text-xs font-semibold text-gray-700">Assign workers</h3>
          {employees.length === 0 ? (
            <p className="text-[11px] text-gray-400">No employees found.</p>
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
                    <span className="ml-1 text-[10px] opacity-70">· {e.role}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <CRMInput
          label="Notes"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </GlassModal>
  );
}
