import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton, CRMSelect } from '@/components/ui';
import { atelieApi, type Material, type MaterialCategory } from '@/services/atelieApi';
import { MaterialFormModal } from './MaterialFormModal';
import { MovementModal } from './MovementModal';

export function AccessoriesTab() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Material[]>([]);
  const [category, setCategory] = useState<string>('');
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Material | null>(null);
  const [moving, setMoving] = useState<Material | null>(null);

  // Fabric is deliberately excluded — it lives in the dedicated Fabric rolls tab
  // (rolls are not flat stock; each physical roll is distinct).
  const CATEGORY_FILTER = useMemo(
    () => [
      { value: '', label: t('atelie.accessories.filterAll') },
      { value: 'accessory', label: t('atelie.accessories.categoryAccessory') },
      { value: 'needle', label: t('atelie.accessories.categoryNeedle') },
      { value: 'thread', label: t('atelie.accessories.categoryThread') },
      { value: 'other', label: t('atelie.accessories.categoryOther') },
    ],
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await atelieApi.listMaterials({
        category: (category || undefined) as MaterialCategory | undefined,
        lowOnly,
      });
      // Hide fabric rows — they are migrated to the FabricRoll model and
      // deactivated, but legacy rows with fabric category are filtered here
      // as a belt-and-braces.
      setRows(data.filter((r) => r.category !== 'fabric'));
    } finally {
      setLoading(false);
    }
  }, [category, lowOnly]);

  useEffect(() => {
    load();
  }, [load]);

  async function deactivate(m: Material) {
    if (!window.confirm(t('atelie.accessories.confirmDeactivate', { name: m.name }))) return;
    await atelieApi.deactivateMaterial(m.id);
    load();
  }

  // Group by category for the UI (buttons/zippers together, all thread together).
  const grouped = rows.reduce<Record<string, Material[]>>((acc, m) => {
    const k = m.category;
    (acc[k] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CRMSelect
            options={CATEGORY_FILTER}
            value={category}
            onChange={(v) => setCategory(v as string)}
            className="w-48"
          />
          <button
            onClick={() => setLowOnly((v) => !v)}
            className={
              lowOnly
                ? 'inline-flex items-center gap-1.5 rounded-btn bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-600'
                : 'inline-flex items-center gap-1.5 rounded-btn border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50'
            }
          >
            <AlertTriangle size={12} /> {t('atelie.accessories.lowStockOnly')}
          </button>
        </div>

        <CRMButton
          leftIcon={<Plus size={14} />}
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t('atelie.accessories.newAccessory')}
        </CRMButton>
      </div>

      <GlassCard padding="none" className="overflow-hidden">
        {loading && rows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            {t('atelie.accessories.loading')}
          </p>
        )}
        {!loading && rows.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">
            {t('atelie.accessories.empty')}
          </p>
        )}
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat} className="border-b border-gray-100 last:border-b-0">
            <div className="bg-gray-50/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {cat}
            </div>
            <table className="w-full text-sm">
              <tbody>
                {items.map((m) => {
                  const isLow = m.stock <= m.lowStockThreshold;
                  return (
                    <tr key={m.id} className="border-t border-gray-100">
                      <td className="w-1/3 px-4 py-2.5 font-medium text-gray-900">{m.name}</td>
                      <td className="px-3 py-2.5 text-right">
                        <span
                          className={
                            isLow
                              ? 'font-semibold text-amber-600'
                              : 'font-semibold text-gray-900'
                          }
                        >
                          {m.stock}
                        </span>
                        <span className="ml-1 text-xs text-gray-400">{m.unit}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500">
                        {t('atelie.accessories.lowAt', { value: m.lowStockThreshold })}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-700">
                        {m.unitCost != null ? `${m.unitCost.toFixed(2)} MAD` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600">{m.supplier ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setMoving(m)}
                            className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
                            aria-label={t('atelie.accessories.recordMovement')}
                          >
                            <ArrowUpDown size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditing(m);
                              setFormOpen(true);
                            }}
                            className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-accent hover:text-primary"
                            aria-label={t('atelie.accessories.edit')}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => deactivate(m)}
                            className="flex h-7 w-7 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                            aria-label={t('atelie.accessories.deactivate')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </GlassCard>

      <MaterialFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={load}
        material={editing}
      />

      <MovementModal
        open={!!moving}
        onClose={() => setMoving(null)}
        material={moving}
        onSaved={load}
      />
    </div>
  );
}
