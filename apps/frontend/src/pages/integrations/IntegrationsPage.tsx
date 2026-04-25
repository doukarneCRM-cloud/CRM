import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PillTabGroup } from '@/components/ui/PillTab';
import { YoucanTab } from './components/YoucanTab';
import { ColiixTab } from './components/ColiixTab';

type TabId = 'youcan' | 'coliix';

export default function IntegrationsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('youcan');

  const tabs = useMemo(
    () => [
      { id: 'youcan', label: t('integrations.page.tabs.youcan') },
      { id: 'coliix', label: t('integrations.page.tabs.coliix') },
    ],
    [t],
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-900">{t('integrations.page.title')}</h1>
        <p className="text-xs text-gray-400">{t('integrations.page.subtitle')}</p>
      </div>

      <div className="mb-5">
        <PillTabGroup
          tabs={tabs}
          activeTab={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />
      </div>

      {activeTab === 'youcan' && <YoucanTab />}
      {activeTab === 'coliix' && <ColiixTab />}
    </div>
  );
}
