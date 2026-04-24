import { useEffect, useRef, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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
  const { t } = useTranslation();
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
        setError(e?.response?.data?.error ?? t('automation.qr.loadFailed'));
      }
      timer = setTimeout(poll, 2000);
    };

    void poll();

    return () => {
      stopRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [open, session, onConnected, onClose, t]);

  const title = session?.user
    ? t('automation.qr.connectUser', { name: session.user.name })
    : t('automation.qr.connectSystem');

  return (
    <GlassModal open={open} onClose={onClose} title={title} size="md">
      <div className="flex flex-col items-center gap-3 text-center">
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : qr ? (
          <>
            <img
              src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
              alt={t('automation.qr.qrAlt')}
              className="h-64 w-64 rounded-btn border border-gray-200 bg-white p-2"
            />
            <p className="text-sm text-gray-600">{t('automation.qr.instructions')}</p>
            {pairingCode && (
              <p className="text-xs text-gray-500">
                <Trans
                  i18nKey="automation.qr.pairingCode"
                  values={{ code: pairingCode }}
                  components={{ 1: <span className="font-mono font-semibold" /> }}
                />
              </p>
            )}
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              {t('automation.qr.statusLabel', { state })}
            </p>
          </>
        ) : (
          <div className="flex h-64 w-64 items-center justify-center rounded-btn border border-dashed border-gray-200 text-sm text-gray-400">
            {t('automation.qr.waiting')}
          </div>
        )}
        <CRMButton variant="ghost" size="sm" onClick={onClose}>
          {t('automation.qr.close')}
        </CRMButton>
      </div>
    </GlassModal>
  );
}
