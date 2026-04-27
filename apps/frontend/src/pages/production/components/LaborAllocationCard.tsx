import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Coins } from 'lucide-react';
import { GlassCard, CRMSelect, CRMInput, CRMButton } from '@/components/ui';
import { productionApi, type LaborAllocationMode } from '@/services/productionApi';
import { useToastStore } from '@/store/toastStore';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  runId: string;
  initialMode: LaborAllocationMode;
  initialManualShare: number | null;
  canManage: boolean;
  onSaved: (mode: LaborAllocationMode, manualShare: number | null) => void;
}

const MODES: LaborAllocationMode[] = ['by_pieces', 'by_complexity', 'manual'];

/**
 * Per-run picker for which formula the week-close routine uses to split
 * the workshop's labor MAD across runs sharing the week. Manual mode
 * exposes a percent field that must sum to 100 across all runs in the
 * week (validated server-side at close time).
 */
export function LaborAllocationCard({
  runId,
  initialMode,
  initialManualShare,
  canManage,
  onSaved,
}: Props) {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);
  const [mode, setMode] = useState<LaborAllocationMode>(initialMode);
  const [share, setShare] = useState<number | ''>(initialManualShare ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await productionApi.setLaborAllocation(runId, {
        laborAllocation: mode,
        laborManualShare: mode === 'manual' && share !== '' ? share : null,
      });
      onSaved(mode, mode === 'manual' && share !== '' ? share : null);
      pushToast({
        kind: 'confirmed',
        title: t('production.labor.toast.savedTitle'),
      });
    } catch (err) {
      pushToast({
        kind: 'error',
        title: t('production.labor.toast.errorTitle'),
        body: apiErrorMessage(err, t('production.labor.toast.errorBody')),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <GlassCard padding="md">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <Coins size={14} className="text-gray-400" />
        {t('production.labor.title')}
      </h2>
      <p className="mb-3 text-[11px] text-gray-500">{t('production.labor.subtitle')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <CRMSelect
          className="min-w-[180px]"
          options={MODES.map((m) => ({
            value: m,
            label: t(`production.labor.mode.${m}`),
          }))}
          value={mode}
          onChange={(v) => setMode((Array.isArray(v) ? v[0] : v) as LaborAllocationMode)}
          disabled={!canManage || saving}
        />
        {mode === 'manual' && (
          <CRMInput
            className="w-32"
            type="number"
            label={t('production.labor.sharePercent')}
            value={share}
            disabled={!canManage || saving}
            onChange={(e) => {
              const v = e.target.value;
              setShare(v === '' ? '' : Math.max(0, Math.min(100, Number(v))));
            }}
          />
        )}
        {canManage && (
          <CRMButton size="sm" onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </CRMButton>
        )}
      </div>
      <p className="mt-2 text-[10px] text-gray-400">
        {mode === 'by_pieces'
          ? t('production.labor.hint.byPieces')
          : mode === 'by_complexity'
            ? t('production.labor.hint.byComplexity')
            : t('production.labor.hint.manual')}
      </p>
    </GlassCard>
  );
}
