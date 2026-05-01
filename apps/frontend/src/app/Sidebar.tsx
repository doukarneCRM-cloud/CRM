import { NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Package,
  Phone,
  ShoppingBag,
  Users,
  User,
  BarChart3,
  Link2,
  Settings,
  Factory,
  Wallet,
  PackageSearch,
  Scissors,
  MessageCircle,
  ChevronLeft,
  LogOut,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';
import { useAuthStore } from '@/store/authStore';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { authService } from '@/services/api';
import { resolveImageUrl } from '@/lib/imageUrl';
import { useNavBadges, type NavBadges } from '@/hooks/useNavBadges';

// ─── Nav item config ──────────────────────────────────────────────────────────
// labelKey is an i18n key under `nav.*`; resolved at render via t().

interface NavItem {
  labelKey: string;
  icon: React.ElementType;
  to: string;
  // Single permission key, OR an array meaning "any of these grants access".
  // Used by the Automation entry so an agent with only `whatsapp:connect`
  // (no `automation:view`) still sees the menu and can reach the Sessions tab.
  permission?: string | readonly string[];
  // Badge counter — picks the matching field from the NavBadges payload.
  // Undefined or 0 hides the badge entirely.
  badgeKey?: keyof NavBadges;
  // 'red' (urgent) or 'gray' (info). Defaults to 'gray' when absent.
  badgeTone?: 'red' | 'gray';
}

interface NavSection {
  items: NavItem[];
  dividerBefore?: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { labelKey: 'nav.dashboard', icon: LayoutDashboard, to: ROUTES.DASHBOARD, permission: PERMISSIONS.DASHBOARD_VIEW },
      { labelKey: 'nav.orders', icon: Package, to: ROUTES.ORDERS, permission: PERMISSIONS.ORDERS_VIEW, badgeKey: 'ordersPending', badgeTone: 'gray' },
      { labelKey: 'nav.callCenter', icon: Phone, to: ROUTES.CALL_CENTER, permission: PERMISSIONS.CALL_CENTER_VIEW, badgeKey: 'callbacksToday', badgeTone: 'red' },
      { labelKey: 'nav.products', icon: ShoppingBag, to: ROUTES.PRODUCTS_LIST, permission: PERMISSIONS.PRODUCTS_VIEW },
      { labelKey: 'nav.clients', icon: Users, to: ROUTES.CLIENTS, permission: PERMISSIONS.CLIENTS_VIEW },
      { labelKey: 'nav.team', icon: User, to: ROUTES.TEAM_AGENTS, permission: PERMISSIONS.TEAM_VIEW },
      { labelKey: 'nav.analytics', icon: BarChart3, to: ROUTES.ANALYTICS, permission: PERMISSIONS.ANALYTICS_VIEW },
      { labelKey: 'nav.money', icon: Wallet, to: ROUTES.MONEY, permission: PERMISSIONS.MONEY_VIEW },
      { labelKey: 'nav.returns', icon: PackageSearch, to: ROUTES.RETURNS, permission: PERMISSIONS.RETURNS_VERIFY, badgeKey: 'returnsToVerify', badgeTone: 'gray' },
      { labelKey: 'nav.integrations', icon: Link2, to: ROUTES.INTEGRATIONS_STORE, permission: PERMISSIONS.INTEGRATIONS_VIEW, badgeKey: 'coliixErrors', badgeTone: 'red' },
    ],
  },
  {
    dividerBefore: true,
    items: [
      { labelKey: 'nav.atelie', icon: Factory, to: ROUTES.ATELIE_EMPLOYEES, permission: PERMISSIONS.ATELIE_VIEW, badgeKey: 'atelieTasks', badgeTone: 'gray' },
      { labelKey: 'nav.production', icon: Scissors, to: ROUTES.PRODUCTION_DASHBOARD, permission: PERMISSIONS.PRODUCTION_VIEW },
    ],
  },
  {
    dividerBefore: true,
    items: [
      { labelKey: 'nav.automation', icon: MessageCircle, to: ROUTES.AUTOMATION, permission: [PERMISSIONS.AUTOMATION_VIEW, PERMISSIONS.WHATSAPP_CONNECT] },
      { labelKey: 'nav.settings', icon: Settings, to: ROUTES.SETTINGS, permission: PERMISSIONS.SETTINGS_VIEW },
    ],
  },
];

// ─── Single nav item (flat) ──────────────────────────────────────────────────

