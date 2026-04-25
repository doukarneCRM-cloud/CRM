import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Inbox,
  MessageSquare,
  ScrollText,
  SlidersHorizontal,
  Smartphone,
} from 'lucide-react';
import { TemplatesTab } from './tabs/TemplatesTab';
import { SessionsTab } from './tabs/SessionsTab';
import { LogsTab } from './tabs/LogsTab';
import { RulesTab } from './tabs/RulesTab';
import { InboxTab } from './tabs/InboxTab';
import { OverviewTab } from './tabs/OverviewTab';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';

type TabKey = 'overview' | 'inbox' | 'rules' | 'templates' | 'sessions' | 'logs';

interface TabDef {
  id: TabKey;
  label: string;
  icon: React.ElementType;
  permission?: string;
}

export default function AutomationPage() {
  const { t } = useTranslation();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  // Tab visibility is per-permission. The Sessions tab is the only one
  // visible to agents (gated by whatsapp:connect) — everything else is
  // admin/supervisor work and requires automation:* permissions.
  const TABS = useMemo<TabDef[]>(
    () => [
      { id: 'overview',  label: t('automation.tabs.overview'),  icon: Activity,           permission: PERMISSIONS.AUTOMATION_MONITOR },
      { id: 'inbox',     label: t('automation.tabs.inbox'),     icon: Inbox,              permission: PERMISSIONS.WHATSAPP_VIEW },
      { id: 'rules',     label: t('automation.tabs.rules'),     icon: SlidersHorizontal,  permission: PERMISSIONS.AUTOMATION_MANAGE },
      { id: 'templates', label: t('automation.tabs.templates'), icon: MessageSquare,      permission: PERMISSIONS.AUTOMATION_MANAGE },
      { id: 'sessions',  label: t('automation.tabs.sessions'),  icon: Smartphone,         permission: PERMISSIONS.WHATSAPP_CONNECT },
      { id: 'logs',      label: t('automation.tabs.logs'),      icon: ScrollText,         permission: PERMISSIONS.AUTOMATION_MANAGE },
    ],
    [t],
  );

  const visibleTabs = TABS.filter((tab) => !tab.permission || hasPermission(tab.permission));
  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.id ?? 'rules');

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">{t('automation.page.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('automation.page.subtitle')}</p>
      </header>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
          {visibleTabs.map((tabDef) => {
            const Icon = tabDef.icon;
            const active = tab === tabDef.id;
            return (
              <button
                key={tabDef.id}
                onClick={() => setTab(tabDef.id)}
                className={`group relative flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-700'
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} />
                {tabDef.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'inbox' && <InboxTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'sessions' && <SessionsTab />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  );
}
