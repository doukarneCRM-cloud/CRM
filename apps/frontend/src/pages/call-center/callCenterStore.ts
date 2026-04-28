import { create } from 'zustand';
import type { Order } from '@/types/orders';

export type PipelineSection = 'confirmation' | 'shipping';

interface CallCenterState {
  selectedOrder: Order | null;
  refreshKey: number;
  // Orders whose duplicate popup the agent has already dismissed (Skip/Cancel)
  // this session. Prevents re-prompting on every re-open of the same order.
  // Cleared on full page reload.
  dismissedDuplicateOrderIds: Set<string>;
  // Pipeline view state is owned here so the KPI cards can drive the table's
  // active tab + status filter (click a chip → jump straight to that slice).
  activeTab: PipelineSection;
  confirmationFilter: string | null;
  shippingFilter: string | null;
  // Which shipping status group the agent is currently viewing on the
  // Shipping tab. null = "All" group (every shipping wording on the
  // pipeline). The sentinel '__other__' is the "Other" group (orphans).
  // Lifted out of FilterPills so the row table can scope itself to the
  // active group's statusKeys — clicking an empty group used to leave
  // the table showing every order from other groups.
  shippingGroupId: string | null;
}

interface CallCenterActions {
  openOrder: (order: Order) => void;
  closeOrder: () => void;
  triggerRefresh: () => void;
  dismissDuplicatesFor: (orderId: string) => void;
  setActiveTab: (tab: PipelineSection) => void;
  setConfirmationFilter: (status: string | null) => void;
  setShippingFilter: (status: string | null) => void;
  setShippingGroupId: (id: string | null) => void;
  applyPipelineFilter: (section: PipelineSection, status: string | null) => void;
}

export const useCallCenterStore = create<CallCenterState & CallCenterActions>((set) => ({
  selectedOrder: null,
  refreshKey: 0,
  dismissedDuplicateOrderIds: new Set(),
  activeTab: 'confirmation',
  confirmationFilter: null,
  shippingFilter: null,
  shippingGroupId: null,

  openOrder: (order) => set({ selectedOrder: order }),
  closeOrder: () => set({ selectedOrder: null }),
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  dismissDuplicatesFor: (orderId) =>
    set((s) => ({
      dismissedDuplicateOrderIds: new Set(s.dismissedDuplicateOrderIds).add(orderId),
    })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setConfirmationFilter: (status) => set({ confirmationFilter: status }),
  setShippingFilter: (status) => set({ shippingFilter: status }),
  setShippingGroupId: (id) => set({ shippingGroupId: id, shippingFilter: null }),
  applyPipelineFilter: (section, status) =>
    set(
      section === 'confirmation'
        ? { activeTab: 'confirmation', confirmationFilter: status }
        : { activeTab: 'shipping', shippingFilter: status },
    ),
}));
