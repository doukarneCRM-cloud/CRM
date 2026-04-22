import { useState } from 'react';
import { MessageSquare, Smartphone, ScrollText, SlidersHorizontal } from 'lucide-react';
import { TemplatesTab } from './tabs/TemplatesTab';
import { SessionsTab } from './tabs/SessionsTab';
import { LogsTab } from './tabs/LogsTab';
import { RulesTab } from './tabs/RulesTab';

type TabKey = 'rules' | 'templates' | 'sessions' | 'logs';

const TABS: { id: TabKey; label: string; icon: React.ElementType }[] = [
  { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
  { id: 'templates', label: 'Templates', icon: MessageSquare },
  { id: 'sessions', label: 'Sessions', icon: Smartphone },
  { id: 'logs', label: 'Logs', icon: ScrollText },
];

export default function AutomationPage() {
  const [tab, setTab] = useState<TabKey>('rules');

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Automation</h1>
        <p className="mt-1 text-sm text-gray-500">
          WhatsApp rules, templates, agent sessions, and delivery logs.
        </p>
      </header>

      <div className="flex items-center gap-2 rounded-card border border-gray-200 bg-white p-1.5 shadow-sm">
        {TABS.map((t) => {
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
              className="flex items-center gap-2 rounded-btn px-4 py-2 text-sm font-semibold transition-colors"
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1">
        {tab === 'rules' && <RulesTab />}
        {tab === 'templates' && <TemplatesTab />}
        {tab === 'sessions' && <SessionsTab />}
        {tab === 'logs' && <LogsTab />}
      </div>
    </div>
  );
}
