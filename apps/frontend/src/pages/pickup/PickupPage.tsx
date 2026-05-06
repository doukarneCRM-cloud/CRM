import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanLine, Package, AlertTriangle, MapPin, User as UserIcon, Hash, QrCode } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useToastStore } from '@/store/toastStore';
import { ordersApi } from '@/services/ordersApi';
import { resolveImageUrl } from '@/lib/imageUrl';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import type { Order } from '@/types/orders';

const READER_ID = 'pickup-qr-reader';
const DEDUPE_MS = 1500;

// Best-effort mapping of free-text variant colors → CSS swatch.
// Covers the colors the catalog actually uses; falls back to neutral gray.
const COLOR_MAP: Record<string, string> = {
  noir: '#111827', black: '#111827',
  blanc: '#f8fafc', white: '#f8fafc', cassé: '#f5f5dc', cassée: '#f5f5dc',
  gris: '#9ca3af', grey: '#9ca3af', gray: '#9ca3af',
  beige: '#d6c4a8', sable: '#d6c4a8',
  rouge: '#dc2626', red: '#dc2626',
  bleu: '#2563eb', blue: '#2563eb', marine: '#1e3a8a', navy: '#1e3a8a',
  vert: '#16a34a', green: '#16a34a',
  rose: '#ec4899', pink: '#ec4899',
  jaune: '#facc15', yellow: '#facc15',
  marron: '#78350f', brown: '#78350f',
  violet: '#7c3aed', purple: '#7c3aed',
  orange: '#f97316',
};

function cssColorFor(name: string | null | undefined): string {
  if (!name) return '#9ca3af';
  const key = name.trim().toLowerCase();
  return COLOR_MAP[key] || COLOR_MAP[key.split(/\s+/)[0]] || '#9ca3af';
}

function playBeep(kind: 'success' | 'error') {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    if (kind === 'success') {
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.18);
    }
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.24);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio unavailable */
  }
}

