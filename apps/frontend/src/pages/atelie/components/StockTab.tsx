import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FabricRollsTab } from './FabricRollsTab';
import { AccessoriesTab } from './AccessoriesTab';

type StockSubTab = 'fabric' | 'accessories';

export function StockTab() {
  const { t } = useTranslation();
  const [sub, setSub] = useState<StockSubTab>('fabric');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-gray-200">
        <button
          onClick={() => setSub('fabric')}
          className={`px-4 py-2 text-xs font-semibold transition ${
            sub === 'fabric'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t('atelie.stock.fabricRolls')}
        </button>
        <button
          onClick={() => setSub('accessories')}
          className={`px-4 py-2 text-xs font-semibold transition ${
            sub === 'accessories'
              ? 'border-b-2 border-primary text-primary'
              : 'text-gray-500 hover:text-gray-800'
          }`}
        >
          {t('atelie.stock.accessories')}
        </button>
      </div>

      {sub === 'fabric' && <FabricRollsTab />}
      {sub === 'accessories' && <AccessoriesTab />}
    </div>
  );
}
