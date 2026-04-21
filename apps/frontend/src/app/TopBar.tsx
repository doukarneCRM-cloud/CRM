import { useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useOnlineStore } from '@/store/onlineStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { authService } from '@/services/api';
import { getInitials } from '@/components/ui/AvatarChip';
import { resolveImageUrl } from '@/lib/imageUrl';
import { NotificationPanel } from './NotificationPanel';
import { GlobalSearch } from './GlobalSearch';
import { ProfileModal } from './ProfileModal';

// ─── Page title map ───────────────────────────────────────────────────────────
const PAGE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'Dashboard',
  [ROUTES.ORDERS]: 'Orders',
  [ROUTES.CALL_CENTER]: 'Call Center',
  [ROUTES.PRODUCTS_LIST]: 'Products',
  [ROUTES.PRODUCTS_STOCK]: 'Stock Matrix',
  [ROUTES.CLIENTS]: 'Clients',
  [ROUTES.TEAM_AGENTS]: 'Team',
  [ROUTES.ANALYTICS]: 'Analytics',
  [ROUTES.INTEGRATIONS_STORE]: 'Integrations',
  [ROUTES.ATELIE_EMPLOYEES]: 'Atelie',
  [ROUTES.PRODUCTION_DASHBOARD]: 'Production',
  [ROUTES.PRODUCTION_TESTS]: 'Product Tests',
  [ROUTES.PRODUCTION_RUNS]: 'Production Runs',
  [ROUTES.SETTINGS]: 'Settings',
};

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

interface AgentPillData {
  userId: string;
  name: string;
  initials: string;
  avatarSrc: string;
  colorClass: string;
  roleName?: string;
}

function AgentPill({ agent }: { agent: AgentPillData }) {
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
        className="flex shrink-0 items-center gap-1.5 rounded-full border-2 border-emerald-500/70 bg-white py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-gray-800 shadow-sm outline-none focus:ring-2 focus:ring-emerald-500/30"
      >
        {agent.avatarSrc ? (
          <img
            src={agent.avatarSrc}
            alt={agent.name}
            className="h-5 w-5 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold',
              agent.colorClass,
            )}
          >
            {agent.initials}
          </span>
        )}
        <span className="whitespace-nowrap">{agent.name}</span>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.2)]" />
      </div>

      {card &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[60] w-56 -translate-x-1/2 rounded-xl border border-gray-100 bg-white p-3 shadow-xl"
            style={{ top: card.top, left: card.left }}
          >
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {agent.avatarSrc ? (
                  <img
                    src={agent.avatarSrc}
                    alt={agent.name}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold',
                      agent.colorClass,
                    )}
                  >
                    {agent.initials}
                  </span>
                )}
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{agent.name}</p>
                {agent.roleName && (
                  <p className="truncate text-[11px] capitalize text-gray-500">
                    {agent.roleName}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] font-semibold text-emerald-600">● Online</p>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function OnlineAgents() {
  const { onlineUsers } = useOnlineStore();
  const users = Array.from(onlineUsers.values());
  if (users.length === 0) return null;

  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 pr-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {users.map((agent, i) => {
        const name = agent.name ?? agent.userId;
        const initials = agent.name
          ? getInitials(agent.name)
          : agent.userId.slice(0, 2).toUpperCase();
        return (
          <AgentPill
            key={agent.userId}
            agent={{
              userId: agent.userId,
              name,
              initials,
              avatarSrc: resolveImageUrl(agent.avatarUrl),
              colorClass: AVATAR_COLORS[i % AVATAR_COLORS.length],
              roleName: agent.roleName,
            }}
          />
        );
      })}
    </div>
  );
}

// ─── User dropdown ─────────────────────────────────────────────────────────────
function UserDropdown() {
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
          className="flex items-center gap-2.5 rounded-btn px-3 py-1.5 transition-colors hover:bg-accent"
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
              style={{ background: 'linear-gradient(135deg, #6B4226, #9C6B4E)' }}
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
                  style={{ background: 'linear-gradient(135deg, #6B4226, #9C6B4E)' }}
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
                  Profile
                </button>
              </li>
              <li>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut size={14} />
                  Logout
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

  const pageTitle = PAGE_TITLES[pathname] ?? 'Anaqatoki CRM';
  const isAdmin = hasRole('admin');

  return (
    <header
      className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-100 bg-white/90 px-3 backdrop-blur-sm sm:px-5"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 40,
        marginLeft: 0,
      }}
    >
      {/* Left: hamburger (mobile) + page title + online agents list */}
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          onClick={onMobileMenuOpen}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-gray-500 hover:bg-accent hover:text-primary md:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="shrink-0 text-base font-semibold text-gray-900">{pageTitle}</h1>
        {isAdmin && user && (
          <div className="min-w-0 flex-1">
            <OnlineAgents />
          </div>
        )}
      </div>

      {/* Right: search + bell + user */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Global search — hidden on very narrow screens */}
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>

        {/* Notification bell */}
        <NotificationPanel />

        {/* User dropdown */}
        <UserDropdown />
      </div>
    </header>
  );
}
