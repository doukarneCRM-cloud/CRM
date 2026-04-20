import { useEffect, useRef, useState } from 'react';
import { ScanLine, Keyboard, AlertTriangle } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { CRMInput } from '@/components/ui/CRMInput';

interface Props {
  onClose: () => void;
  onResult: (value: string) => void;
}

const READER_ID = 'returns-qr-reader';

function playSuccessBeep() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio unavailable — silent fail */
  }
}

export function ScannerModal({ onClose, onResult }: Props) {
  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [manual, setManual] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (mode !== 'scan') return;
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
            disposed = true;
            playSuccessBeep();
            if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
            onResult(decoded.trim());
          },
          () => {
            // per-frame decode misses — noisy, ignore
          },
        );
        startedRef.current = true;
      } catch (e) {
        setErr(
          e instanceof Error
            ? `${e.message}. You can type the tracking ID manually instead.`
            : 'Could not access the camera. You can type the tracking ID manually instead.',
        );
      }
    };

    void start();

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner && startedRef.current) {
        startedRef.current = false;
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
  }, [mode, onResult]);

  const submitManual = () => {
    const v = manual.trim();
    if (v.length === 0) return;
    onResult(v);
  };

  return (
    <GlassModal open onClose={onClose} title="Scan return" size="lg">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-1 rounded-card border border-gray-100 bg-white p-1">
          <button
            onClick={() => setMode('scan')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'scan' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-accent hover:text-primary'
            }`}
          >
            <ScanLine size={13} /> Camera
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-btn px-3 py-2 text-xs font-semibold transition-colors ${
              mode === 'manual' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-accent hover:text-primary'
            }`}
          >
            <Keyboard size={13} /> Type manually
          </button>
        </div>

        {err && (
          <div className="flex items-start gap-2 rounded-card border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{err}</span>
          </div>
        )}

        {mode === 'scan' ? (
          <div className="flex flex-col gap-2">
            <div
              id={READER_ID}
              className="overflow-hidden rounded-card border border-gray-200 bg-black"
              style={{ minHeight: 280 }}
            />
            <p className="text-center text-[11px] text-gray-400">
              Align the package's QR or barcode inside the frame. Scanning stops automatically on match.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <CRMInput
              label="Tracking ID or order reference"
              placeholder="e.g. CLX-1234567890 or ORD-26-00123"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManual();
              }}
              autoFocus
            />
            <div className="flex justify-end">
              <CRMButton onClick={submitManual} disabled={manual.trim().length === 0}>
                Look up
              </CRMButton>
            </div>
          </div>
        )}
      </div>
    </GlassModal>
  );
}
