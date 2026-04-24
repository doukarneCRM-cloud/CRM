import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users as UsersIcon, Shield, GitBranch } from 'lucide-react';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';

export function TeamTabs() {
  const { t } = useTranslation();
  const tabs = [
    { to: ROUTES.TEAM_AGENTS,     label: t('team.tabs.agents'),     icon: UsersIcon },
    { to: ROUTES.TEAM_ROLES,      label: t('team.tabs.roles'),      icon: Shield    },
    { to: ROUTES.TEAM_ASSIGNMENT, label: t('team.tabs.assignment'), icon: GitBranch },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-gray-100 bg-white/80 px-1 backdrop-blur-sm">
      {tabs.map(({ to, label, icon: Icon }) => (
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
