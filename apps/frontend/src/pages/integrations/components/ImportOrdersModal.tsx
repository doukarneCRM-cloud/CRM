import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { Download } from 'lucide-react';
import { integrationsApi, type ImportResult } from '@/services/integrationsApi';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  storeId: string | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}

export function ImportOrdersModal({ storeId, open, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'preset' | 'custom' | 'all'>('preset');
  const [presetCount, setPresetCount] = useState(50);
  const [customCount, setCustomCount] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presets = useMemo(
    () => [
      { label: t('integrations.importOrders.presetLast', { count: 10 }), value: 10 },
      { label: t('integrations.importOrders.presetLast', { count: 50 }), value: 50 },
      { label: t('integrations.importOrders.presetLast', { count: 100 }), value: 100 },
      { label: t('integrations.importOrders.presetLast', { count: 200 }), value: 200 },
    ],
    [t],
  );

  const handleImport = async () => {
    if (!storeId) return;
    setImporting(true);
    setError(null);
    try {
      let count: number | undefined;
      if (mode === 'preset') count = presetCount;
      else if (mode === 'custom') count = parseInt(customCount, 10) || undefined;
      // mode === 'all' → count undefined → imports all

      const r = await integrationsApi.importOrders(storeId, count);
      setResult(r);
      onDone();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.importOrders.importFailed')));
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <GlassModal open={open} onClose={handleClose} title={t('integrations.importOrders.title')} size="md">
      <div className="flex flex-col gap-4">
        {/* Result */}
        {result ? (
          <div className={cn(
            'rounded-xl border p-4',
            result.errors > 0 ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50',
          )}>
            <p className="text-sm font-bold text-gray-900">{t('integrations.importOrders.importComplete')}</p>
            <div className="mt-2 flex gap-4 text-xs">
              <span className="text-emerald-700">{t('integrations.importOrders.importedLabel', { count: result.imported })}</span>
              <span className="text-gray-500">{t('integrations.importOrders.alreadyExist', { count: result.skipped })}</span>
              <span className="text-red-600">{t('integrations.importOrders.errorsLabel', { count: result.errors })}</span>
            </div>
            {result.details.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-btn bg-white/80 p-2 text-[11px] text-gray-600">
                {result.details.map((d, i) => <p key={i}>{d}</p>)}
              </div>
            )}
            <CRMButton variant="ghost" size="sm" onClick={handleClose} className="mt-3">
              {t('integrations.importOrders.close')}
            </CRMButton>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-500">{t('integrations.importOrders.intro')}</p>

            {/* Mode selector */}
            <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
              {(['preset', 'custom', 'all'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'flex-1 rounded-lg py-1.5 text-xs font-semibold transition',
                    mode === m ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {m === 'preset'
                    ? t('integrations.importOrders.modeQuick')
                    : m === 'custom'
                      ? t('integrations.importOrders.modeCustom')
                      : t('integrations.importOrders.modeAll')}
                </button>
              ))}
            </div>

            {/* Preset */}
            {mode === 'preset' && (
              <div className="grid grid-cols-4 gap-2">
                {presets.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setPresetCount(p.value)}
                    className={cn(
                      'rounded-xl border py-3 text-center text-xs font-semibold transition',
                      presetCount === p.value
                        ? 'border-primary bg-accent/50 text-primary ring-1 ring-primary/20'
                        : 'border-gray-100 text-gray-600 hover:border-gray-200',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* Custom */}
            {mode === 'custom' && (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  {t('integrations.importOrders.customLabel')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={customCount}
                  onChange={(e) => setCustomCount(e.target.value)}
                  placeholder={t('integrations.importOrders.customPlaceholder')}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            {/* All */}
            {mode === 'all' && (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-700">
                {t('integrations.importOrders.allWarningPrefix')}
                <b>{t('integrations.importOrders.allWarningBold')}</b>
                {t('integrations.importOrders.allWarningSuffix')}
              </div>
            )}

            {error && (
              <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <CRMButton variant="ghost" size="sm" onClick={handleClose} disabled={importing}>
                {t('common.cancel')}
              </CRMButton>
              <CRMButton
                variant="primary"
                size="sm"
                leftIcon={<Download size={12} />}
                onClick={handleImport}
                loading={importing}
                disabled={mode === 'custom' && !customCount}
              >
                {t('integrations.importOrders.startImport')}
              </CRMButton>
            </div>
          </>
        )}
      </div>
    </GlassModal>
  );
}
