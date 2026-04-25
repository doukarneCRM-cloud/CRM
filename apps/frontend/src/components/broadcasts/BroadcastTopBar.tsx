import { useTranslation } from 'react-i18next';
import { ExternalLink, Megaphone } from 'lucide-react';
import { useActiveBroadcasts } from '@/hooks/useActiveBroadcasts';
import { broadcastsApi } from '@/services/broadcastsApi';

/**
 * Mounted at the top of `CallCenterPage.tsx` (between header and KPI cards).
 *
 * Renders one sticky strip per active BAR broadcast aimed at the current user.
 * Agents cannot dismiss — admin retires the broadcast via the manage page,
 * which fires `broadcast:closed` and the strip drops live.
 */
export function BroadcastTopBar() {
  const { t } = useTranslation();
  const { bars } = useActiveBroadcasts();

  if (bars.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {bars.map((b) => (
        <div
          key={b.id}
          className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-primary"
          role="alert"
        >
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Megaphone size={14} />
          </span>
          {b.imageUrl && (
            <img
              src={b.imageUrl}
              alt=""
              className="hidden h-12 w-12 shrink-0 rounded-lg object-cover sm:block"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{b.title}</p>
            {b.body && (
              <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-primary/80">
                {b.body}
              </p>
            )}
          </div>
          {b.linkUrl && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await broadcastsApi.click(b.id);
                } catch {
                  /* best-effort metric */
                }
                window.open(b.linkUrl!, '_blank', 'noopener,noreferrer');
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-primary/30 bg-white/40 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-white"
            >
              <ExternalLink size={12} />
              {t('team.broadcasts.barOpenLink')}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
