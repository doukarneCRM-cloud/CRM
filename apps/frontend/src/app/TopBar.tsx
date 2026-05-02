import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useOnlineStore } from '@/store/onlineStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { authService } from '@/services/api';
import { getInitials } from '@/components/ui/AvatarChip';
import { resolveImageUrl } from '@/lib/imageUrl';
import { teamApi, type TeamUser } from '@/services/teamApi';
import { NotificationPanel } from './NotificationPanel';
import { GlobalSearch } from './GlobalSearch';
import { ProfileModal } from './ProfileModal';
import { LanguageSwitcher } from './LanguageSwitcher';

// ─── Page title map ───────────────────────────────────────────────────────────
// Maps route → i18n key under `nav.*`. Resolved at render via t().
const PAGE_TITLE_KEYS: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'nav.dashboard',
  [ROUTES.ORDERS]: 'nav.orders',
  [ROUTES.CALL_CENTER]: 'nav.callCenter',
  [ROUTES.PRODUCTS_LIST]: 'nav.products',
  [ROUTES.PRODUCTS_STOCK]: 'nav.stockMatrix',
  [ROUTES.CLIENTS]: 'nav.clients',
  [ROUTES.TEAM_AGENTS]: 'nav.team',
  [ROUTES.ANALYTICS]: 'nav.analytics',
  [ROUTES.INTEGRATIONS_STORE]: 'nav.integrations',
  [ROUTES.ATELIE_EMPLOYEES]: 'nav.atelie',
  [ROUTES.PRODUCTION_DASHBOARD]: 'nav.production',
  [ROUTES.PRODUCTION_TESTS]: 'nav.productionTests',
  [ROUTES.PRODUCTION_RUNS]: 'nav.productionRuns',
  [ROUTES.SETTINGS]: 'nav.settings',
};

// Coordinated avatar colors picked from the dashboard tone palette so the
// online-presence strip reads as one set with the rest of the UI.
const AVATAR_COLORS = [
  'bg-tone-lavender-100 text-tone-lavender-500',
  'bg-tone-mint-100 text-tone-mint-500',
  'bg-tone-amber-100 text-tone-amber-500',
  'bg-tone-peach-100 text-tone-peach-500',
  'bg-tone-sky-100 text-tone-sky-500',
];

interface AgentPillData {
  userId: string;
  name: string;
  initials: string;
  avatarSrc: string;
  colorClass: string;
  roleName?: string;
  isOnline: boolean;
  lastSeenAt: string | null;
}

