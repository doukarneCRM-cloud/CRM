import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  CheckCircle2,
  UserPlus,
  Info,
  Inbox,
  ShoppingBag,
  Package,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/store/authStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { getSocket } from '@/services/socket';
import {
  notificationsApi,
  type Notification,
  type NotificationKind,
} from '@/services/notificationsApi';
import type { TFunction } from 'i18next';

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  order_assigned: UserPlus,
  order_confirmed: CheckCircle2,
  order_new: ShoppingBag,
};

const KIND_ACCENT: Record<NotificationKind, string> = {
  order_assigned: 'bg-amber-100 text-amber-700',
  order_confirmed: 'bg-emerald-100 text-emerald-700',
  order_new: 'bg-sky-100 text-sky-700',
};

function timeAgo(iso: string, t: TFunction): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.round(diff / 1000);
  if (s < 60) return t('shared.notifications.timeJustNow');
  const m = Math.round(s / 60);
  if (m < 60) return t('shared.notifications.timeMinutes', { count: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('shared.notifications.timeHours', { count: h });
  const d = Math.round(h / 24);
  return t('shared.notifications.timeDays', { count: d });
}

export function NotificationPanel() {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unread = items.reduce((n, item) => n + (item.readAt ? 0 : 1), 0);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    notificationsApi
      .list()
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
      })
      .catch((err) => {
        console.warn('[notifications] initial fetch failed', err);
      });

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return () => {
        cancelled = true;
      };
    }

    const handleNew = (n: Notification) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
    };
    socket.on('notification:new', handleNew);

    return () => {
      cancelled = true;
      socket.off('notification:new', handleNew);
    };
  }, [isAuthenticated]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.readAt ? n : { ...n, readAt: nowIso })),
      );
      try {
        setLoading(true);
        await notificationsApi.markAllRead();
      } catch (err) {
        console.warn('[notifications] markAllRead failed', err);
        // Optimistic state stays; next refetch will reconcile.
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClickItem = (n: Notification) => {
    setOpen(false);
    if (n.href) navigate(n.href);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-accent hover:text-primary"
        aria-label={t('shared.notifications.ariaLabel')}
      >
        <Bell size={16} />
      </button>
      {unread > 0 && (
        <span className="pointer-events-none absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-hover">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{t('shared.notifications.title')}</p>
              <p className="text-[11px] text-gray-400">
                {loading
                  ? t('shared.notifications.updating')
                  : items.length === 0
                    ? t('shared.notifications.noneYet')
                    : t('shared.notifications.lastN', { count: items.length })}
              </p>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-gray-400">
                <Inbox size={28} />
                <p className="text-xs">{t('shared.notifications.allCaughtUp')}</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => {
                  const Icon = KIND_ICON[n.kind] ?? Info;
                  const accent = KIND_ACCENT[n.kind] ?? 'bg-sky-100 text-sky-700';
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleClickItem(n)}
                        className={cn(
                          'flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                          !n.readAt && 'bg-amber-50/40',
                        )}
                      >
                        <div
                          className={cn(
                            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            accent,
                          )}
                        >
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-900">{n.title}</p>
                          {n.body && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.body}</p>
                          )}
                          {n.product && (
                            <div className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5">
                              <Package size={10} className="shrink-0 text-primary" />
                              <span className="truncate text-[11px] font-semibold text-primary">
                                {n.product.name}
                              </span>
                              {n.product.extraCount > 0 && (
                                <span className="shrink-0 rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-bold text-primary">
                                  +{n.product.extraCount}
                                </span>
                              )}
                            </div>
                          )}
                          <p className="mt-1 text-[10px] text-gray-400">{timeAgo(n.createdAt, t)}</p>
                        </div>
                        {!n.readAt && (
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
