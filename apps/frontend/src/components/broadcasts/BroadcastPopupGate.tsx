import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { useActiveBroadcasts } from '@/hooks/useActiveBroadcasts';
import { broadcastsApi } from '@/services/broadcastsApi';

/**
 * Mounted globally inside `App.tsx`. Blocks the UI with a non-dismissible
 * modal whenever the current user has at least one pending POPUP broadcast.
 *
 *  - Backdrop and Escape key do nothing — agents must click OK to proceed.
 *  - The OK click calls `/broadcasts/:id/ack` and the broadcast disappears
 *    from the queue forever.
 *  - Multiple pending popups stack: one is shown at a time in arrival order.
 *  - If the broadcast has a `linkUrl`, an extra "Open link" button calls
 *    `/broadcasts/:id/click` and opens the URL in a new tab.
 */
export function BroadcastPopupGate() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { popups, removePopup } = useActiveBroadcasts();
  const [acking, setAcking] = useState(false);

  // Lock body scroll while a popup is open. Restore on unmount or when the
  // queue empties.
  useEffect(() => {
    if (!isAuthenticated) return;
    if (popups.length === 0) {
      document.body.style.overflow = '';
      return;
    }
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAuthenticated, popups.length]);

  if (!isAuthenticated || popups.length === 0) return null;

  const current = popups[0];

  const handleOk = async () => {
    setAcking(true);
    try {
      await broadcastsApi.ack(current.id);
    } catch {
      /* network blip — let the user retry; we don't dequeue on failure */
      setAcking(false);
      return;
    }
    removePopup(current.id);
    setAcking(false);
  };

  const handleOpenLink = async () => {
    if (!current.linkUrl) return;
    try {
      await broadcastsApi.click(current.id);
    } catch {
      /* click metric is best-effort — still open the link */
    }
    window.open(current.linkUrl, '_blank', 'noopener,noreferrer');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-popup-title"
    >
      <div className="glass-modal modal-enter flex w-full max-w-lg flex-col max-h-[92vh] sm:max-h-[88vh]">
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-5 py-3 sm:px-6 sm:py-4">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            <span className="text-base">📣</span>
          </span>
          <h2
            id="broadcast-popup-title"
            className="truncate pr-3 text-base font-semibold text-gray-900"
          >
            {current.title}
          </h2>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
          {current.imageUrl && (
            <img
              src={current.imageUrl}
              alt=""
              className="mx-auto max-h-72 w-auto rounded-xl object-contain"
            />
          )}
          {current.body && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {current.body}
            </p>
          )}
          {popups.length > 1 && (
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {t('team.broadcasts.popupQueueRemaining', { count: popups.length - 1 })}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-white/70 px-5 py-3 sm:px-6 sm:py-4">
          {current.linkUrl && (
            <CRMButton
              variant="secondary"
              size="md"
              leftIcon={<ExternalLink size={14} />}
              onClick={handleOpenLink}
              disabled={acking}
            >
              {t('team.broadcasts.popupOpenLink')}
            </CRMButton>
          )}
          <CRMButton variant="primary" size="md" loading={acking} onClick={handleOk}>
            {t('team.broadcasts.popupOk')}
          </CRMButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
