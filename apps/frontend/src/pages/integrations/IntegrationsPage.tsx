import { useState } from 'react';
import { PillTabGroup } from '@/components/ui/PillTab';
import { YoucanTab } from './components/YoucanTab';
import { ColiixTab } from './components/ColiixTab';

type TabId = 'youcan' | 'coliix';

const TABS = [
  { id: 'youcan', label: 'YouCan' },
  { id: 'coliix', label: 'Coliix' },
];

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('youcan');

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">Integrations</h1>
        <p className="text-xs text-gray-400">
          External services that power product sync, order import, and shipping.
        </p>
      </div>

      <div className="mb-5">
        <PillTabGroup
          tabs={TABS}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
      </div>

      {activeTab === 'youcan' && <YoucanTab />}
      {activeTab === 'coliix' && <ColiixTab />}
    </div>
  );
}
