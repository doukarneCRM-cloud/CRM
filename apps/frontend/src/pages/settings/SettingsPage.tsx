import { useEffect, useState } from 'react';
import { Bell, Volume2, Play, User } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { CRMButton } from '@/components/ui/CRMButton';
import { useToastStore } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import {
  getSoundPrefs,
  setSoundPrefs,
  playNotificationSound,
} from '@/utils/sound';

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const toastEnabled = useToastStore((s) => s.enabled);
  const setToastEnabled = useToastStore((s) => s.setEnabled);
  const pushToast = useToastStore((s) => s.push);

  const [soundEnabled, setSoundEnabled] = useState(() => getSoundPrefs().enabled);
  const [volume, setVolume] = useState(() => getSoundPrefs().volume);

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
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Bell;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon size={16} />
      </div>
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
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
