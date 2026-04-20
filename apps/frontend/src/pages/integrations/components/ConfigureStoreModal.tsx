import { useEffect, useState, useCallback } from 'react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMSelect } from '@/components/ui/CRMSelect';
import {
  Save, AlertCircle, Info, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { integrationsApi, type Store, type ImportLog } from '@/services/integrationsApi';
import { cn } from '@/lib/cn';

interface Props {
  store: Store | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
}

const AUTO_DETECT_OPTION = { value: '', label: '— Auto-detect —' };

const CRM_FIELDS = [
  { key: 'name', label: 'Customer Name' },
  { key: 'phone', label: 'Customer Phone' },
  { key: 'city', label: 'Customer City' },
  { key: 'address', label: 'Customer Address' },
];

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

  const loadCheckoutFields = useCallback(async (storeId: string) => {
    setFieldsLoading(true);
    setFieldsError(null);
    try {
      const fields = await integrationsApi.detectCheckoutFields(storeId);
      setCheckoutFields(fields);
    } catch (e: any) {
      setCheckoutFields([]);
      setFieldsError(
        e?.response?.data?.error?.message
          ?? 'Could not detect checkout fields. Make sure the store is connected and has at least one order.',
      );
    } finally {
      setFieldsLoading(false);
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
  }, [store, open, loadCheckoutFields]);

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

  const handleSaveMapping = async () => {
    if (!store) return;
    setSaving(true);
    setError(null);
    try {
      await integrationsApi.updateFieldMapping(store.id, mapping);
      onUpdated();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to save mapping');
    } finally {
      setSaving(false);
    }
  };

  if (!store) return null;

  return (
    <GlassModal open={open} onClose={onClose} title={`Configure: ${store.name}`} size="xl">
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
            Field Mapping
          </button>
          <button
            onClick={() => { setTab('logs'); loadLogs(store.id, 1); }}
            className={cn(
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition',
              tab === 'logs' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
            )}
          >
            Sync Logs
          </button>
        </div>

        {/* Field Mapping */}
        {tab === 'mapping' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-gray-500">
                Only YouCan checkout fields detected in your recent orders are shown below.
                Leave on "Auto-detect" to let the system guess from customer/shipping defaults.
              </p>
              {store.isConnected && (
                <button
                  type="button"
                  onClick={() => loadCheckoutFields(store.id)}
                  disabled={fieldsLoading}
                  className="shrink-0 rounded-btn bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:bg-gray-200 disabled:opacity-60"
                >
                  {fieldsLoading ? 'Scanning…' : 'Rescan fields'}
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
                Scanning recent YouCan orders for active checkout fields…
              </p>
            ) : (
              CRM_FIELDS.map((field) => {
                const detected = checkoutFields ?? [];
                // Always surface whatever the store currently maps, even if
                // it's not in the detected list, so a legacy mapping isn't
                // silently dropped when nothing was detected yet.
                const currentValue = mapping[field.key] ?? '';
                const options = [
                  AUTO_DETECT_OPTION,
                  ...detected.map((f) => ({
                    value: f.path,
                    label: f.sample
                      ? `${f.label}  ·  "${f.sample}"`
                      : f.label,
                  })),
                  ...(currentValue && !detected.some((f) => f.path === currentValue)
                    ? [{ value: currentValue, label: `${currentValue}  ·  (not detected)` }]
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
                Save Mapping
              </CRMButton>
            </div>
          </div>
        )}

        {/* Logs */}
        {tab === 'logs' && (
          <div className="flex flex-col gap-2">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-gray-400">No logs yet</div>
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
                              {log.imported > 0 && <span className="text-emerald-600">{log.imported} imported</span>}
                              {log.skipped > 0 && <span className="text-gray-500">{log.skipped} skipped</span>}
                              {log.errors > 0 && <span className="text-red-600">{log.errors} errors</span>}
                            </div>
                          )}
                          {log.meta && (log.meta as any).details && (
                            <LogDetails details={(log.meta as any).details} />
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
                      Prev
                    </CRMButton>
                    <span className="text-[11px] text-gray-400">{logsPage} / {logsTotalPages}</span>
                    <CRMButton
                      variant="ghost"
                      size="sm"
                      disabled={logsPage >= logsTotalPages}
                      onClick={() => loadLogs(store.id, logsPage + 1)}
                    >
                      Next
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
  const [expanded, setExpanded] = useState(false);
  if (!details.length) return null;
  return (
    <div className="mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-primary"
      >
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {details.length} detail{details.length > 1 ? 's' : ''}
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
