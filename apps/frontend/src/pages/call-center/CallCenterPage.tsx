import { useState } from 'react';
import { Plus } from 'lucide-react';
import { CRMButton } from '@/components/ui/CRMButton';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/constants/permissions';
import { AgentKpiCards } from './components/AgentKpiCards';
import { CallCenterTable } from './components/CallCenterTable';
import { CallCenterOrderModal } from './components/CallCenterOrderModal';
import { useCallCenterStore } from './callCenterStore';
import { OrderCreateModal } from '../orders/components/OrderCreateModal';

export default function CallCenterPage() {
  const { hasPermission } = useAuthStore();
  const canCreate = hasPermission(PERMISSIONS.ORDERS_CREATE);
  const triggerRefresh = useCallCenterStore((s) => s.triggerRefresh);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto sm:gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-primary sm:text-2xl">Call Center</h1>
          <p className="mt-0.5 text-xs text-gray-500 sm:mt-1 sm:text-sm">
            Manage your assigned orders — confirm, cancel, and follow up.
          </p>
        </div>
        {canCreate && (
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
            className="w-full sm:w-auto"
          >
            New manual order
          </CRMButton>
        )}
      </header>

      <AgentKpiCards />

      <CallCenterTable />
      <CallCenterOrderModal />

      <OrderCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={triggerRefresh}
      />
    </div>
  );
}
