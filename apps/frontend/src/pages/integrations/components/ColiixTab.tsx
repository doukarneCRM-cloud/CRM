import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Check,
  RefreshCw,
  Eye,
  EyeOff,
  Truck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  ListTree,
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { GlassModal } from '@/components/ui/GlassModal';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import {
  providersApi,
  coliixApi,
  type ShippingProvider,
  type RefreshAllResult,
  type ColiixWebhookHealth,
} from '@/services/providersApi';
import { CitiesTab } from '@/pages/settings/components/CitiesTab';
import { apiErrorMessage } from '@/lib/apiError';
import { ColiixMappingsModal } from './ColiixMappingsModal';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function buildWebhookUrl(secret: string) {
  return `${BACKEND_ORIGIN}/api/v1/integrations/coliix/webhook/${secret}`;
}

export function ColiixTab() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const canManage = hasPermission(PERMISSIONS.INTEGRATIONS_MANAGE);

  const [provider, setProvider] = useState<ShippingProvider | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [mappingsOpen, setMappingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<RefreshAllResult | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [health, setHealth] = useState<ColiixWebhookHealth | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await providersApi.get('coliix');
      setProvider(p);
      setApiBaseUrl(p.apiBaseUrl);
      setError(null);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.coliix.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  // Webhook health auto-refreshes every 30s while the tab is open so the
  // operator sees Coliix hits arrive in near-real-time without reloading.
  useEffect(() => {
    let cancelled = false;
    const fetchHealth = () => {
      coliixApi
        .webhookHealth()
        .then((h) => {
          if (!cancelled) setHealth(h);
        })
        .catch(() => {
          // Silent — non-critical metric. Keep last successful snapshot.
        });
    };
    fetchHealth();
    const handle = setInterval(fetchHealth, 30_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  const handleSave = async () => {
    if (!provider) return;
    setSaving(true);
    setTestResult(null);
    try {
      const payload: { apiKey?: string; apiBaseUrl?: string } = {};
      if (apiKeyInput.trim()) payload.apiKey = apiKeyInput.trim();
      if (apiBaseUrl !== provider.apiBaseUrl) payload.apiBaseUrl = apiBaseUrl;
      const updated = await providersApi.update('coliix', payload);
      setProvider(updated);
      setApiKeyInput('');
      setShowKey(false);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.coliix.saveFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    setSaving(true);
    try {
      const updated = await providersApi.update('coliix', { apiKey: null, isActive: false });
      setProvider(updated);
      setApiKeyInput('');
      setTestResult(null);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.coliix.clearFailed')));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await providersApi.test('coliix');
      setTestResult(result);
      // Refresh lastCheckedAt / lastError
      load();
    } catch (e: unknown) {
      setTestResult({ ok: false, message: apiErrorMessage(e, t('integrations.coliix.testFailed')) });
    } finally {
      setTesting(false);
    }
  };

  const handleToggle = async () => {
    if (!provider) return;
    setToggling(true);
    try {
      const updated = await providersApi.update('coliix', { isActive: !provider.isActive });
      setProvider(updated);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.coliix.toggleFailed')));
    } finally {
      setToggling(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm(t('integrations.coliix.rotateConfirm'))) return;
    setRotating(true);
    try {
      const updated = await providersApi.rotateSecret('coliix');
      setProvider(updated);
    } catch (e: unknown) {
      setError(apiErrorMessage(e, t('integrations.coliix.rotateFailed')));
    } finally {
      setRotating(false);
    }
  };

  const handleCopy = async () => {
    if (!provider) return;
    try {
      await navigator.clipboard.writeText(buildWebhookUrl(provider.webhookSecret));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const handleForceSync = async () => {
    setSyncing(true);
    setSyncError(null);
    setSyncResult(null);
    try {
      const result = await coliixApi.refreshAll();
      setSyncResult(result);
    } catch (e: unknown) {
      setSyncError(apiErrorMessage(e, t('integrations.coliix.syncFailed')));
    } finally {
      setSyncing(false);
    }
  };

  const [remapping, setRemapping] = useState(false);
  const [remapMessage, setRemapMessage] = useState<string | null>(null);
  const handleRemap = async () => {
    setRemapping(true);
    setRemapMessage(null);
    try {
      const result = await coliixApi.remapStatuses();
      setRemapMessage(
        t('integrations.coliix.remapResult', {
          scanned: result.scanned,
          changed: result.changed,
          unmapped: result.unmapped,
        }),
      );
    } catch (e: unknown) {
      setRemapMessage(apiErrorMessage(e, t('integrations.coliix.remapFailed')));
    } finally {
      setRemapping(false);
    }
  };

  const [dedupingLogs, setDedupingLogs] = useState(false);
  const [dedupeMessage, setDedupeMessage] = useState<string | null>(null);
  const handleDedupeLogs = async () => {
    setDedupingLogs(true);
    setDedupeMessage(null);
    try {
      const result = await coliixApi.dedupeLogs();
      setDedupeMessage(
        t('integrations.coliix.dedupeResult', {
          deleted: result.deleted,
          groups: result.duplicateGroups,
        }),
      );
    } catch (e: unknown) {
      setDedupeMessage(apiErrorMessage(e, t('integrations.coliix.dedupeFailed')));
    } finally {
      setDedupingLogs(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 animate-pulse rounded-2xl border border-gray-100 bg-gray-50" />
        ))}
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error ?? t('integrations.coliix.notAvailable')}
      </div>
    );
  }

  const canSave = canManage && !saving && (apiKeyInput.trim().length > 0 || apiBaseUrl !== provider.apiBaseUrl);
  const webhookUrl = buildWebhookUrl(provider.webhookSecret);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">{t('integrations.coliix.subtitle')}</p>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              provider.isActive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                provider.isActive ? 'bg-emerald-500' : 'bg-gray-400'
              }`}
            />
            {provider.isActive ? t('integrations.coliix.statusActive') : t('integrations.coliix.statusInactive')}
          </span>
          <CRMButton
            variant="secondary"
            size="sm"
            onClick={() => setCitiesOpen(true)}
            leftIcon={<MapPin size={14} />}
          >
            {t('integrations.coliix.citiesButton')}
          </CRMButton>
          <CRMButton
            variant="secondary"
            size="sm"
            onClick={() => setMappingsOpen(true)}
            leftIcon={<ListTree size={14} />}
          >
            {t('integrations.coliix.mappingsButton')}
          </CRMButton>
          {canManage && (
            <CRMButton
              variant={provider.isActive ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleToggle}
              disabled={toggling || (!provider.hasApiKey && !provider.isActive)}
            >
              {toggling ? '…' : provider.isActive ? t('integrations.coliix.disable') : t('integrations.coliix.enable')}
            </CRMButton>
          )}
        </div>
      </div>

      <GlassModal
        open={citiesOpen}
        onClose={() => setCitiesOpen(false)}
        title={t('integrations.coliix.citiesTitle')}
        size="3xl"
      >
        <CitiesTab />
      </GlassModal>

      <ColiixMappingsModal
        open={mappingsOpen}
        onClose={() => setMappingsOpen(false)}
      />

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* API credentials card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Truck size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('integrations.coliix.apiCardTitle')}</h3>
              <p className="text-[11px] text-gray-400">{t('integrations.coliix.apiCardSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-3">
            <CRMInput
              label={t('integrations.coliix.apiBaseUrl')}
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              disabled={!canManage || saving}
              placeholder={t('integrations.coliix.apiBaseUrlPlaceholder')}
            />

            <div>
              <label className="text-sm font-medium text-gray-700">{t('integrations.coliix.apiKey')}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      provider.hasApiKey
                        ? t('integrations.coliix.apiKeySaved', { mask: provider.apiKeyMask ?? '••••' })
                        : t('integrations.coliix.apiKeyPlaceholder')
                    }
                    disabled={!canManage || saving}
                    className="w-full rounded-input border border-gray-200 bg-white py-2.5 pl-3 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700"
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-gray-400">{t('integrations.coliix.apiKeyHelper')}</p>
            </div>

            {testResult && (
              <div
                className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${
                  testResult.ok
                    ? 'border border-emerald-100 bg-emerald-50 text-emerald-700'
                    : 'border border-red-100 bg-red-50 text-red-700'
                }`}
              >
                {testResult.ok ? <CheckCircle2 size={14} className="mt-0.5" /> : <AlertCircle size={14} className="mt-0.5" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {provider.lastCheckedAt && !testResult && (
              <p className="text-[11px] text-gray-400">
                {t('integrations.coliix.lastChecked', {
                  when: new Date(provider.lastCheckedAt).toLocaleString(),
                  tail: provider.lastError
                    ? t('integrations.coliix.lastCheckedError', { message: provider.lastError })
                    : t('integrations.coliix.lastCheckedOk'),
                })}
              </p>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <CRMButton variant="primary" size="sm" onClick={handleSave} disabled={!canSave}>
                  {saving ? t('integrations.coliix.saving') : t('integrations.coliix.save')}
                </CRMButton>
                <CRMButton
                  variant="secondary"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || !provider.hasApiKey}
                  leftIcon={testing ? <Loader2 size={14} className="animate-spin" /> : undefined}
                >
                  {testing ? t('integrations.coliix.testing') : t('integrations.coliix.testConnection')}
                </CRMButton>
                {provider.hasApiKey && (
                  <CRMButton variant="ghost" size="sm" onClick={handleClearKey} disabled={saving}>
                    {t('integrations.coliix.clearKey')}
                  </CRMButton>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Webhook card */}
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <RefreshCw size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">{t('integrations.coliix.webhookTitle')}</h3>
              <p className="text-[11px] text-gray-400">{t('integrations.coliix.webhookSubtitle')}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={webhookUrl}
                className="w-full rounded-input border border-gray-200 bg-gray-50 py-2.5 px-3 font-mono text-xs text-gray-700"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CRMButton
                variant="secondary"
                size="sm"
                onClick={handleCopy}
                leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}
              >
                {copied ? t('integrations.coliix.copied') : t('integrations.coliix.copy')}
              </CRMButton>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              {t('integrations.coliix.webhookWarning')}
            </div>

            {canManage && (
              <CRMButton
                variant="ghost"
                size="sm"
                onClick={handleRotate}
                disabled={rotating}
                leftIcon={rotating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              >
                {rotating ? t('integrations.coliix.rotating') : t('integrations.coliix.rotateSecret')}
              </CRMButton>
            )}

            {provider.isActive && provider.hasApiKey && health && (
              <WebhookHealthPanel health={health} />
            )}

            {canManage && provider.isActive && provider.hasApiKey && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {t('integrations.coliix.forceSyncTitle')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {t('integrations.coliix.forceSyncSubtitle')}
                    </p>
                  </div>
                  <CRMButton
                    variant="primary"
                    size="sm"
                    onClick={handleForceSync}
                    disabled={syncing}
                    leftIcon={
                      syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />
                    }
                  >
                    {syncing ? t('integrations.coliix.syncing') : t('integrations.coliix.syncNow')}
                  </CRMButton>
                </div>

                {syncError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {syncError}
                  </div>
                )}

                {syncResult && <SyncResultsPanel result={syncResult} />}

                {/* Re-map existing orders against the current rules — useful
                    after a mapping bugfix lands so historical orders inherit
                    the corrected enum without waiting for the next webhook. */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {t('integrations.coliix.remapTitle')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {t('integrations.coliix.remapSubtitle')}
                    </p>
                  </div>
                  <CRMButton
                    variant="secondary"
                    size="sm"
                    onClick={handleRemap}
                    disabled={remapping}
                    leftIcon={
                      remapping ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />
                    }
                  >
                    {remapping ? t('integrations.coliix.remapping') : t('integrations.coliix.remapCta')}
                  </CRMButton>
                </div>
                {remapMessage && (
                  <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {remapMessage}
                  </div>
                )}

                {/* Dedupe redundant shipping logs — one-shot fix for the
                    incident where the poller wrote a fresh log every 5 min
                    even when the Coliix wording hadn't changed. Keeps the
                    oldest row per (order, rawState). */}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">
                      {t('integrations.coliix.dedupeTitle')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {t('integrations.coliix.dedupeSubtitle')}
                    </p>
                  </div>
                  <CRMButton
                    variant="secondary"
                    size="sm"
                    onClick={handleDedupeLogs}
                    disabled={dedupingLogs}
                    leftIcon={
                      dedupingLogs ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />
                    }
                  >
                    {dedupingLogs ? t('integrations.coliix.deduping') : t('integrations.coliix.dedupeCta')}
                  </CRMButton>
                </div>
                {dedupeMessage && (
                  <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {dedupeMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Webhook health panel ────────────────────────────────────────────────────
// "Is Coliix actually calling us?" — the only way the user gets truly instant
// status updates is if Coliix invokes our webhook URL. This panel shows the
// last inbound timestamp + recent counts so the answer is visible without
// having to dig through server logs.

function formatRelative(iso: string | null, t: (k: string) => string): string {
  if (!iso) return t('integrations.coliix.health.never');
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return t('integrations.coliix.health.justNow');
  if (ms < 60_000) return t('integrations.coliix.health.justNow');
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

function WebhookHealthPanel({ health }: { health: ColiixWebhookHealth }) {
  const { t } = useTranslation();
  const isReceiving = health.count1h > 0;
  const isStale =
    !isReceiving && health.count24h === 0 && health.lastWebhookAt === null;
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">
          {t('integrations.coliix.health.title')}
        </p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            isReceiving
              ? 'bg-emerald-50 text-emerald-700'
              : isStale
              ? 'bg-red-50 text-red-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isReceiving ? 'bg-emerald-500' : isStale ? 'bg-red-500' : 'bg-amber-500'
            }`}
          />
          {isReceiving
            ? t('integrations.coliix.health.live')
            : isStale
            ? t('integrations.coliix.health.silent')
            : t('integrations.coliix.health.idle')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 text-center text-[11px]">
        <div>
          <p className="font-mono font-semibold text-gray-900">
            {formatRelative(health.lastWebhookAt, t)}
          </p>
          <p className="text-gray-400">{t('integrations.coliix.health.lastWebhook')}</p>
        </div>
        <div>
          <p className="font-mono font-semibold text-gray-900">{health.count1h}</p>
          <p className="text-gray-400">{t('integrations.coliix.health.last1h')}</p>
        </div>
        <div>
          <p className="font-mono font-semibold text-gray-900">{health.count24h}</p>
          <p className="text-gray-400">{t('integrations.coliix.health.last24h')}</p>
        </div>
      </div>
      {isStale && (
        <p className="mt-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-[11px] text-red-700">
          {t('integrations.coliix.health.silentHint')}
        </p>
      )}
      {health.recentRejections.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">
            {t('integrations.coliix.health.recentRejections', {
              count: health.recentRejections.length,
            })}
          </summary>
          <div className="mt-2 overflow-hidden rounded-xl border border-amber-100">
            <table className="w-full text-[10px]">
              <thead className="bg-amber-50 text-left text-amber-900">
                <tr>
                  <th className="px-2 py-1 font-semibold">
                    {t('integrations.coliix.health.rejCol.when')}
                  </th>
                  <th className="px-2 py-1 font-semibold">
                    {t('integrations.coliix.health.rejCol.code')}
                  </th>
                  <th className="px-2 py-1 font-semibold">
                    {t('integrations.coliix.health.rejCol.tracking')}
                  </th>
                  <th className="px-2 py-1 font-semibold">
                    {t('integrations.coliix.health.rejCol.state')}
                  </th>
                  <th className="px-2 py-1 font-semibold">
                    {t('integrations.coliix.health.rejCol.reason')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100 bg-white">
                {health.recentRejections.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {formatRelative(r.createdAt, t)}
                    </td>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {r.statusCode}
                      {!r.secretMatched && (
                        <span className="ml-1 text-red-600">
                          {t('integrations.coliix.health.rejCol.badSecret')}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {r.tracking ?? <span className="text-red-500">—</span>}
                    </td>
                    <td className="px-2 py-1 font-mono text-gray-700">
                      {r.rawState ?? <span className="text-red-500">—</span>}
                    </td>
                    <td className="px-2 py-1 text-gray-700">{r.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

// ─── Sync results panel (per-order Coliix response, mapping outcome) ─────────
// Drawn inline so admins can scan exactly what Coliix returned for each
// in-flight order: the raw state string, what the rules mapped it to, whether
// the order was actually updated, and any per-order error. This is the single
// most useful surface when "the webhook is configured but orders don't move".

function SyncResultsPanel({ result }: { result: RefreshAllResult }) {
  const { t } = useTranslation();
  const noteworthy = result.results.filter((r) => r.changed || !r.ok || r.mapped == null);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2 rounded-xl border border-gray-100 bg-gray-50/60 px-3 py-2 text-center text-[11px]">
        <div>
          <p className="font-semibold text-gray-900">{result.total}</p>
          <p className="text-gray-400">{t('integrations.coliix.syncTotal')}</p>
        </div>
        <div>
          <p className="font-semibold text-emerald-700">{result.changed}</p>
          <p className="text-gray-400">{t('integrations.coliix.syncChanged')}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-700">{result.unchanged}</p>
          <p className="text-gray-400">{t('integrations.coliix.syncUnchanged')}</p>
        </div>
        <div>
          <p className={`font-semibold ${result.failed > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {result.failed}
          </p>
          <p className="text-gray-400">{t('integrations.coliix.syncFailed_short')}</p>
        </div>
      </div>

      {noteworthy.length === 0 ? (
        <p className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-[11px] text-gray-500">
          {t('integrations.coliix.syncAllUpToDate')}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-100">
          <table className="w-full text-[11px]">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">{t('integrations.coliix.syncCol.ref')}</th>
                <th className="px-3 py-1.5 font-semibold">{t('integrations.coliix.syncCol.coliixState')}</th>
                <th className="px-3 py-1.5 font-semibold">{t('integrations.coliix.syncCol.mapped')}</th>
                <th className="px-3 py-1.5 font-semibold">{t('integrations.coliix.syncCol.outcome')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {noteworthy.map((r) => (
                <tr key={r.orderId}>
                  <td className="px-3 py-1.5 font-mono text-gray-700">{r.reference}</td>
                  <td className="px-3 py-1.5 text-gray-700">
                    {r.coliix?.currentState ?? <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.mapped ? (
                      <span className="rounded-badge bg-gray-100 px-1.5 py-0.5 font-medium text-gray-700">
                        {r.mapped}
                      </span>
                    ) : (
                      <span className="rounded-badge bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                        {t('integrations.coliix.syncCol.unknown')}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {r.error ? (
                      <span className="text-red-600">
                        {/* Defensive: never let an object slip through and
                            render as "[object Object]". The backend tries
                            very hard to send a string, but if a future
                            shape leaks through we JSON-stringify rather
                            than swallow info. */}
                        {typeof r.error === 'string'
                          ? r.error
                          : JSON.stringify(r.error)}
                        {r.errorStatus !== undefined && r.errorStatus !== 0 && (
                          <span className="ml-1 text-[10px] text-red-400">
                            ({r.errorStatus})
                          </span>
                        )}
                        {r.errorPayload !== undefined && r.errorPayload !== null && (
                          <details className="mt-1 text-[10px]">
                            <summary className="cursor-pointer text-red-500 hover:text-red-700">
                              {t('integrations.coliix.syncCol.rawResponse')}
                            </summary>
                            <pre className="mt-1 max-h-40 overflow-auto rounded bg-red-50 p-2 font-mono text-[10px] text-red-700">
                              {JSON.stringify(r.errorPayload, null, 2)}
                            </pre>
                          </details>
                        )}
                      </span>
                    ) : r.changed ? (
                      <span className="text-emerald-700">
                        {r.prevStatus} → {r.newStatus}
                      </span>
                    ) : r.mapped == null ? (
                      <span className="text-amber-700">{t('integrations.coliix.syncCol.notMapped')}</span>
                    ) : (
                      <span className="text-gray-500">{t('integrations.coliix.syncCol.unchanged')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
