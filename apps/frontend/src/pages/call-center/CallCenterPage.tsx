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
    <div className="flex h-full flex-col gap-6 overflow-auto p-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Call Center</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your assigned orders — confirm, cancel, and follow up.
          </p>
        </div>
        {canCreate && (
          <CRMButton
            variant="primary"
            leftIcon={<Plus size={14} />}
            onClick={() => setCreateOpen(true)}
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
