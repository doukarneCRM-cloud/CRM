import { useEffect, useState } from 'react';
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

// Must match backend src/modules/admin/admin.service.ts::RESET_CODE. The
// server re-validates the same string, so changing just the frontend won't
// weaken the gate.
const RESET_CONFIRMATION_CODE = 'Newlifebb123';

export default function SettingsPage() {
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
  const codeMatches = resetCode === RESET_CONFIRMATION_CODE;
  const canResetCRM = hasPermission('settings:reset_crm');

  async function handleResetCRM() {
    if (!codeMatches || resetSubmitting) return;
    setResetSubmitting(true);
    try {
      await api.post('/admin/reset-crm', {
        confirmationCode: resetCode,
      });
      pushToast({
        kind: 'confirmed',
        title: 'CRM reset complete',
        body: 'All business data cleared. Reloading…',
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
          ?.response?.data?.error?.message ?? 'Reset failed';
      pushToast({
        kind: 'error',
        title: 'Reset failed',
        body: msg,
      });
      setResetSubmitting(false);
    }
  }

  function closeResetModal() {
    if (resetSubmitting) return;
    setResetOpen(false);
    setResetCode('');
  }

  // Persist sound prefs whenever they change — they are read live on every play
  useEffect(() => {
    setSoundPrefs({ enabled: soundEnabled, volume });
  }, [soundEnabled, volume]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage how Anaqatoki looks, sounds, and notifies you.
        </p>
      </header>

      {user && (
        <GlassCard padding="md">
          <SectionHeader icon={User} title="Account" />
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
        <SectionHeader icon={Bell} title="Notifications" />
        <p className="mt-1 text-xs text-gray-500">
          Pop-ups that slide in from the bottom-right when orders are assigned to
          you or confirmed by your team.
        </p>
        <div className="mt-5 flex flex-col gap-3">
          <ToggleRow
            label="Show notification pop-ups"
            description="When disabled, you won't see any toasts — socket events still run in the background."
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
                  title: 'Test notification',
                  body: 'This is how confirmed orders will appear.',
                })
              }
            >
              Send test notification
            </CRMButton>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="md">
        <SectionHeader icon={Volume2} title="Sounds" />
        <p className="mt-1 text-xs text-gray-500">
          Short tones play when you're assigned an order (agents) or when an
          order is confirmed (admins).
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <ToggleRow
            label="Play notification sounds"
            description="Turn off if you prefer silent alerts."
            checked={soundEnabled}
            onChange={setSoundEnabled}
          />

          <div className={soundEnabled ? '' : 'pointer-events-none opacity-50'}>
            <label className="flex items-center justify-between text-sm font-medium text-gray-700">
              <span>Volume</span>
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
              Preview confirmed
            </CRMButton>
            <CRMButton
              size="sm"
              variant="ghost"
              disabled={!soundEnabled}
              onClick={() => playNotificationSound('assignment')}
            >
              Preview assignment
            </CRMButton>
          </div>
        </div>
      </GlassCard>

      {canResetCRM && (
        <GlassCard padding="md" className="border border-red-200">
          <SectionHeader icon={AlertTriangle} title="Danger zone" tone="danger" />
          <p className="mt-1 text-xs text-gray-500">
            Wipe all business data and start fresh. Useful after a test phase
            or when migrating to a new workflow.
          </p>

          <div className="mt-4 rounded-card border border-red-200 bg-red-50/50 p-4">
            <p className="text-sm font-semibold text-red-800">
              Reset full CRM
            </p>
            <p className="mt-1 text-xs text-red-700/90">
              Deletes every order, customer, product, variant, integration
              (Youcan stores), message log, notification, commission record,
              expense, automation template, WhatsApp session, and atelie row
              (employees, tasks, production runs, fabrics, materials). Your
              user account, roles, and app settings are preserved.
            </p>
            <p className="mt-2 text-xs font-semibold text-red-800">
              This cannot be undone.
            </p>
            <div className="mt-3">
              <CRMButton
                size="sm"
                variant="danger"
                leftIcon={<AlertTriangle size={14} />}
                onClick={() => setResetOpen(true)}
              >
                Reset full CRM…
              </CRMButton>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassModal
        open={resetOpen}
        onClose={closeResetModal}
        title="Reset full CRM"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <CRMButton
              size="sm"
              variant="ghost"
              disabled={resetSubmitting}
              onClick={closeResetModal}
            >
              Cancel
            </CRMButton>
            <CRMButton
              size="sm"
              variant="danger"
              disabled={!codeMatches || resetSubmitting}
              onClick={handleResetCRM}
            >
              {resetSubmitting ? 'Resetting…' : 'Reset everything'}
            </CRMButton>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-gray-700">
          <div className="flex items-start gap-2 rounded-card border border-red-200 bg-red-50 p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
            <p className="leading-snug text-red-800">
              <span className="font-semibold">All business data will be
              deleted permanently</span> — orders, customers, products,
              integrations, atelie records, messages, notifications,
              commissions, expenses. Users and roles stay intact.
            </p>
          </div>
          <p className="text-xs text-gray-500">
            To confirm, type the code below exactly:
            {' '}<code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-800">
              {RESET_CONFIRMATION_CODE}
            </code>
          </p>
          <CRMInput
            autoFocus
            placeholder="Type the confirmation code"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value)}
            disabled={resetSubmitting}
            error={
              resetCode.length > 0 && !codeMatches
                ? 'Code does not match'
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