// Render "last seen X ago" for offline agents. Lightweight inline impl —
// avoids pulling in a date-fns dependency just for this one tooltip line.
function formatLastSeen(iso: string | null, t: TFunction): string {
  if (!iso) return t('shared.topbar.lastSeenUnknown');
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return t('shared.topbar.lastSeenUnknown');
  if (ms < 60_000) return t('shared.topbar.lastSeenMoments');
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t('shared.topbar.lastSeenMinutes', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('shared.topbar.lastSeenHours', { count: hr });
  const d = Math.floor(hr / 24);
  return t('shared.topbar.lastSeenDays', { count: d });
}

function AgentPill({ agent }: { agent: AgentPillData }) {
  const { t } = useTranslation();
  const pillRef = useRef<HTMLDivElement>(null);
  const [card, setCard] = useState<{ top: number; left: number } | null>(null);

  const showCard = () => {
    const el = pillRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCard({ top: r.bottom + 8, left: r.left + r.width / 2 });
  };
  const hideCard = () => setCard(null);

  return (
    <>
      <div
        ref={pillRef}
        onMouseEnter={showCard}
        onMouseLeave={hideCard}
        onFocus={showCard}
        onBlur={hideCard}
        tabIndex={0}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full border-2 bg-white py-0.5 pl-0.5 pr-2 text-[11px] font-semibold shadow-sm outline-none focus:ring-2',
          agent.isOnline
            ? 'border-emerald-500/70 text-gray-800 focus:ring-emerald-500/30'
            : 'border-gray-200 text-gray-500 focus:ring-gray-300/30',
        )}
      >
        {agent.avatarSrc ? (
          <img
            src={agent.avatarSrc}
            alt={agent.name}
            className={cn(
              'h-5 w-5 shrink-0 rounded-full object-cover',
              !agent.isOnline && 'opacity-60 grayscale',
            )}
          />
        ) : (
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
              agent.isOnline ? agent.colorClass : 'bg-gray-100 text-gray-500',
            )}
          >
            {agent.initials}
          </span>
        )}
        <span className="whitespace-nowrap">{agent.name}</span>
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            agent.isOnline
              ? 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]'
              : 'bg-gray-400',
          )}
        />
      </div>

      {card &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60] w-60 -translate-x-1/2 rounded-xl border border-gray-100 bg-white p-3 shadow-xl"
            style={{ top: card.top, left: card.left }}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {agent.avatarSrc ? (
                  <img
                    src={agent.avatarSrc}
                    alt={agent.name}
                    className={cn(
                      'h-12 w-12 rounded-full object-cover',
                      !agent.isOnline && 'opacity-60 grayscale',
                    )}
                  />
                ) : (
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold',
                      agent.isOnline ? agent.colorClass : 'bg-gray-100 text-gray-500',
                    )}
                  >
                    {agent.initials}
                  </span>
                )}
                <span
                  className={cn(
                    'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white',
                    agent.isOnline ? 'bg-emerald-500' : 'bg-gray-400',
                  )}
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{agent.name}</p>
                {agent.roleName && (
                  <p className="truncate text-[11px] capitalize text-gray-500">
                    {agent.roleName}
                  </p>
                )}
                {agent.isOnline ? (
                  <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">
                    ● {t('shared.topbar.online')}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
                    ● {t('shared.topbar.offline')} · {formatLastSeen(agent.lastSeenAt, t)}
                  </p>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Refresh interval for the periodic refetch of the agent roster. The live
// online/offline transitions arrive instantly via socket events written
// into useOnlineStore — this poll only catches roster changes (new agent
// added, role changed, deactivated) and rolls the "last seen X minutes
// ago" tooltip forward without waiting for the user to refresh.
const PRESENCE_REFRESH_MS = 60_000;

function AgentsPresenceBar() {
  const [agents, setAgents] = useState<TeamUser[]>([]);
  const { onlineUsers } = useOnlineStore();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      teamApi
        .listUsers()
        .then((users) => {
          if (!cancelled) setAgents(users);
        })
        .catch(() => {
          // best effort — we keep the last good roster on transient failures
        });
    };
    load();
    const t = setInterval(load, PRESENCE_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  // Sort: online agents first (alphabetical within group), then offline
  // (alphabetical). Hides deactivated users — admin can still manage them
  // from the Team page; the topbar is for live operational presence.
  const sorted = useMemo(() => {
    const fromRoster = agents
      .filter((u) => u.isActive)
      .map((u) => ({
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        roleName: u.role?.label,
        // The live socket store wins over the API snapshot — a user who
        // just disconnected is reflected immediately, without waiting for
        // the next periodic refetch.
        isOnline: onlineUsers.has(u.id) || u.isOnline,
        lastSeenAt: u.lastSeenAt,
      }));

    // Render anyone the socket told us is online but the /users snapshot
    // hasn't caught up to yet (newly-created agent, or first paint racing
    // the roster fetch). The next 60s poll will replace these with the
    // canonical roster row.
    const known = new Set(fromRoster.map((u) => u.userId));
    const ghosts = Array.from(onlineUsers.values())
      .filter((u) => !known.has(u.userId) && u.name)
      .map((u) => ({
        userId: u.userId,
        name: u.name as string,
        avatarUrl: u.avatarUrl ?? null,
        roleName: u.roleName,
        isOnline: true,
        lastSeenAt: null as string | null,
      }));

    return [...fromRoster, ...ghosts].sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, onlineUsers]);

  if (sorted.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sorted.map((agent, i) => (
        <AgentPill
          key={agent.userId}
          agent={{
            userId: agent.userId,
            name: agent.name,
            initials: getInitials(agent.name),
            avatarSrc: resolveImageUrl(agent.avatarUrl),
            colorClass: AVATAR_COLORS[i % AVATAR_COLORS.length],
            roleName: agent.roleName,
            isOnline: agent.isOnline,
            lastSeenAt: agent.lastSeenAt,
          }}
        />
      ))}
    </div>
  );
}

// ─── User dropdown ─────────────────────────────────────────────────────────────
function UserDropdown() {
  const { t } = useTranslation();
  const { user, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, useCallback(() => setOpen(false), []));

  const handleLogout = async () => {
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {
      // ignore
    }
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  if (!user) return null;

  const initials = getInitials(user.name);
  const avatarSrc = resolveImageUrl(user.avatarUrl);

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-btn px-3 py-1.5 transition-colors hover:bg-tone-lavender-50"
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={user.name}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #4B5563, #6B7280)' }}
            >
              {initials}
            </div>
          )}
          <div className="hidden text-left md:block">
            <p className="text-xs font-semibold text-gray-900">{user.name}</p>
            <p className="text-[10px] text-gray-400">{user.role.label}</p>
          </div>
          <ChevronDown
            size={14}
            className={cn('text-gray-400 transition-transform', open && 'rotate-180')}
          />
        </button>

        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-input border border-gray-100 bg-white shadow-hover">
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-3">
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt={user.name}
                  className="h-9 w-9 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #18181B, #27272A)' }}
                >
                  {initials}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-xs text-gray-400">{user.email}</p>
              </div>
            </div>
            <ul className="py-1">
              <li>
                <button
                  onClick={() => {
                    setOpen(false);
                    setProfileOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent"
                >
                  <User size={14} />
                  {t('common.profile')}
                </button>
              </li>
              <li>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut size={14} />
                  {t('common.logout')}
                </button>
              </li>
            </ul>
          </div>
        )}
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────
interface TopBarProps {
  sidebarCollapsed: boolean;
  onMobileMenuOpen?: () => void;
}

export function TopBar({ onMobileMenuOpen }: TopBarProps) {
  const { pathname } = useLocation();
  const { user, hasRole } = useAuthStore();
  const { t } = useTranslation();

  const titleKey = PAGE_TITLE_KEYS[pathname];
  const pageTitle = titleKey ? t(titleKey) : t('shared.appName');
  const isAdmin = hasRole('admin');

  return (
    <header
      className="flex h-14 shrink-0 items-center gap-2 border-b border-gray-100 bg-white/95 px-3 text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.04)] backdrop-blur-sm sm:gap-3 sm:px-5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        marginLeft: 0,
      }}
    >
      {/* Left: hamburger (mobile) + page title + agents presence bar.
          Takes 2/4 of the row (left + right + center share width 2:1:1)
          so the agent pills get visible space — the previous 1:1:1 split
          truncated everyone past the third pill on common laptop widths. */}
      <div className="flex min-w-0 flex-[2] basis-0 items-center gap-2 sm:gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-gray-500 hover:bg-tone-lavender-50 hover:text-tone-lavender-500 md:hidden"
          aria-label={t('common.openMenu')}
        >
          <Menu size={20} />
        </button>
        <h1 className="shrink-0 text-base font-semibold text-gray-900">{pageTitle}</h1>
        {isAdmin && user && (
          <div className="hidden min-w-0 flex-1 lg:block">
            <AgentsPresenceBar />
          </div>
        )}
      </div>

      {/* Center: global search. Capped at max-w-xs (320px) — the previous
          max-w-xl (576px) was eating the row width that the agent pills
          need. 320px still comfortably fits "Search orders, clients,
          products…" placeholder. */}
      <div className="hidden flex-1 basis-0 justify-center sm:flex">
        <div className="w-full max-w-xs">
          <GlobalSearch />
        </div>
      </div>

      {/* Right: lang + bell + user */}
      <div className="flex flex-1 basis-0 shrink-0 items-center justify-end gap-2 sm:gap-3">
        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Notification bell */}
        <NotificationPanel />

        {/* User dropdown */}
        <UserDropdown />
      </div>
    </header>
  );
}
