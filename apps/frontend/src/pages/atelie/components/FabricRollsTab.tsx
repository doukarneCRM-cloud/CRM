import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Settings2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassCard, CRMButton } from '@/components/ui';
import { atelieApi, type FabricTypeGroup } from '@/services/atelieApi';
import { apiErrorMessage } from '@/lib/apiError';
import { FabricRollFormModal } from './FabricRollFormModal';
import { FabricTypeManagerModal } from './FabricTypeManagerModal';

export function FabricRollsTab() {
  const { t } = useTranslation();
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
    const next = window.prompt(t('atelie.fabricRolls.promptAdjust'), String(current));
    if (next === null) return;
    const n = Number(next);
    if (Number.isNaN(n) || n < 0) return;
    await atelieApi.adjustFabricRoll(rollId, {
      remainingLength: n,
      reason: t('atelie.fabricRolls.manualAdjustReason'),
    });
    load();
  }

  async function onDelete(rollId: string) {
    if (!window.confirm(t('atelie.fabricRolls.confirmDelete'))) return;
    try {
      await atelieApi.deleteFabricRoll(rollId);
      load();
    } catch (err: unknown) {
      window.alert(apiErrorMessage(err, t('atelie.fabricRolls.deleteFailed')));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">{t('atelie.fabricRolls.intro')}</div>
        <div className="flex items-center gap-2">
          <CRMButton
            variant="secondary"
            leftIcon={<Settings2 size={14} />}
            onClick={() => setTypesManagerOpen(true)}
          >
            {t('atelie.fabricRolls.fabricTypes')}
          </CRMButton>
          <CRMButton leftIcon={<Plus size={14} />} onClick={() => setRollFormOpen(true)}>
            {t('atelie.fabricRolls.purchaseRoll')}
          </CRMButton>
        </div>
      </div>

      <GlassCard padding="md">
        {loading && tree.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">{t('atelie.fabricRolls.loading')}</p>
        )}
        {!loading && tree.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">
            {t('atelie.fabricRolls.empty')}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {tree.map((row) => {
            const typeOpen = openTypes[row.typeId] ?? true;
            return (
              <div key={row.typeId} className="rounded-input border border-gray-100">
                <button
                  onClick={() =>
                    setOpenTypes((s) => ({ ...s, [row.typeId]: !typeOpen }))
                  }
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    {typeOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span className="text-sm font-semibold text-gray-900">{row.typeName}</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {t('atelie.fabricRolls.totalMeters', { value: row.totalRemaining.toFixed(1) })}
                  </span>
                </button>

                {typeOpen && (
                  <div className="space-y-1 border-t border-gray-100 px-3 py-2">
                    {row.colors.map((c) => {
                      const colorKey = `${row.typeId}::${c.color}`;
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
                                {t('atelie.fabricRolls.rolls', { count: c.rolls.length })}
                              </span>
                            </div>
                            <span className="text-[11px] text-gray-500">
                              {t('atelie.fabricRolls.meters', { value: c.totalRemaining.toFixed(1) })}
                            </span>
                          </button>

                          {colorOpen && (
                            <div className="border-t border-gray-100">
                              <table className="w-full text-xs">
                                <thead className="bg-white/60 text-[10px] uppercase text-gray-400">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left font-medium">
                                      {t('atelie.fabricRolls.columns.date')}
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      {t('atelie.fabricRolls.columns.width')}
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      {t('atelie.fabricRolls.columns.length')}
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      {t('atelie.fabricRolls.columns.remaining')}
                                    </th>
                                    <th className="px-3 py-1.5 text-right font-medium">
                                      {t('atelie.fabricRolls.columns.pricePerMeter')}
                                    </th>
                                    <th className="px-3 py-1.5 text-left font-medium">
                                      {t('atelie.fabricRolls.columns.supplier')}
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
                                        {r.widthCm
                                          ? t('atelie.fabricRolls.widthCm', { value: r.widthCm })
                                          : '—'}
                                      </td>
                                      <td className="px-3 py-1.5 text-right text-gray-600">
                                        {t('atelie.fabricRolls.lengthM', { value: r.initialLength })}
                                      </td>
                                      <td className="px-3 py-1.5 text-right font-semibold text-gray-900">
                                        {t('atelie.fabricRolls.lengthM', { value: r.remainingLength.toFixed(1) })}
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
                                            {t('atelie.fabricRolls.adjust')}
                                          </button>
                                          <button
                                            onClick={() => onDelete(r.id)}
                                            className="flex h-6 w-6 items-center justify-center rounded-btn text-gray-400 hover:bg-red-50 hover:text-red-500"
                                            aria-label={t('atelie.fabricRolls.deleteRoll')}
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
