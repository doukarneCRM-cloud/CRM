import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Settings2 } from 'lucide-react';
import { GlassCard, CRMButton } from '@/components/ui';
import { atelieApi, type FabricTypeGroup } from '@/services/atelieApi';
import { FabricRollFormModal } from './FabricRollFormModal';
import { FabricTypeManagerModal } from './FabricTypeManagerModal';

export function FabricRollsTab() {
  const [tree, setTree] = useState<FabricTypeGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [openTypes, setOpenTypes] = useState<Record<string, boolean>>({});
  const [openColors, setOpenColors] = useState<Record<string, boolean>>({});
  const [rollFormOpen, setRollFormOpen] = useState(false);
  const [typesManagerOpen, setTypesManagerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await atelieApi.fabricRollsTree();
      setTree(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onAdjust(rollId: string, current: number) {
    const next = window.prompt(`Set remaining meters for this roll:`, String(current));
    if (next === null) return;
    const n = Number(next);
    if (Number.isNaN(n) || n < 0) return;
    await atelieApi.adjustFabricRoll(rollId, { remainingLength: n, reason: 'Manual adjust' });
    load();
  }

  async function onDelete(rollId: string) {
    if (!window.confirm('Delete this roll?')) return;
    try {
      await atelieApi.deleteFabricRoll(rollId);
      load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      window.alert(msg);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">
          Each physical roll is stored separately — same type + same color can vary in width,
          length, and price.
        </div>
        <div className="flex items-center gap-2">
          <CRMButton
            variant="secondary"
            leftIcon={<Settings2 size={14} />}
            onClick={() => setTypesManagerOpen(true)}
          >
            Fabric types
          </CRMButton>
          <CRMButton leftIcon={<Plus size={14} />} onClick={() => setRollFormOpen(true)}>
            Purchase roll
          </CRMButton>
        </div>
      </div>

      <GlassCard padding="md">
        {loading && tree.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
        )}
        {!loading && tree.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            No fabric rolls yet. Click "Purchase roll" to add the first one.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {tree.map((t) => {
            const typeOpen = openTypes[t.typeId] ?? true;
            return (
              <div key={t.typeId} className="rounded-input border border-gray-100">
                <button
                  onClick={() =>
                    setOpenTypes((s) => ({ ...s, [t.typeId]: !typeOpen }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    {typeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-semibold text-gray-900">{t.typeName}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {t.totalRemaining.toFixed(1)} m total
                  </span>
                </button>

                {typeOpen && (
                  <div className="space-y-1 border-t border-gray-100 px-3 py-2">
                    {t.colors.map((c) => {
                      const colorKey = `${t.typeId}::${c.color}`;
                      const colorOpen = openColors[colorKey] ?? false;
                      return (
                        <div key={colorKey} className="rounded-input bg-gray-50/40">
                          <button
                            onClick={() =>
                              setOpenColors((s) => ({ ...s, [colorKey]: !colorOpen }))
                            }
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-gray-100/70"
                          >
                            <div className="flex items-center gap-2">
                              {colorOpen ? (
                                <ChevronDown size={12} />
                              ) : (
                                <ChevronRight size={12} />
                              )}
                              <span className="text-xs font-medium text-gray-800">
                                {c.color}
                              </span>
                              <span className="text-[10px] text-gray-500">
                                ({c.rolls.length} roll{c.rolls.length === 1 ? '' : 's'})
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-500">
                              {c.totalRemaining.toFixed(1)} m
                            </span>
                          </button>

                          {colorOpen && (
                            <div className="border-t border-gray-100">
                              <table className="w-full text-xs">
                                <thead className="bg-white/60 text-[10px] uppercase text-gray-400">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left font-medium">Date</th>
                                    <th className="px-3 py-1.5 text-right font-medium">Width</th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      Length
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      Remaining
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      MAD / m
                                    </th>
                                    <th className="px-3 py-1.5 text-left font-medium">
                                      Supplier
                                    </th>
                                    <th className="px-3 py-1.5 text-right" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.rolls.map((r) => (
                                    <tr key={r.id} className="border-t border-gray-100">
                                      <td className="px-3 py-1.5 text-gray-700">
                                        {new Date(r.purchaseDate).toLocaleDateString()}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-gray-600">
                                        {r.widthCm ? `${r.widthCm} cm` : '—'}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-gray-600">
                                        {r.initialLength} m
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-semibold text-gray-900">
                                        {r.remainingLength.toFixed(1)} m
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-gray-700">
                                        {r.unitCostPerMeter.toFixed(2)}
                                      </td>
                                      <td className="px-3 py-1.5 text-gray-500">
                                        {r.supplier ?? '—'}
                                      </td>
                                      <td className="px-3 py-1.5 text-right">
                                        <div className="flex justify-end gap-1">
                                          <button
                                            onClick={() => onAdjust(r.id, r.remainingLength)}
                                            className="rounded-btn px-2 py-0.5 text-[10px] text-gray-500 hover:bg-white hover:text-primary"
                                          >
                                            Adjust
                                          </button>
                                          <button
                                            onClick={() => onDelete(r.id)}
                                            className="flex h-6 w-6 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                                            aria-label="Delete roll"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      <FabricRollFormModal
        open={rollFormOpen}
        onClose={() => setRollFormOpen(false)}
        onSaved={load}
      />

      <FabricTypeManagerModal
        open={typesManagerOpen}
        onClose={() => setTypesManagerOpen(false)}
        onChanged={load}
      />
    </div>
  );
}
