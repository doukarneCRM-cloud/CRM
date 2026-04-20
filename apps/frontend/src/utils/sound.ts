/**
 * Lightweight notification sounds. Uses the Web Audio API so we don't need to
 * ship an audio asset — tones are synthesized on demand.
 *
 * Browsers block autoplay until the user has interacted with the page; we
 * lazily create the AudioContext on first play so it runs inside the gesture
 * handler (login click, etc.) and stays usable thereafter.
 */

type ToneKind = 'assignment' | 'callback' | 'confirmed';

const PREFS_KEY = 'anaqatoki.sound.prefs';

interface SoundPrefs {
  enabled: boolean;
  volume: number; // 0..1
}

const DEFAULT_PREFS: SoundPrefs = { enabled: true, volume: 0.7 };

function readPrefs(): SoundPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      enabled: parsed.enabled ?? DEFAULT_PREFS.enabled,
      volume: Math.max(0, Math.min(1, parsed.volume ?? DEFAULT_PREFS.volume)),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function getSoundPrefs(): SoundPrefs {
  return readPrefs();
}

export function setSoundPrefs(next: Partial<SoundPrefs>) {
  if (typeof window === 'undefined') return;
  const merged = { ...readPrefs(), ...next };
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
}

let ctx: AudioContext | null = null;
let unlockListenersAttached = false;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx) return ctx;
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  return ctx;
}

/**
 * Attach one-time listeners that resume the AudioContext on the first user
 * gesture. Browsers refuse to play audio until they see a click/keydown on
 * the page, so we front-load that unlock — otherwise the first notification
 * sound silently fails with the context still "suspended".
 */
export function unlockAudioOnFirstGesture() {
  if (unlockListenersAttached) return;
  if (typeof window === 'undefined') return;
  unlockListenersAttached = true;

  const unlock = () => {
    const audio = getCtx();
    if (audio && audio.state === 'suspended') {
      audio.resume().catch(() => {});
    }
    // Silent tap so iOS actually "primes" the output
    try {
      if (audio) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(audio.destination);
        osc.start();
        osc.stop(audio.currentTime + 0.01);
      }
    } catch {
      /* ignore */
    }
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('touchstart', unlock);
  };

  window.addEventListener('click', unlock, { once: false });
  window.addEventListener('keydown', unlock, { once: false });
  window.addEventListener('touchstart', unlock, { once: false });
}

interface ToneSpec {
  hz: number;
  startAt: number;
  duration: number;
  type?: OscillatorType;
  peak?: number; // 0..1, relative to master volume
}

function playTones(tones: ToneSpec[]) {
  const prefs = readPrefs();
  if (!prefs.enabled) return;
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') {
    audio.resume().catch(() => {});
  }
  const now = audio.currentTime;
  const master = prefs.volume;
  for (const t of tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.value = t.hz;

    const start = now + t.startAt;
    const end = start + t.duration;
    const peak = Math.max(0.0002, (t.peak ?? 0.25) * master);
    // Quick attack + exponential release so it sounds clean, not clicky.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain).connect(audio.destination);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/**
 * Notification tones. Each sound is a short synthesized cue:
 *  • assignment — bright two-tone chirp (for agents)
 *  • callback   — softer pair (reminder)
 *  • confirmed  — ascending major-chord arpeggio (C-E-G-C) — cheerful
 *                 bell-like "success" cue for admins on order confirm
 */
export function playNotificationSound(kind: ToneKind = 'assignment') {
  if (kind === 'callback') {
    playTones([
      { hz: 660, startAt: 0,    duration: 0.18 },
      { hz: 550, startAt: 0.22, duration: 0.22 },
    ]);
    return;
  }

  if (kind === 'confirmed') {
    // C major arpeggio → resolving with a held top C. Triangle wave gives a
    // warm, bell-ish timbre vs. the brighter sine used elsewhere.
    playTones([
      { hz: 523.25, startAt: 0.00, duration: 0.14, type: 'triangle', peak: 0.22 }, // C5
      { hz: 659.25, startAt: 0.10, duration: 0.14, type: 'triangle', peak: 0.22 }, // E5
      { hz: 783.99, startAt: 0.20, duration: 0.14, type: 'triangle', peak: 0.22 }, // G5
      { hz: 1046.5, startAt: 0.30, duration: 0.45, type: 'triangle', peak: 0.28 }, // C6 (held)
    ]);
    return;
  }

  // assignment: bright two-tone chirp
  playTones([
    { hz: 880,  startAt: 0,    duration: 0.16 },
    { hz: 1175, startAt: 0.18, duration: 0.24 },
  ]);
}
