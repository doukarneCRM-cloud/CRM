import { useCallback, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, Menu, User } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';
import { useAuthStore } from '@/store/authStore';
import { useOnlineStore } from '@/store/onlineStore';
import { useClickOutside } from '@/hooks/useClickOutside';
import { authService } from '@/services/api';
import { getInitials } from '@/components/ui/AvatarChip';
import { NotificationPanel } from './NotificationPanel';
import { GlobalSearch } from './GlobalSearch';

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
  [ROUTES.SETTINGS]: 'Settings',
};

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

function OnlineAgents() {
  const { onlineUsers } = useOnlineStore();
  const users = Array.from(onlineUsers.values());
  const MAX_SHOWN = 5;
  const shown = users.slice(0, MAX_SHOWN);
  const overflow = users.length - MAX_SHOWN;

  return (
    <div className="flex items-center -space-x-2">
      {shown.map((agent, i) => {
        const initials = agent.name
          ? getInitials(agent.name)
          : agent.userId.slice(0, 2).toUpperCase();
        return (
          <div
            key={agent.userId}
            title={agent.name ?? agent.userId}
            className={cn(
              'relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-[10px] font-bold',
              AVATAR_COLORS[i % AVATAR_COLORS.length],
            )}
          >
            {initials}
            <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full border border-white bg-green-500" />
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-[10px] font-bold text-gray-600">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ─── User dropdown ─────────────────────────────────────────────────────────────
function UserDropdown() {
  const { user, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-btn px-3 py-1.5 transition-colors hover:bg-accent"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #6B4226, #9C6B4E)' }}
        >
          {initials}
        </div>
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
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-input border border-gray-100 bg-white shadow-hover">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <ul className="py-1">
            <li>
              <button className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-accent">
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
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMobileMenuOpen}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-gray-500 hover:bg-accent hover:text-primary md:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-base font-semibold text-gray-900">{pageTitle}</h1>
      </div>

      {/* Right: search + online agents + bell + user */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Global search — hidden on very narrow screens */}
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>

        {/* Online agents avatars (admin only) — desktop only */}
        {isAdmin && user && (
          <div className="hidden items-center gap-2 lg:flex">
            <OnlineAgents />
            <span className="text-xs text-gray-400">online</span>
          </div>
        )}

        {/* Notification bell */}
        <NotificationPanel />

        {/* User dropdown */}
        <UserDropdown />
      </div>
    </header>
  );
}
