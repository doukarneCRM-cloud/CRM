import { NavLink } from 'react-router-dom';
import { Users as UsersIcon, Shield, GitBranch } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';

const TABS = [
  { to: ROUTES.TEAM_AGENTS,     label: 'Agents',           icon: UsersIcon },
  { to: ROUTES.TEAM_ROLES,      label: 'Roles',            icon: Shield    },
  { to: ROUTES.TEAM_ASSIGNMENT, label: 'Assignment rules', icon: GitBranch },
];

export function TeamTabs() {
  return (
    <div className="flex items-center gap-1 border-b border-gray-100 bg-white/80 px-1 backdrop-blur-sm">
      {TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'text-primary'
                : 'text-gray-500 hover:text-gray-700',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={14} />
              {label}
              {isActive && (
                <span className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-primary" />
              )}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}
