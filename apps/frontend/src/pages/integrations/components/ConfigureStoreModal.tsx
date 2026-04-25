import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import {
  Save, AlertCircle, Info, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { integrationsApi, type Store, type ImportLog } from '@/services/integrationsApi';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/lib/apiError';

interface Props {
  store: Store | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

interface CheckoutField {
  path: string;
  label: string;
  sample: string;
}

const LOG_LEVEL_ICON: Record<string, { icon: React.ElementType; color: string }> = {
  info: { icon: Info, color: 'text-blue-500' },
  warning: { icon: AlertTriangle, color: 'text-amber-500' },
  error: { icon: AlertCircle, color: 'text-red-500' },
};

export function ConfigureStoreModal({ store, open, onClose, onUpdated }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'mapping' | 'logs'>('mapping');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);
  const [checkoutFields, setCheckoutFields] = useState<CheckoutField[] | null>(null);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);

  const crmFields = useMemo(
    () => [
      { key: 'name', label: t('integrations.configureStore.crmFields.name') },
      { key: 'phone', label: t('integrations.configureStore.crmFields.phone') },
      { key: 'city', label: t('integrations.configureStore.crmFields.city') },
      { key: 'address', label: t('integrations.configureStore.crmFields.address') },
    ],
    [t],
  );

  const autoDetectOption = useMemo(
    () => ({ value: '', label: t('integrations.configureStore.autoDetect') }),
    [t],
  );

  const loadCheckoutFields = useCallback(async (storeId: string) => {
    setFieldsLoading(true);
    setFieldsError(null);
    try {
      const fields = await integrationsApi.detectCheckoutFields(storeId);
      setCheckoutFields(fields);
    } catch (e: unknown) {
      setCheckoutFields([]);
      setFieldsError(apiErrorMessage(e, t('integrations.configureStore.fieldsError')));
    } finally {
      setFieldsLoading(false);
    }
  }, [t]);

  const loadLogs = useCallback(async (storeId: string, page: number) => {
    setLogsLoading(true);
    try {
      const result = await integrationsApi.getLogs(storeId, page, 30);
      setLogs(result.data);
      setLogsPage(page);
      setLogsTotalPages(result.pagination.totalPages);
    } catch {
      // ignore
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (store && open) {
      setMapping(store.fieldMapping ?? {});
      setTab('mapping');
      setCheckoutFields(null);
      setFieldsError(null);
      loadLogs(store.id, 1);
      if (store.isConnected) loadCheckoutFields(store.id);
    }
  }, [store, open, loadCheckoutFields, loadLogs]);

  const handleSaveMapping = async () => {
    if (!store) return;
    setSaving(true);
    setError(null);
    try {
      await integrationsApi.updateFieldMapping(store.id, mapping);
      onUpdated();
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.configureStore.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  if (!store) return null;

  return (
    <GlassModal open={open} onClose={onClose} title={t('integrations.configureStore.title', { name: store.name })} size="xl">
      <div className="flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => setTab('mapping')}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition',
              tab === 'mapping' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t('integrations.configureStore.tabMapping')}
          </button>
          <button
            onClick={() => { setTab('logs'); loadLogs(store.id, 1); }}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition',
              tab === 'logs' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {t('integrations.configureStore.tabLogs')}
          </button>
        </div>

        {/* Field Mapping */}
        {tab === 'mapping' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-gray-500">{t('integrations.configureStore.mappingIntro')}</p>
              {store.isConnected && (
                <button
                  type="button"
                  onClick={() => loadCheckoutFields(store.id)}
                  disabled={fieldsLoading}
                  className="shrink-0 rounded-btn bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-60"
                >
                  {fieldsLoading ? t('integrations.configureStore.scanning') : t('integrations.configureStore.rescanFields')}
                </button>
              )}
            </div>

            {fieldsError && (
              <p className="rounded-btn bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">
                {fieldsError}
              </p>
            )}

            {fieldsLoading ? (
              <p className="rounded-btn bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
                {t('integrations.configureStore.scanningOrders')}
              </p>
            ) : (
              crmFields.map((field) => {
                const detected = checkoutFields ?? [];
                const currentValue = mapping[field.key] ?? '';
                const options = [
                  autoDetectOption,
                  ...detected.map((f) => ({
                    value: f.path,
                    label: f.sample
                      ? t('integrations.configureStore.optionWithSample', { label: f.label, sample: f.sample })
                      : f.label,
                  })),
                  ...(currentValue && !detected.some((f) => f.path === currentValue)
                    ? [{ value: currentValue, label: t('integrations.configureStore.notDetected', { path: currentValue }) }]
                    : []),
                ];
                return (
                  <div key={field.key} className="flex items-center gap-3">
                    <div className="w-36 shrink-0">
                      <span className="text-xs font-semibold text-gray-700">{field.label}</span>
                    </div>
                    <span className="text-gray-300">←</span>
                    <div className="flex-1">
                      <CRMSelect
                        value={currentValue}
                        onChange={(val) =>
                          setMapping({ ...mapping, [field.key]: Array.isArray(val) ? val[0] : val })
                        }
                        options={options}
                      />
                    </div>
                  </div>
                );
              })
            )}

            {error && (
              <p className="rounded-btn bg-red-50 px-3 py-2 text-[11px] font-medium text-red-700">{error}</p>
            )}

            <div className="flex justify-end pt-2">
              <CRMButton variant="primary" size="sm" leftIcon={<Save size={12} />} onClick={handleSaveMapping} loading={saving}>
                {t('integrations.configureStore.saveMapping')}
              </CRMButton>
            </div>
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <div className="flex flex-col gap-2">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400">{t('integrations.configureStore.logsLoading')}</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400">{t('integrations.configureStore.logsEmpty')}</div>
            ) : (
              <>
                <div className="max-h-[400px] overflow-y-auto">
                  {logs.map((log) => {
                    const cfg = LOG_LEVEL_ICON[log.level] ?? LOG_LEVEL_ICON.info;
                    const Icon = cfg.icon;
                    return (
                      <div key={log.id} className="flex items-start gap-2.5 border-b border-gray-50 py-2.5 last:border-0">
                        <Icon size={14} className={cn('mt-0.5 shrink-0', cfg.color)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className={cn(
                              'rounded-badge px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                              log.level === 'error' ? 'bg-red-50 text-red-600' :
                              log.level === 'warning' ? 'bg-amber-50 text-amber-600' :
                              'bg-blue-50 text-blue-600',
                            )}>
                              {log.type.replace(/_/g, ' ')}
                            </span>
                            <span className="shrink-0 text-[10px] text-gray-400">
                              {new Date(log.createdAt).toLocaleString('fr-MA', {
                                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-gray-700">{log.message}</p>
                          {(log.imported > 0 || log.skipped > 0 || log.errors > 0) && (
                            <div className="mt-1 flex gap-3 text-[10px]">
                              {log.imported > 0 && <span className="text-emerald-600">{t('integrations.configureStore.importedCount', { count: log.imported })}</span>}
                              {log.skipped > 0 && <span className="text-gray-500">{t('integrations.configureStore.skippedCount', { count: log.skipped })}</span>}
                              {log.errors > 0 && <span className="text-red-600">{t('integrations.configureStore.errorsCount', { count: log.errors })}</span>}
                            </div>
                          )}
                          {log.meta && (log.meta as { details?: string[] }).details && (
                            <LogDetails details={(log.meta as { details: string[] }).details} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {logsTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <CRMButton
                      variant="ghost"
                      size="sm"
                      disabled={logsPage <= 1}
                      onClick={() => loadLogs(store.id, logsPage - 1)}
                    >
                      {t('integrations.configureStore.prev')}
                    </CRMButton>
                    <span className="text-[11px] text-gray-400">{logsPage} / {logsTotalPages}</span>
                    <CRMButton
                      variant="ghost"
                      size="sm"
                      disabled={logsPage >= logsTotalPages}
                      onClick={() => loadLogs(store.id, logsPage + 1)}
                    >
                      {t('integrations.configureStore.next')}
                    </CRMButton>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </GlassModal>
  );
}

function LogDetails({ details }: { details: string[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  if (!details.length) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-primary"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {t('integrations.configureStore.detailsToggle', { count: details.length })}
      </button>
      {expanded && (
        <div className="mt-1 max-h-32 overflow-y-auto rounded-btn bg-gray-50 p-2 text-[10px] text-gray-600">
          {details.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}
    </div>
  );
}
