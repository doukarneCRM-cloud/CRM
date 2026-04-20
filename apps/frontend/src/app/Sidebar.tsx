import { NavLink, useNavigate } from 'react-router-dom';
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
  ChevronLeft,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/api';

// ─── Nav item config ──────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  icon: React.ElementType;
  to: string;
  permission?: string;
}

interface NavSection {
  items: NavItem[];
  dividerBefore?: boolean;
}

const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, to: ROUTES.DASHBOARD, permission: PERMISSIONS.DASHBOARD_VIEW },
      { label: 'Orders', icon: Package, to: ROUTES.ORDERS, permission: PERMISSIONS.ORDERS_VIEW },
      { label: 'Call Center', icon: Phone, to: ROUTES.CALL_CENTER, permission: PERMISSIONS.CALL_CENTER_VIEW },
      { label: 'Products', icon: ShoppingBag, to: ROUTES.PRODUCTS_LIST, permission: PERMISSIONS.PRODUCTS_VIEW },
      { label: 'Clients', icon: Users, to: ROUTES.CLIENTS, permission: PERMISSIONS.CLIENTS_VIEW },
      { label: 'Team', icon: User, to: ROUTES.TEAM_AGENTS, permission: PERMISSIONS.TEAM_VIEW },
      { label: 'Analytics', icon: BarChart3, to: ROUTES.ANALYTICS, permission: PERMISSIONS.ANALYTICS_VIEW },
      { label: 'Money', icon: Wallet, to: ROUTES.MONEY, permission: PERMISSIONS.MONEY_VIEW },
      { label: 'Returns', icon: PackageSearch, to: ROUTES.RETURNS, permission: PERMISSIONS.RETURNS_VERIFY },
      { label: 'Integrations', icon: Link2, to: ROUTES.INTEGRATIONS_STORE, permission: PERMISSIONS.INTEGRATIONS_VIEW },
    ],
  },
  {
    dividerBefore: true,
    items: [
      { label: 'Atelie', icon: Factory, to: ROUTES.ATELIE_EMPLOYEES, permission: PERMISSIONS.ATELIE_VIEW },
    ],
  },
  {
    dividerBefore: true,
    items: [
      { label: 'Settings', icon: Settings, to: ROUTES.SETTINGS, permission: PERMISSIONS.SETTINGS_VIEW },
    ],
  },
];

// ─── Single nav item (flat) ──────────────────────────────────────────────────

function SidebarNavItem({
  item,
  collapsed,
}: {
  item: NavItem;
  collapsed: boolean;
}) {
  const Icon = item.icon;

  return (
    <div className="group relative">
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition-all duration-150',
            collapsed ? 'justify-center px-2' : '',
            isActive
              ? 'bg-primary text-white shadow-sm'
              : 'text-gray-500 hover:bg-accent hover:text-primary',
          )
        }
      >
        <Icon size={18} className="shrink-0" />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>

      {collapsed && (
        <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {item.label}
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
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, hasPermission, logout, refreshToken } = useAuthStore();
  const navigate = useNavigate();

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
    <aside
      className="flex h-screen flex-col border-r border-gray-100 bg-white transition-all duration-200"
      style={{ width: collapsed ? 64 : 240 }}
    >
      {/* Logo area */}
      <div
        className={cn(
          'flex items-center border-b border-gray-100 py-4',
          collapsed ? 'justify-center px-2' : 'gap-3 px-4',
        )}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-btn text-base font-bold text-white shadow-card"
          style={{ background: 'linear-gradient(135deg, #6B4226 0%, #9C6B4E 100%)' }}
        >
          A
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-primary">Anaqatoki</p>
            <p className="text-[10px] text-gray-400">CRM Platform</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={sIdx}>
            {section.dividerBefore && (
              <div className={cn('my-2 border-t border-gray-100', collapsed ? 'mx-2' : 'mx-4')} />
            )}
            <div className={cn('flex flex-col gap-0.5', collapsed ? 'px-2' : 'px-3')}>
              {section.items
                .filter((item) => !item.permission || hasPermission(item.permission))
                .map((item) => (
                  <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
                ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: user info + logout */}
      <div className={cn('border-t border-gray-100 py-3', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && user && (
          <div className="mb-2 flex items-center gap-2.5 rounded-btn px-2 py-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #6B4226, #9C6B4E)' }}
            >
              {user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
            </div>
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
              collapsed && 'justify-center px-2',
            )}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && 'Logout'}
          </button>

          {collapsed && (
            <div className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
              Logout
            </div>
          )}
        </div>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-[72px] flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:border-primary hover:text-primary"
        style={{ position: 'fixed', left: collapsed ? 52 : 228, top: 72, zIndex: 50 }}
      >
        <ChevronLeft
          size={12}
          className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
        />
      </button>
    </aside>
  );
}
