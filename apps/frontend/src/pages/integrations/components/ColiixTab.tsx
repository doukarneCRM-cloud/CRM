import { useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { GlassModal } from '@/components/ui/GlassModal';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { providersApi, type ShippingProvider } from '@/services/providersApi';
import { CitiesTab } from '@/pages/settings/components/CitiesTab';

const BACKEND_ORIGIN = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function buildWebhookUrl(secret: string) {
  return `${BACKEND_ORIGIN}/api/v1/integrations/coliix/webhook/${secret}`;
}

export function ColiixTab() {
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

  const load = useCallback(async () => {
    try {
      const p = await providersApi.get('coliix');
      setProvider(p);
      setApiBaseUrl(p.apiBaseUrl);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to load Coliix integration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to save settings');
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
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to clear API key');
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
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.response?.data?.error?.message ?? 'Test failed' });
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
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to toggle');
    } finally {
      setToggling(false);
    }
  };

  const handleRotate = async () => {
    if (!confirm('Rotate the webhook secret? The old URL will stop working — update Coliix with the new one.')) return;
    setRotating(true);
    try {
      const updated = await providersApi.rotateSecret('coliix');
      setProvider(updated);
    } catch (e: any) {
      setError(e?.response?.data?.error?.message ?? 'Failed to rotate secret');
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
        {error ?? 'Coliix integration not available.'}
      </div>
    );
  }

  const canSave = canManage && !saving && (apiKeyInput.trim().length > 0 || apiBaseUrl !== provider.apiBaseUrl);
  const webhookUrl = buildWebhookUrl(provider.webhookSecret);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Export confirmed orders to Coliix and receive instant status updates via webhook.
        </p>
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
            {provider.isActive ? 'Active' : 'Inactive'}
          </span>
          <CRMButton
            variant="secondary"
            size="sm"
            onClick={() => setCitiesOpen(true)}
            leftIcon={<MapPin size={14} />}
          >
            Cities
          </CRMButton>
          {canManage && (
            <CRMButton
              variant={provider.isActive ? 'secondary' : 'primary'}
              size="sm"
              onClick={handleToggle}
              disabled={toggling || (!provider.hasApiKey && !provider.isActive)}
            >
              {toggling ? '…' : provider.isActive ? 'Disable' : 'Enable'}
            </CRMButton>
          )}
        </div>
      </div>

      <GlassModal
        open={citiesOpen}
        onClose={() => setCitiesOpen(false)}
        title="Shipping cities"
        size="3xl"
      >
        <CitiesTab />
      </GlassModal>

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
              <h3 className="text-sm font-bold text-gray-900">Coliix API</h3>
              <p className="text-[11px] text-gray-400">Credentials used to export orders and fetch tracking.</p>
            </div>
          </div>

          <div className="space-y-3">
            <CRMInput
              label="API base URL"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              disabled={!canManage || saving}
              placeholder="https://api.coliix.com"
            />

            <div>
              <label className="text-sm font-medium text-gray-700">API key</label>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={
                      provider.hasApiKey
                        ? `Saved: ${provider.apiKeyMask ?? '••••'}  —  enter a new key to replace`
                        : 'Paste your Coliix API key'
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
              <p className="mt-1 text-[11px] text-gray-400">
                Stored encrypted at rest (AES-256-GCM). We never display the key back.
              </p>
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
                Last checked {new Date(provider.lastCheckedAt).toLocaleString()}
                {provider.lastError ? ` — ${provider.lastError}` : ' — OK'}
              </p>
            )}

            {canManage && (
              <div className="flex flex-wrap gap-2 pt-1">
                <CRMButton variant="primary" size="sm" onClick={handleSave} disabled={!canSave}>
                  {saving ? 'Saving…' : 'Save'}
                </CRMButton>
                <CRMButton
                  variant="secondary"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing || !provider.hasApiKey}
                  leftIcon={testing ? <Loader2 size={14} className="animate-spin" /> : undefined}
                >
                  {testing ? 'Testing…' : 'Test connection'}
                </CRMButton>
                {provider.hasApiKey && (
                  <CRMButton variant="ghost" size="sm" onClick={handleClearKey} disabled={saving}>
                    Clear key
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
              <h3 className="text-sm font-bold text-gray-900">Webhook URL</h3>
              <p className="text-[11px] text-gray-400">
                Paste this into Coliix's webhook settings to receive real-time status updates.
              </p>
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
                {copied ? 'Copied' : 'Copy'}
              </CRMButton>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              The secret in the URL authenticates Coliix to this CRM. Keep it private — if it leaks,
              rotate it below and update Coliix.
            </div>

            {canManage && (
              <CRMButton
                variant="ghost"
                size="sm"
                onClick={handleRotate}
                disabled={rotating}
                leftIcon={rotating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              >
                {rotating ? 'Rotating…' : 'Rotate secret'}
              </CRMButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
