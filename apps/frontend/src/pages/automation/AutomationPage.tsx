import { useState } from 'react';
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

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: Activity, permission: PERMISSIONS.AUTOMATION_MONITOR },
  { id: 'inbox', label: 'Inbox', icon: Inbox, permission: PERMISSIONS.WHATSAPP_VIEW },
  { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
  { id: 'templates', label: 'Templates', icon: MessageSquare },
  { id: 'sessions', label: 'Sessions', icon: Smartphone },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

export default function AutomationPage() {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const visibleTabs = TABS.filter((t) => !t.permission || hasPermission(t.permission));
  const [tab, setTab] = useState<TabKey>(visibleTabs[0]?.id ?? 'rules');

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Automation</h1>
        <p className="mt-1 text-sm text-gray-500">
          WhatsApp overview, inbox, rules, templates, agent sessions, and delivery logs.
        </p>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto rounded-card border border-gray-200 bg-white p-1.5 shadow-sm">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={
                active
                  ? { backgroundColor: '#3C2515', color: '#ffffff' }
                  : { backgroundColor: 'transparent', color: '#6b7280' }
              }
              className="flex shrink-0 items-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition-colors"
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
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
