import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Bell, Volume2, Play, User } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { useToastStore } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/services/api';
import {
  getSoundPrefs,
  setSoundPrefs,
  playNotificationSound,
} from '@/utils/sound';

// Expected confirmation code is fetched from the backend when the Danger Zone
// modal opens — the server is the source of truth (set via CRM_RESET_CODE
// env var), so the string never ships in the frontend bundle.

export default function SettingsPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const toastEnabled = useToastStore((s) => s.enabled);
  const setToastEnabled = useToastStore((s) => s.setEnabled);
  const pushToast = useToastStore((s) => s.push);

  const [soundEnabled, setSoundEnabled] = useState(() => getSoundPrefs().enabled);
  const [volume, setVolume] = useState(() => getSoundPrefs().volume);

  // Danger-zone modal state — kept local to the page; nothing outside the
  // confirm button ever needs it, so no store entry.
  const [resetOpen, setResetOpen] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [wipeOtherUsers, setWipeOtherUsers] = useState(false);
  // Second action — scoped wipe of just orders + customers (and rows that
  // reference them). Reuses the same expectedCode (one fetch covers both
  // modals); independent submitting state so the two CTAs don't fight.
  const [scopedOpen, setScopedOpen] = useState(false);
  const [scopedCode, setScopedCode] = useState('');
  const [scopedSubmitting, setScopedSubmitting] = useState(false);
  const [expectedCode, setExpectedCode] = useState<string | null>(null);
  const codeMatches = expectedCode !== null && resetCode === expectedCode;
  const scopedCodeMatches = expectedCode !== null && scopedCode === expectedCode;
  const canResetCRM = hasPermission('settings:reset_crm');

  async function handleResetCRM() {
    if (!codeMatches || resetSubmitting) return;
    setResetSubmitting(true);
    try {
      await api.post('/admin/reset-crm', {
        confirmationCode: resetCode,
        wipeOtherUsers,
      });
      pushToast({
        kind: 'confirmed',
        title: t('settings.danger.resetCompleteTitle'),
        body: t('settings.danger.resetCompleteBody'),
      });
      // Full reload so every cached list (orders, customers, products,
      // integrations…) refetches from a now-empty DB. Small delay so the
      // toast renders before the tab blanks.
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? t('settings.danger.resetFailedDefault');
      pushToast({
        kind: 'error',
        title: t('settings.danger.resetFailedTitle'),
        body: msg,
      });
      setResetSubmitting(false);
    }
  }

  function closeResetModal() {
    if (resetSubmitting) return;
    setResetOpen(false);
    setResetCode('');
    setWipeOtherUsers(false);
  }

  async function handleResetOrdersAndCustomers() {
    if (!scopedCodeMatches || scopedSubmitting) return;
    setScopedSubmitting(true);
    try {
      await api.post('/admin/reset-orders-customers', {
        confirmationCode: scopedCode,
      });
      pushToast({
        kind: 'confirmed',
        title: t('settings.danger.scopedCompleteTitle'),
        body: t('settings.danger.scopedCompleteBody'),
      });
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? t('settings.danger.resetFailedDefault');
      pushToast({
        kind: 'error',
        title: t('settings.danger.resetFailedTitle'),
        body: msg,
      });
      setScopedSubmitting(false);
    }
  }

  function closeScopedModal() {
    if (scopedSubmitting) return;
    setScopedOpen(false);
    setScopedCode('');
  }

  // Fetch the expected code from the backend whenever either danger-zone
  // modal opens. Failing means the server-side permission or endpoint
  // isn't available — the button stays disabled (codeMatches requires
  // expectedCode !== null).
  useEffect(() => {
    if (!resetOpen && !scopedOpen) {
      setExpectedCode(null);
      return;
    }
    let cancelled = false;
    api
      .get<{ code: string }>('/admin/reset-code')
      .then((res) => {
        if (!cancelled) setExpectedCode(res.data.code);
      })
      .catch(() => {
        if (!cancelled) {
          setExpectedCode(null);
          pushToast({
            kind: 'error',
            title: t('settings.danger.codeLoadFailedTitle'),
            body: t('settings.danger.codeLoadFailedBody'),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resetOpen, scopedOpen, pushToast, t]);

  // Persist sound prefs whenever they change — they are read live on every play
  useEffect(() => {
    setSoundPrefs({ enabled: soundEnabled, volume });
  }, [soundEnabled, volume]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">{t('settings.page.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('settings.page.subtitle')}
        </p>
      </header>

      {user && (
        <GlassCard padding="md">
          <SectionHeader icon={User} title={t('settings.account.title')} />
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-semibold text-primary">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
              <p className="truncate text-xs text-gray-500">{user.email}</p>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-primary">
              {user.role.label}
            </span>
          </div>
        </GlassCard>
      )}

      <GlassCard padding="md">
        <SectionHeader icon={Bell} title={t('settings.notifications.title')} />
        <p className="mt-1 text-xs text-gray-500">
          {t('settings.notifications.intro')}
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <ToggleRow
            label={t('settings.notifications.showLabel')}
            description={t('settings.notifications.showDescription')}
            checked={toastEnabled}
            onChange={setToastEnabled}
          />
          <div>
            <CRMButton
              size="sm"
              variant="secondary"
              leftIcon={<Play size={14} />}
              disabled={!toastEnabled}
              onClick={() =>
                pushToast({
                  kind: 'confirmed',
                  title: t('settings.notifications.testTitle'),
                  body: t('settings.notifications.testBody'),
                })
              }
            >
              {t('settings.notifications.sendTest')}
            </CRMButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="md">
        <SectionHeader icon={Volume2} title={t('settings.sounds.title')} />
        <p className="mt-1 text-xs text-gray-500">
          {t('settings.sounds.intro')}
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <ToggleRow
            label={t('settings.sounds.playLabel')}
            description={t('settings.sounds.playDescription')}
            checked={soundEnabled}
            onChange={setSoundEnabled}
          />

          <div className={soundEnabled ? '' : 'pointer-events-none opacity-50'}>
            <label className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span>{t('settings.sounds.volume')}</span>
              <span className="text-xs text-gray-400">{Math.round(volume * 100)}%</span>
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="mt-2 w-full accent-primary"
              disabled={!soundEnabled}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <CRMButton
              size="sm"
              variant="secondary"
              disabled={!soundEnabled}
              onClick={() => playNotificationSound('confirmed')}
            >
              {t('settings.sounds.previewConfirmed')}
            </CRMButton>
            <CRMButton
              size="sm"
              variant="ghost"
              disabled={!soundEnabled}
              onClick={() => playNotificationSound('assignment')}
            >
              {t('settings.sounds.previewAssignment')}
            </CRMButton>
          </div>
        </div>
      </GlassCard>

      {canResetCRM && (
        <GlassCard padding="md" className="border border-red-200">
          <SectionHeader icon={AlertTriangle} title={t('settings.danger.title')} tone="danger" />
          <p className="mt-1 text-xs text-gray-500">
            {t('settings.danger.intro')}
          </p>

          <div className="mt-4 rounded-card border border-amber-200 bg-amber-50/50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              {t('settings.danger.scopedTitle')}
            </p>
            <p className="mt-1 text-xs text-amber-800/90">
              {t('settings.danger.scopedDescription')}
            </p>
            <p className="mt-2 text-xs font-semibold text-amber-900">
              {t('settings.danger.cannotUndo')}
            </p>
            <div className="mt-3">
              <CRMButton
                size="sm"
                variant="secondary"
                leftIcon={<AlertTriangle size={14} />}
                onClick={() => setScopedOpen(true)}
              >
                {t('settings.danger.scopedButton')}
              </CRMButton>
            </div>
          </div>

          <div className="mt-4 rounded-card border border-red-200 bg-red-50/50 p-4">
            <p className="text-sm font-semibold text-red-800">
              {t('settings.danger.resetTitle')}
            </p>
            <p className="mt-1 text-xs text-red-700/90">
              {t('settings.danger.resetDescription')}
            </p>
            <p className="mt-2 text-xs font-semibold text-red-800">
              {t('settings.danger.cannotUndo')}
            </p>
            <div className="mt-3">
              <CRMButton
                size="sm"
                variant="danger"
                leftIcon={<AlertTriangle size={14} />}
                onClick={() => setResetOpen(true)}
              >
                {t('settings.danger.resetButton')}
              </CRMButton>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassModal
        open={resetOpen}
        onClose={closeResetModal}
        title={t('settings.danger.modalTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <CRMButton
              size="sm"
              variant="ghost"
              disabled={resetSubmitting}
              onClick={closeResetModal}
            >
              {t('settings.danger.cancel')}
            </CRMButton>
            <CRMButton
              size="sm"
              variant="danger"
              disabled={!codeMatches || resetSubmitting}
              onClick={handleResetCRM}
            >
              {resetSubmitting ? t('settings.danger.resetting') : t('settings.danger.resetEverything')}
            </CRMButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <div className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <p className="leading-snug text-red-800">
              <span className="font-semibold">{t('settings.danger.modalWarning')}</span>{t('settings.danger.modalWarningTail')}
            </p>
          </div>
          <p className="text-xs text-gray-500">
            {t('settings.danger.confirmInstruction')}
            {' '}
            {expectedCode ? (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-800">
                {expectedCode}
              </code>
            ) : (
              <span className="text-gray-400">{t('settings.danger.loadingCode')}</span>
            )}
          </p>
          <CRMInput
            autoFocus
            placeholder={t('settings.danger.confirmPlaceholder')}
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value)}
            disabled={resetSubmitting || expectedCode === null}
            error={
              expectedCode !== null && resetCode.length > 0 && !codeMatches
                ? t('settings.danger.codeMismatch')
                : undefined
            }
          />

          <label className="mt-1 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={wipeOtherUsers}
              onChange={(e) => setWipeOtherUsers(e.target.checked)}
              disabled={resetSubmitting}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400 text-red-600 focus:ring-red-500"
            />
            <span className="leading-snug">
              <span className="font-semibold">{t('settings.danger.wipeUsersLabel')}</span>{' '}
              {t('settings.danger.wipeUsersHint')}
            </span>
          </label>
        </div>
      </GlassModal>

      <GlassModal
        open={scopedOpen}
        onClose={closeScopedModal}
        title={t('settings.danger.scopedModalTitle')}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <CRMButton
              size="sm"
              variant="ghost"
              disabled={scopedSubmitting}
              onClick={closeScopedModal}
            >
              {t('settings.danger.cancel')}
            </CRMButton>
            <CRMButton
              size="sm"
              variant="danger"
              disabled={!scopedCodeMatches || scopedSubmitting}
              onClick={handleResetOrdersAndCustomers}
            >
              {scopedSubmitting
                ? t('settings.danger.resetting')
                : t('settings.danger.scopedConfirmCta')}
            </CRMButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <div className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
            <p className="leading-snug text-amber-900">
              <span className="font-semibold">{t('settings.danger.scopedModalWarning')}</span>{t('settings.danger.scopedModalWarningTail')}
            </p>
          </div>
          <p className="text-xs text-gray-500">
            {t('settings.danger.confirmInstruction')}{' '}
            {expectedCode ? (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-800">
                {expectedCode}
              </code>
            ) : (
              <span className="text-gray-400">{t('settings.danger.loadingCode')}</span>
            )}
          </p>
          <CRMInput
            autoFocus
            placeholder={t('settings.danger.confirmPlaceholder')}
            value={scopedCode}
            onChange={(e) => setScopedCode(e.target.value)}
            disabled={scopedSubmitting || expectedCode === null}
            error={
              expectedCode !== null && scopedCode.length > 0 && !scopedCodeMatches
                ? t('settings.danger.codeMismatch')
                : undefined
            }
          />
        </div>
      </GlassModal>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  tone = 'default',
}: {
  icon: typeof Bell;
  title: string;
  tone?: 'default' | 'danger';
}) {
  const isDanger = tone === 'danger';
  return (
    <div className="flex items-center gap-2">
      <div
        className={[
          'flex h-8 w-8 items-center justify-center rounded-lg',
          isDanger ? 'bg-red-100 text-red-600' : 'bg-accent text-primary',
        ].join(' ')}
      >
        <Icon size={16} />
      </div>
      <h2
        className={[
          'text-base font-semibold',
          isDanger ? 'text-red-800' : 'text-gray-900',
        ].join(' ')}
      >
        {title}
      </h2>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        {description && <p className="mt-0.5 text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-gray-300',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          ].join(' ')}
        />
      </button>
    </label>
  );
}