function SidebarNavItem({
  item,
  collapsed,
  badgeCount,
}: {
  item: NavItem;
  collapsed: boolean;
  badgeCount?: number;
}) {
  const Icon = item.icon;
  const { t } = useTranslation();
  const label = t(item.labelKey);
  const showBadge = badgeCount !== undefined && badgeCount > 0;
  const badgeTone = item.badgeTone ?? 'gray';

  return (
    <div className="group relative">
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition-all duration-150',
            collapsed && 'md:justify-center md:px-2',
            isActive
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-500 hover:bg-accent hover:text-primary',
          )
        }
      >
        <span className="relative shrink-0">
          <Icon size={18} />
          {/* Mini-dot — only when the rail is collapsed (the numeric pill
              below sits next to the label in the expanded view). */}
          {collapsed && showBadge && (
            <span
              className={cn(
                'absolute -right-1 -top-1 hidden h-2 w-2 rounded-full ring-2 ring-white md:block',
                badgeTone === 'red' ? 'bg-red-500' : 'bg-gray-400',
              )}
            />
          )}
        </span>
        <span className={cn('truncate', collapsed && 'md:hidden')}>{label}</span>
        {/* Numeric pill — visible in the expanded rail and on mobile.
            Hidden on collapsed md+ since the dot above replaces it. */}
        {showBadge && (
          <span
            className={cn(
              'ml-auto rounded-full px-1.5 py-px text-[10px] font-bold',
              collapsed && 'md:hidden',
              badgeTone === 'red'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600',
            )}
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </NavLink>

      {collapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 md:block">
          {label}
          {showBadge && <span className="ml-1.5 text-white/70">· {badgeCount}</span>}
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-4 border-transparent border-r-gray-900" />
        </div>
      )}
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  const { user, hasPermission, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const badges = useNavBadges();

  const handleLogout = async () => {
    try {
      if (refreshToken) await authService.logout(refreshToken);
    } catch {
      // Swallow — logout locally regardless
    }
    logout();
    navigate(ROUTES.LOGIN, { replace: true });
  };

  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onMobileClose}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity md:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-[260px] flex-col border-r border-gray-100 bg-white transition-transform duration-200 md:static md:z-0 md:translate-x-0 md:transition-all',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          collapsed ? 'md:w-16' : 'md:w-60',
        )}
      >
        {/* Logo area */}
        <div
          className={cn(
            'flex items-center border-b border-gray-100 py-4',
            collapsed ? 'px-4 md:justify-center md:px-2' : 'gap-3 px-4',
          )}
        >
          {/* Full wordmark + tagline — visible whenever the side text block
              would have been (i.e. always on mobile, and on md+ only when
              the rail is expanded). */}
          <div className={cn('min-w-0 flex-1', collapsed && 'md:hidden')}>
            <BrandLogo className="text-[13px]" />
            <p className="mt-0.5 truncate text-[10px] text-gray-400">{t('brand.tagline')}</p>
          </div>
          {/* Compact "A" mark — only on md+ when the rail is collapsed
              (the wide wordmark won't fit a 64px rail). */}
          <div
            className={cn(
              'hidden h-9 w-9 shrink-0 items-center justify-center rounded-btn text-base font-bold text-white shadow-card',
              collapsed && 'md:flex',
            )}
            style={{ background: 'linear-gradient(135deg, #18181B 0%, #27272A 100%)' }}
          >
            A
          </div>
          {/* Mobile close button */}
          <button
            onClick={onMobileClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 md:hidden"
            aria-label={t('common.closeMenu')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          {NAV_SECTIONS.map((section, sIdx) => (
            <div key={sIdx}>
              {section.dividerBefore && (
                <div className={cn('my-2 border-t border-gray-100', collapsed ? 'mx-4 md:mx-2' : 'mx-4')} />
              )}
              <div className={cn('flex flex-col gap-0.5', collapsed ? 'px-3 md:px-2' : 'px-3')}>
                {section.items
                  .filter((item) => {
                    if (!item.permission) return true;
                    if (typeof item.permission === 'string') return hasPermission(item.permission);
                    return item.permission.some((p) => hasPermission(p));
                  })
                  .map((item) => (
                    <SidebarNavItem
                      key={item.to}
                      item={item}
                      collapsed={collapsed}
                      badgeCount={item.badgeKey ? badges[item.badgeKey] : undefined}
                    />
                  ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom: user info + logout — soft gray slab matching the light
            TopBar so the layout reads as one coherent surface. */}
        <div
          className={cn(
            'border-t border-gray-100 bg-gray-50/80 py-3',
            collapsed ? 'px-3 md:px-2' : 'px-3',
          )}
        >
          {user && (
            <div className={cn('mb-2 flex items-center gap-2.5 rounded-btn px-2 py-2', collapsed && 'md:hidden')}>
              {(() => {
                const avatarSrc = resolveImageUrl(user.avatarUrl);
                return avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={user.name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-gray-200"
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #4B5563, #6B7280)' }}
                  >
                    {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                );
              })()}
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{user.name}</p>
                <p className="truncate text-[10px] text-gray-400">{user.role.label}</p>
              </div>
            </div>
          )}

          <div className="group relative">
            <button
              onClick={handleLogout}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-btn px-3 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600',
                collapsed && 'md:justify-center md:px-2',
              )}
            >
              <LogOut size={16} className="shrink-0" />
              <span className={cn(collapsed && 'md:hidden')}>{t('common.logout')}</span>
            </button>

            {collapsed && (
              <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 md:block">
                {t('common.logout')}
              </div>
            )}
          </div>
        </div>

        {/* Desktop-only collapse toggle */}
        <button
          onClick={onToggle}
          className="absolute top-[72px] z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:border-primary hover:text-primary md:flex"
          style={{ right: -12 }}
          aria-label={t('common.toggleSidebar')}
        >
          <ChevronLeft
            size={12}
            className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
          />
        </button>
      </aside>
    </>
  );
}
