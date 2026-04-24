import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanLine, CheckCircle2, XCircle, AlertTriangle, Keyboard } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';
import { cn } from '@/lib/cn';
import { api } from '@/services/api';

/**
 * Phone-side continuous scanner. The agent opens this page on their phone,
 * points the camera at each parcel's barcode, and the backend pushes the
 * resolved order to this same user's laptop over socket.io.
 *
 * The phone only needs a found/not-found toast — the laptop is where the
 * agent actually verifies. Debounce duplicate scans (same code within 2s)
 * so a lingering barcode doesn't fire twice.
 */

const READER_ID = 'phone-scan-reader';

type Feedback =
  | { kind: 'idle' }
  | { kind: 'found'; reference: string }
  | { kind: 'not_found'; code: string }
  | { kind: 'error'; message: string };

function beep(ok: boolean) {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(ok ? 1200 : 400, ctx.currentTime);
    if (ok) osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* ignore */
  }
}

export default function PhoneScanPage() {
  const { t } = useTranslation();
  const [feedback, setFeedback] = useState<Feedback>({ kind: 'idle' });
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState('');
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const busyRef = useRef(false);

  const submit = async (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    // De-dupe: ignore the same code within 2s (barcode still in view).
    const last = lastScanRef.current;
    const now = Date.now();
    if (last && last.code === clean && now - last.at < 2000) return;
    lastScanRef.current = { code: clean, at: now };

    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const res = await api.post<{ found: true; reference: string }>(
        '/returns/scan/push',
        { code: clean },
      );
      setFeedback({ kind: 'found', reference: res.data.reference });
      if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
      beep(true);
      setScanCount((n) => n + 1);
    } catch (e) {
      const err = e as {
        response?: { status?: number; data?: { error?: { code_scanned?: string } } };
      };
      if (err.response?.status === 404) {
        setFeedback({ kind: 'not_found', code: err.response.data?.error?.code_scanned ?? clean });
        if (navigator.vibrate) navigator.vibrate(200);
        beep(false);
      } else {
        setFeedback({ kind: 'error', message: t('returns.phone.feedback.networkError') });
        beep(false);
      }
    } finally {
      busyRef.current = false;
    }
  };

  useEffect(() => {
    if (manualMode) return;
    let disposed = false;

    const start = async () => {
      try {
        const scanner = new Html5Qrcode(READER_ID, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: (w, h) => {
              const size = Math.floor(Math.min(w, h) * 0.7);
              return { width: size, height: size };
            },
          },
          (decoded) => {
            if (disposed) return;
            void submit(decoded);
          },
          () => {},
        );
      } catch (e) {
        setCameraErr(
          e instanceof Error
            ? t('returns.phone.cameraErrorFallback', { message: e.message })
            : t('returns.phone.cameraErrorGeneric'),
        );
      }
    };

    void start();

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {
              /* ignore */
            }
          });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode]);

  const submitManual = () => {
    const v = manual.trim();
    if (!v) return;
    setManual('');
    void submit(v);
  };

  return (
    <div className="flex min-h-screen flex-col bg-gray-900 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanLine size={18} />
          <h1 className="text-sm font-bold">{t('returns.phone.title')}</h1>
        </div>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold">
          {t('returns.phone.scanCount', { count: scanCount })}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-1 rounded-card border border-white/10 bg-white/5 p-1">
          <button
            onClick={() => setManualMode(false)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold transition-colors',
              !manualMode ? 'bg-primary text-white shadow-sm' : 'text-gray-300',
            )}
          >
            <ScanLine size={13} /> {t('returns.phone.modeCamera')}
          </button>
          <button
            onClick={() => setManualMode(true)}
            className={cn(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold transition-colors',
              manualMode ? 'bg-primary text-white shadow-sm' : 'text-gray-300',
            )}
          >
            <Keyboard size={13} /> {t('returns.phone.modeManual')}
          </button>
        </div>

        {cameraErr && !manualMode && (
          <div className="flex items-start gap-2 rounded-card border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{cameraErr}</span>
          </div>
        )}

        {!manualMode ? (
          <div
            id={READER_ID}
            className="overflow-hidden rounded-card border border-white/10 bg-black"
            style={{ minHeight: 320 }}
          />
        ) : (
          <div className="flex flex-col gap-3 rounded-card border border-white/10 bg-white/5 p-3">
            <CRMInput
              label={t('returns.phone.manualLabel')}
              placeholder={t('returns.phone.manualPlaceholder')}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManual();
              }}
              autoFocus
            />
            <CRMButton onClick={submitManual} disabled={manual.trim().length === 0}>
              {t('returns.phone.push')}
            </CRMButton>
          </div>
        )}

        <FeedbackBanner feedback={feedback} />

        <p className="mt-auto text-center text-[11px] text-gray-400">
          {t('returns.phone.bottomHint')}
        </p>
      </div>
    </div>
  );
}

function FeedbackBanner({ feedback }: { feedback: Feedback }) {
  const { t } = useTranslation();
  if (feedback.kind === 'idle') {
    return (
      <div className="rounded-card border border-white/10 bg-white/5 px-3 py-3 text-center text-xs text-gray-400">
        {t('returns.phone.waiting')}
      </div>
    );
  }
  if (feedback.kind === 'found') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-emerald-400/30 bg-emerald-500/10 px-3 py-3 text-emerald-100">
        <CheckCircle2 size={22} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t('returns.phone.feedback.sent')}</p>
          <p className="truncate text-[11px] opacity-80">{feedback.reference}</p>
        </div>
      </div>
    );
  }
  if (feedback.kind === 'not_found') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-rose-400/30 bg-rose-500/10 px-3 py-3 text-rose-100">
        <XCircle size={22} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t('returns.phone.feedback.notFound')}</p>
          <p className="truncate font-mono text-[11px] opacity-80">{feedback.code}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-card border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-amber-100">
      <AlertTriangle size={22} className="shrink-0" />
      <p className="text-sm font-semibold">{feedback.message}</p>
    </div>
  );
}
