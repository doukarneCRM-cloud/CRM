import { useEffect, useRef, useState } from 'react';
import { GlassModal } from '@/components/ui/GlassModal';
import { CRMButton } from '@/components/ui/CRMButton';
import { whatsappApi, type WhatsAppSession } from '@/services/whatsappApi';

interface Props {
  open: boolean;
  session: WhatsAppSession | null;
  onClose: () => void;
  onConnected: () => void;
}

export function QrModal({ open, session, onClose, onConnected }: Props) {
  const [qr, setQr] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [state, setState] = useState<string>('connecting');
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open || !session) return;
    stopRef.current = false;
    setQr(null);
    setPairingCode(null);
    setState('connecting');
    setError(null);

    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (stopRef.current) return;
      try {
        const res = await whatsappApi.getQr(session.id);
        if (stopRef.current) return;
        setQr(res.qrBase64);
        setPairingCode(res.pairingCode);
        setState(res.state);
        if (res.state === 'open' || res.state === 'connected') {
          onConnected();
          onClose();
          return;
        }
      } catch (e: any) {
        if (stopRef.current) return;
        setError(e?.response?.data?.error ?? 'Failed to load QR');
      }
      timer = setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      stopRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, session, onConnected, onClose]);

  const title = session?.user ? `Connect ${session.user.name}` : 'Connect system session';

  return (
    <GlassModal open={open} onClose={onClose} title={title} size="md">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : qr ? (
          <>
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt="WhatsApp QR"
              className="h-64 w-64 rounded-btn border border-gray-200 bg-white p-2"
            />
            <p className="text-sm text-gray-600">
              Open WhatsApp → Linked Devices → Link a device, then scan this code.
            </p>
            {pairingCode && (
              <p className="text-xs text-gray-500">
                Or use pairing code: <span className="font-mono font-semibold">{pairingCode}</span>
              </p>
            )}
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Status: {state}</p>
          </>
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-btn border border-dashed border-gray-200 text-sm text-gray-400">
            Waiting for QR…
          </div>
        )}
        <CRMButton variant="ghost" size="sm" onClick={onClose}>
          Close
        </CRMButton>
      </div>
    </GlassModal>
  );
}
