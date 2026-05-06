import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScanLine, Package, Keyboard, AlertTriangle, MapPin, User as UserIcon, Hash } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useToastStore } from '@/store/toastStore';
import { ordersApi } from '@/services/ordersApi';
import { resolveImageUrl } from '@/lib/imageUrl';
import { CRMInput } from '@/components/ui/CRMInput';
import { CRMButton } from '@/components/ui/CRMButton';
import type { Order } from '@/types/orders';

const READER_ID = 'pickup-qr-reader';
const DEDUPE_MS = 1500;

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

  const totalItems = useMemo(
    () => (order ? order.items.reduce((s, it) => s + it.quantity, 0) : 0),
    [order],
  );

  const submitManual = () => {
    const v = manual.trim();
    if (v.length === 0) return;
    void lookupTracking(v);
    setManual('');
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
          <ScanLine size={20} /> {t('pickup.title')}
        </h1>
        <p className="text-sm text-gray-500">{t('pickup.subtitle')}</p>
      </div>

      {/* Viewfinder */}
      <div className="relative">
        <div
          id={READER_ID}
          className={[
            'overflow-hidden rounded-card border-4 bg-black transition-colors duration-200',
            flash === 'success'
              ? 'border-emerald-400'
              : flash === 'error'
                ? 'border-rose-400'
                : 'border-gray-200',
          ].join(' ')}
          style={{ minHeight: 280 }}
        />
        {!order && !cameraErr && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white">
              {t('pickup.cameraPlaceholder')}
            </span>
          </div>
        )}
        {cameraErr && (
          <div className="absolute inset-x-2 bottom-2 flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>{cameraErr}</span>
          </div>
        )}
      </div>

      {/* Manual entry — always available as fallback */}
      <div className="rounded-card border border-gray-100 bg-white p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-500">
          <Keyboard size={13} />
          {t('pickup.manualEntry')}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <CRMInput
              placeholder={t('pickup.trackingPlaceholder')}
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

      {/* Order detail */}
      {!order ? (
        <div className="rounded-card border border-dashed border-gray-200 bg-white p-8 text-center">
          <Package size={40} className="mx-auto text-gray-300" />
          <p className="mt-2 text-sm font-semibold text-gray-700">{t('pickup.emptyTitle')}</p>
          <p className="mt-1 text-xs text-gray-500">{t('pickup.emptyHint')}</p>
        </div>
      ) : (
        <div className="rounded-card border border-gray-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-3">
            <span className="inline-flex items-center gap-1 rounded-btn bg-tone-lavender-50 px-2 py-1 text-xs font-semibold text-tone-lavender-500">
              <Hash size={12} /> {order.reference}
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-gray-800">
              <UserIcon size={14} className="text-gray-400" /> {order.customer.fullName}
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-gray-600">
              <MapPin size={14} className="text-gray-400" /> {order.customer.city}
            </span>
            <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
              {t('pickup.itemCount', { count: totalItems })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {order.items.map((it) => {
              const photo = resolveImageUrl(it.variant.product.imageUrl);
              const variantLabel = [it.variant.color, it.variant.size].filter(Boolean).join(' · ');
              return (
                <div
                  key={it.id}
                  className="relative flex flex-col overflow-hidden rounded-card border border-gray-100 bg-white"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-gray-50">
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <Package size={48} />
                      </div>
                    )}
                    {it.quantity > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-tone-lavender-500 px-3 py-1 text-base font-bold text-white shadow-[0_4px_14px_rgba(124,92,255,0.45)]">
                        ×{it.quantity}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 p-2.5">
                    <p className="truncate text-sm font-semibold text-gray-800">
                      {it.variant.product.name}
                    </p>
                    {variantLabel && (
                      <span className="inline-flex w-fit items-center rounded-btn bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {variantLabel}
                      </span>
                    )}
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
