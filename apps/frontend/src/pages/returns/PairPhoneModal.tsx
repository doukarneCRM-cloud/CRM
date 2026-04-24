import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Smartphone } from 'lucide-react';
import { GlassModal } from '@/components/ui/GlassModal';
import { ROUTES } from '@/constants/routes';

/**
 * Shows a QR code of the phone-scan URL so the agent can scan it with their
 * phone camera and jump straight into the continuous scanner. Both devices
 * must be logged into the same user account — the backend routes scan
 * events to the `agent:${userId}` socket room.
 */
export function PairPhoneModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const url = useMemo(
    () => `${window.location.origin}${ROUTES.RETURNS_PHONE_SCAN}`,
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <GlassModal open onClose={onClose} title={t('returns.pair.title')} size="md">
      <div className="flex flex-col items-center gap-4">
        <p className="text-center text-sm text-gray-600">
          {t('returns.pair.subtitle')}
        </p>

        <div className="rounded-card border border-gray-200 bg-white p-4">
          <QRCodeSVG value={url} size={220} level="M" includeMargin={false} />
        </div>

        <div className="flex w-full items-center gap-2 rounded-input border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
          <Smartphone size={14} className="shrink-0 text-gray-400" />
          <span className="flex-1 truncate font-mono text-gray-700">{url}</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1 rounded-btn bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-100"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? t('returns.pair.copied') : t('returns.pair.copy')}
          </button>
        </div>

        <p className="text-center text-[11px] text-gray-400">
          {t('returns.pair.tip')}
        </p>
      </div>
    </GlassModal>
  );
}
