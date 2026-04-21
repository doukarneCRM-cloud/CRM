import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { GlassModal, CRMInput, CRMSelect, CRMButton } from '@/components/ui';
import { atelieApi, type FabricType, type Material } from '@/services/atelieApi';
import { productionApi, type CreateProductTestPayload } from '@/services/productionApi';
import { useToastStore } from '@/store/toastStore';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function ProductTestFormModal({ open, onClose, onSaved }: Props) {
  const pushToast = useToastStore((s) => s.push);
  const [fabricTypes, setFabricTypes] = useState<FabricType[]>([]);
  const [accessories, setAccessories] = useState<Material[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<CreateProductTestPayload>({
    name: '',
    videoUrl: '',
    estimatedCostPerPiece: null,
    notes: '',
    fabrics: [],
    sizes: [],
    accessories: [],
  });

  useEffect(() => {
    if (!open) return;
    Promise.all([atelieApi.listFabricTypes(), atelieApi.listMaterials({})]).then(
      ([ft, mats]) => {
        setFabricTypes(ft);
        setAccessories(mats.filter((m) => m.category !== 'fabric'));
      },
    );
    setForm({
      name: '',
      videoUrl: '',
      estimatedCostPerPiece: null,
      notes: '',
      fabrics: [],
      sizes: [],
      accessories: [],
    });
  }, [open]);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await productionApi.createTest({
        ...form,
        name: form.name.trim(),
        videoUrl: form.videoUrl?.trim() || null,
        notes: form.notes?.trim() || null,
      });
      pushToast({ kind: 'success', title: 'Test saved' });
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not save';
      pushToast({ kind: 'error', title: 'Save failed', body: msg });
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
      title="New product test"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-btn border border-gray-200 bg-white px-3.5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <CRMButton onClick={save} disabled={!form.name.trim() || saving}>
            {saving ? 'Saving…' : 'Save test'}
          </CRMButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <CRMInput
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Summer kaftan — model A"
          />
          <CRMInput
            label="Estimated MAD / piece"
            type="number"
            value={form.estimatedCostPerPiece ?? ''}
            onChange={(e) =>
              setForm({
                ...form,
                estimatedCostPerPiece:
                  e.target.value === '' ? null : Number(e.target.value),
              })
            }
          />
        </div>

        <CRMInput
          label="Video URL (restricted — only visible to roles with view_video perm)"
          value={form.videoUrl ?? ''}
          onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
          placeholder="https://…"
        />

        {/* Fabrics */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-gray-700">Fabrics needed</h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  fabrics: [...(form.fabrics ?? []), { fabricTypeId: '', role: 'main' }],
                })
              }
              className="inline-flex items-center gap-1 rounded-btn bg-accent px-2 py-1 text-[11px] font-semibold text-primary hover:bg-accent/70"
            >
              <Plus size={11} /> Add fabric
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.fabrics ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMSelect
                  options={[
                    { value: '', label: 'Select fabric…' },
                    ...fabricTypes.map((t) => ({ value: t.id, label: t.name })),
                  ]}
                  value={f.fabricTypeId}
                  onChange={(v) => updateFabric(i, { fabricTypeId: v as string })}
                  className="flex-1"
                />
                <CRMInput
                  className="w-36"
                  value={f.role}
                  placeholder="main / lining"
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
            <h3 className="text-xs font-semibold text-gray-700">Sizes & tracing</h3>
            <button
              onClick={() =>
                setForm({
                  ...form,
                  sizes: [...(form.sizes ?? []), { size: '', tracingMeters: 0 }],
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
                  className="flex-1"
                  type="number"
                  value={s.tracingMeters}
                  placeholder="Tracing (m)"
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
            <h3 className="text-xs font-semibold text-gray-700">Accessories per piece</h3>
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
              <Plus size={11} /> Add accessory
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {(form.accessories ?? []).map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <CRMSelect
                  options={[
                    { value: '', label: 'Select accessory…' },
                    ...accessories.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` })),
                  ]}
                  value={a.materialId}
                  onChange={(v) => updateAcc(i, { materialId: v as string })}
                  className="flex-1"
                />
                <CRMInput
                  className="w-32"
                  type="number"
                  value={a.quantityPerPiece}
                  placeholder="Qty"
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

        <CRMInput
          label="Notes"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </GlassModal>
  );
}
