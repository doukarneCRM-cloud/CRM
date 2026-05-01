import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, Copy, RefreshCw, Trash2, Edit3 } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { GlassCard } from '@/components/ui/GlassCard';
import { coliixApi, type CarrierAccount } from '@/services/coliixApi';
import { useToastStore } from '@/store/toastStore';
import { HealthStrip } from './HealthStrip';

const DEFAULT_BASE_URL = 'https://my.coliix.com';

function webhookUrlFor(secret: string): string {
  // Resolve against the backend origin so the URL we display points where
  // Coliix actually has to call. Falls back to window.location.origin if
  // VITE_API_URL isn't set (dev mode with the Vite proxy).
  const base = (import.meta.env.VITE_API_URL ?? window.location.origin).replace(/\/$/, '');
  return `${base}/api/v1/coliix/webhook/${secret}`;
}

interface FormState {
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string;
}

const EMPTY_FORM: FormState = {
  hubLabel: '',
  apiBaseUrl: DEFAULT_BASE_URL,
  apiKey: '',
};

export function SetupTab() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [accounts, setAccounts] = useState<CarrierAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await coliixApi.listAccounts();
      setAccounts(rows);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (a: CarrierAccount) => {
    setEditingId(a.id);
    setForm({ hubLabel: a.hubLabel, apiBaseUrl: a.apiBaseUrl, apiKey: '' });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async () => {
    if (!form.hubLabel.trim()) {
      toast({ kind: 'error', title: t('coliix.setup.errHubRequired') });
      return;
    }
    if (!editingId && !form.apiKey.trim()) {
      toast({ kind: 'error', title: t('coliix.setup.errKeyRequired') });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await coliixApi.updateAccount(editingId, {
          hubLabel: form.hubLabel.trim(),
          apiBaseUrl: form.apiBaseUrl.trim(),
          apiKey: form.apiKey.trim() ? form.apiKey.trim() : null,
        });
        toast({ kind: 'success', title: t('coliix.setup.saved') });
      } else {
        await coliixApi.createAccount({
          hubLabel: form.hubLabel.trim(),
          apiBaseUrl: form.apiBaseUrl.trim(),
          apiKey: form.apiKey.trim(),
        });
        toast({ kind: 'success', title: t('coliix.setup.created') });
      }
      cancel();
      refresh();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      toast({
        kind: 'error',
        title: e.response?.data?.error?.message ?? t('coliix.setup.errSave'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Per-hub health snapshot — green/red at-a-glance for the operator. */}
      <HealthStrip />

      {/* Heading + add button */}
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900">{t('coliix.setup.title')}</h2>
          <p className="text-xs text-gray-500">{t('coliix.setup.subtitle')}</p>
        </div>
        {!showForm && (
          <CRMButton variant="primary" size="sm" onClick={startCreate}>
            {accounts.length === 0 ? t('coliix.setup.addFirst') : t('coliix.setup.addAnother')}
          </CRMButton>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <GlassCard className="p-4">
          <h3 className="mb-3 text-sm font-bold text-gray-800">
            {editingId ? t('coliix.setup.editHub') : t('coliix.setup.newHub')}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={t('coliix.setup.hubLabel')}
              hint={t('coliix.setup.hubLabelHint')}
              value={form.hubLabel}
              onChange={(v) => setForm({ ...form, hubLabel: v })}
              placeholder="Agadir"
            />
            <Field
              label={t('coliix.setup.apiBaseUrl')}
              hint={t('coliix.setup.apiBaseUrlHint')}
              value={form.apiBaseUrl}
              onChange={(v) => setForm({ ...form, apiBaseUrl: v })}
              placeholder={DEFAULT_BASE_URL}
            />
            <Field
              label={t('coliix.setup.apiKey')}
              hint={
                editingId
                  ? t('coliix.setup.apiKeyEditHint')
                  : t('coliix.setup.apiKeyHint')
              }
              value={form.apiKey}
              onChange={(v) => setForm({ ...form, apiKey: v })}
              placeholder={editingId ? '•••• keep current ••••' : 'Paste your Coliix token'}
              type="password"
              className="sm:col-span-2"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <CRMButton variant="ghost" size="sm" onClick={cancel} disabled={saving}>
              {t('common.cancel')}
            </CRMButton>
            <CRMButton variant="primary" size="sm" onClick={submit} loading={saving}>
              {editingId ? t('common.save') : t('coliix.setup.create')}
            </CRMButton>
          </div>
        </GlassCard>
      )}

      {/* Accounts list */}
      {loading ? (
        <div className="skeleton h-32 w-full rounded-md" />
      ) : accounts.length === 0 && !showForm ? (
        <GlassCard className="p-6 text-center">
          <p className="text-sm text-gray-500">{t('coliix.setup.empty')}</p>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} onChanged={refresh} onEdit={() => startEdit(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── One account card ───────────────────────────────────────────────────────

function AccountRow({
  account,
  onChanged,
  onEdit,
}: {
  account: CarrierAccount;
  onChanged: () => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.push);
  const [testing, setTesting] = useState(false);

  const url = webhookUrlFor(account.webhookSecret);

  const test = async () => {
    setTesting(true);
    try {
      const res = await coliixApi.testAccount(account.id);
      if (res.ok) {
        toast({ kind: 'success', title: t('coliix.setup.testOk') });
      } else {
        // rawSample (when Coliix returned a non-JSON body) is surfaced
        // verbatim in the toast body so the operator can spot HTML
        // pages, wrong URLs, or schema differences without leaving the
        // page.
        toast({
          kind: 'error',
          title: res.reason ?? t('coliix.setup.testFail'),
          body: res.rawSample,
          durationMs: 12_000,
        });
      }
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.setup.testFail') });
    } finally {
      setTesting(false);
    }
  };

  const toggleActive = async () => {
    try {
      await coliixApi.updateAccount(account.id, { isActive: !account.isActive });
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.setup.errSave') });
    }
  };

  const rotate = async () => {
    if (!window.confirm(t('coliix.setup.confirmRotate'))) return;
    try {
      await coliixApi.rotateSecret(account.id);
      toast({ kind: 'success', title: t('coliix.setup.rotated') });
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.setup.errSave') });
    }
  };

  const remove = async () => {
    if (!window.confirm(t('coliix.setup.confirmDelete', { hub: account.hubLabel }))) return;
    try {
      await coliixApi.deleteAccount(account.id);
      toast({ kind: 'success', title: t('coliix.setup.deleted') });
      onChanged();
    } catch {
      toast({ kind: 'error', title: t('coliix.setup.errSave') });
    }
  };

  const copyUrl = async () => {
    await navigator.clipboard.writeText(url);
    toast({ kind: 'success', title: t('coliix.setup.copied') });
  };

  // Health badge — green if last test was successful, red if there's a
  // recorded error, gray if the account has never been tested.
  const healthBadge = !account.lastHealthAt
    ? { label: t('coliix.setup.statusUntested'), tone: 'bg-gray-100 text-gray-600' }
    : account.lastError
      ? { label: t('coliix.setup.statusError'), tone: 'bg-red-100 text-red-700' }
      : { label: t('coliix.setup.statusOk'), tone: 'bg-green-100 text-green-700' };

  return (
    <GlassCard className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-900">{account.hubLabel}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold ${healthBadge.tone}`}
            >
              {account.lastError ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
              {healthBadge.label}
            </span>
            <label className="ml-2 inline-flex items-center gap-1.5 text-[11px] text-gray-600">
              <input
                type="checkbox"
                checked={account.isActive}
                onChange={toggleActive}
                className="h-3 w-3"
              />
              {t('coliix.setup.active')}
            </label>
          </div>
          <p className="text-[11px] text-gray-500">{account.apiBaseUrl}</p>
          {account.apiKeyMask && (
            <p className="text-[11px] text-gray-400">
              {t('coliix.setup.keyMasked', { mask: account.apiKeyMask })}
            </p>
          )}
          {account.lastError && (
            <p className="mt-1 text-[11px] text-red-600">⚠ {account.lastError}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CRMButton variant="ghost" size="sm" onClick={test} loading={testing}>
            {t('coliix.setup.test')}
          </CRMButton>
          <CRMButton variant="ghost" size="sm" onClick={onEdit} leftIcon={<Edit3 size={12} />}>
            {t('common.edit')}
          </CRMButton>
          <CRMButton variant="ghost" size="sm" onClick={rotate} leftIcon={<RefreshCw size={12} />}>
            {t('coliix.setup.rotate')}
          </CRMButton>
          <CRMButton variant="ghost" size="sm" onClick={remove} leftIcon={<Trash2 size={12} />}>
            {t('common.delete')}
          </CRMButton>
        </div>
      </div>

      {/* Webhook URL row */}
      <div className="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {t('coliix.setup.webhookUrlLabel')}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-white px-2 py-1 text-[11px] font-mono text-gray-700">
            {url}
          </code>
          <CRMButton variant="ghost" size="sm" onClick={copyUrl} leftIcon={<Copy size={12} />}>
            {t('common.copy')}
          </CRMButton>
        </div>
        <p className="mt-1 text-[10px] italic text-gray-400">
          {t('coliix.setup.webhookUrlHint')}
        </p>
      </div>
    </GlassCard>
  );
}

// ─── Field helper ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: 'text' | 'password';
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ''}`}>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
      {hint && <p className="text-[10px] text-gray-400">{hint}</p>}
    </div>
  );
}
