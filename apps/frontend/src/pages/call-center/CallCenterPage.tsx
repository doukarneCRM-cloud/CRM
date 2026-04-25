import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { AgentKpiCards } from './components/AgentKpiCards';
import { CallCenterTable } from './components/CallCenterTable';
import { CallCenterOrderModal } from './components/CallCenterOrderModal';
import { useCallCenterStore } from './callCenterStore';
import { OrderCreateModal } from '../orders/components/OrderCreateModal';
import { BroadcastTopBar } from '@/components/broadcasts/BroadcastTopBar';

export default function CallCenterPage() {
  const { t } = useTranslation();
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission(PERMISSIONS.ORDERS_CREATE);
  const triggerRefresh = useCallCenterStore((s) => s.triggerRefresh);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto sm:gap-6">
      <header className="min-w-0">
        <h1 className="text-xl font-bold text-primary sm:text-2xl">{t('callCenter.title')}</h1>
        <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm">
          {t('callCenter.subtitle')}
        </p>
      </header>

      <BroadcastTopBar />

      <AgentKpiCards />

      <CallCenterTable onCreate={canCreate ? () => setCreateOpen(true) : undefined} />
      <CallCenterOrderModal />

      <OrderCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={triggerRefresh}
      />
    </div>
  );
}