export default function PickupPage() {
  const { t } = useTranslation();
  const pushToast = useToastStore((s) => s.push);

  const [order, setOrder] = useState<Order | null>(null);
  const [lastScanCode, setLastScanCode] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const [cameraErr, setCameraErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<'success' | 'error' | null>(null);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const startedRef = useRef(false);
  const lastSeenRef = useRef<{ code: string; at: number } | null>(null);

  const lookupTracking = async (code: string) => {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const fresh = await ordersApi.byTracking(trimmed);
      setOrder(fresh);
      setLastScanCode(trimmed);
      setLastScanAt(new Date());
      playBeep('success');
      if (navigator.vibrate) navigator.vibrate(30);
      setFlash('success');
      window.setTimeout(() => setFlash((f) => (f === 'success' ? null : f)), 600);
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      const msg =
        status === 404
          ? t('pickup.notFound', { code: trimmed })
          : t('pickup.lookupFailed');
      pushToast({ kind: 'error', title: msg });
      playBeep('error');
      setFlash('error');
      window.setTimeout(() => setFlash((f) => (f === 'error' ? null : f)), 600);
    } finally {
      setBusy(false);
    }
  };

  // Camera scanner — runs continuously, dedupes consecutive same-code reads.
  useEffect(() => {
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
            const code = decoded.trim();
            const now = Date.now();
            const seen = lastSeenRef.current;
            if (seen && seen.code === code && now - seen.at < DEDUPE_MS) return;
            lastSeenRef.current = { code, at: now };
            void lookupTracking(code);
          },
          () => {
            // per-frame decode misses — ignore
          },
        );
        startedRef.current = true;
        setCameraErr(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : '';
        if (/permission|denied|NotAllowed/i.test(message)) {
          setCameraErr(t('pickup.cameraDenied'));
        } else {
          setCameraErr(t('pickup.cameraErrorGeneric'));
        }
      }
    };

    void start();

    return () => {
      disposed = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      // Only stop if start() actually succeeded — html5-qrcode throws
      // synchronously when stop() is called on a never-started instance.
      if (scanner && startedRef.current) {
        startedRef.current = false;
        try {
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              try { scanner.clear(); } catch { /* ignore */ }
            });
        } catch {
          try { scanner.clear(); } catch { /* ignore */ }
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitManual = () => {
    const v = manual.trim();
    if (v.length === 0) return;
    void lookupTracking(v);
    setManual('');
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <h1 className="flex items-center gap-2 text-xl font-bold text-tone-lavender-500">
        <ScanLine size={20} /> {t('pickup.title')}
      </h1>

      {/* Stylized scanner panel — readable from across the room */}
      <div className="rounded-card border border-gray-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center">
          <div className="relative shrink-0">
            <div
              id={READER_ID}
              className={[
                'h-40 w-40 overflow-hidden rounded-card border-4 bg-black transition-colors duration-200',
                flash === 'success'
                  ? 'border-emerald-400'
                  : flash === 'error'
                    ? 'border-rose-400'
                    : 'border-gray-200',
              ].join(' ')}
            />
            {cameraErr && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
                <QrCode size={64} className="text-white/80" />
              </div>
            )}
          </div>
          <div className="flex flex-col items-center sm:items-start">
            <p className="text-2xl font-bold text-gray-900">{t('pickup.scanQrTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('pickup.scanQrSubtitle')}</p>
            {cameraErr && (
              <div className="mt-3 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{cameraErr}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tracking input — centered */}
      <div className="flex justify-center">
        <div className="flex w-full max-w-xl gap-2">
          <div className="flex-1">
            <CRMInput
              placeholder={t('pickup.trackingPlaceholderAlt')}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitManual();
              }}
            />
          </div>
          <CRMButton onClick={submitManual} disabled={manual.trim().length === 0 || busy}>
            {t('pickup.lookup')}
          </CRMButton>
        </div>
      </div>

      {/* Big order display — takes the screen */}
      {!order ? (
        <div className="rounded-card border border-dashed border-gray-200 bg-white p-12 text-center">
          <Package size={56} className="mx-auto text-gray-300" />
          <p className="mt-3 text-base font-semibold text-gray-700">{t('pickup.emptyTitle')}</p>
          <p className="mt-1 text-sm text-gray-500">{t('pickup.emptyHint')}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-sm">
          {/* Order header — 3 prominent columns */}
          <div className="grid grid-cols-1 divide-y divide-gray-100 border-b border-gray-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div className="flex flex-col gap-1 p-4">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <Hash size={12} /> {t('pickup.orderId')}
              </span>
              <span className="text-2xl font-bold text-gray-900">#{order.reference}</span>
            </div>
            <div className="flex flex-col gap-1 p-4">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <MapPin size={12} /> {t('pickup.pickupLocation')}
              </span>
              <span className="text-2xl font-bold uppercase text-gray-900">
                {order.customer.city}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-4">
              <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                <UserIcon size={12} /> {t('pickup.customerInfo')}
              </span>
              <span className="truncate text-2xl font-bold text-gray-900">
                {order.customer.fullName}
              </span>
            </div>
          </div>

          {/* Items — one big readable row each */}
          <div className="divide-y divide-gray-100">
            {order.items.map((it) => {
              const photo = resolveImageUrl(it.variant.product.imageUrl);
              return (
                <div
                  key={it.id}
                  className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-6"
                >
                  <div className="relative h-56 w-full overflow-hidden rounded-card bg-gray-50 sm:h-64 sm:w-64 sm:shrink-0">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <Package size={96} />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    <p className="text-3xl font-extrabold leading-tight text-gray-900 sm:text-4xl">
                      {it.variant.product.name}
                    </p>
                    {it.variant.size && (
                      <p className="text-xl font-bold text-gray-900 sm:text-2xl">
                        <span className="text-gray-500">{t('pickup.size')}:</span>{' '}
                        <span>{it.variant.size}</span>
                      </p>
                    )}
                    {it.variant.color && (
                      <p className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
                        <span className="text-gray-500">{t('pickup.color')}:</span>
                        <span
                          aria-hidden
                          className="inline-block h-5 w-5 rounded-sm border border-gray-200"
                          style={{ background: cssColorFor(it.variant.color) }}
                        />
                        <span className="uppercase">{it.variant.color}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                      <p className="text-xl font-bold text-gray-900 sm:text-2xl">
                        <span className="text-gray-500">{t('pickup.qtyToPick')}:</span>{' '}
                        <span className="text-tone-lavender-500">{it.quantity}</span>
                      </p>
                      <p className="text-xl font-bold text-gray-900 sm:text-2xl">
                        <span className="text-gray-500">{t('pickup.price')}:</span>{' '}
                        <span>{it.unitPrice.toLocaleString('fr-MA')} MAD</span>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {lastScanCode && lastScanAt && (
            <div className="border-t border-gray-100 px-3 py-2 text-[11px] text-gray-400">
              {t('pickup.lastScan')} <span className="font-mono">{lastScanCode}</span> ·{' '}
              {lastScanAt.toLocaleTimeString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
