import { create } from 'zustand';
import type { Order } from '@/types/orders';

interface CallCenterState {
  selectedOrder: Order | null;
  refreshKey: number;
  // Orders whose duplicate popup the agent has already dismissed (Skip/Cancel)
  // this session. Prevents re-prompting on every re-open of the same order.
  // Cleared on full page reload.
  dismissedDuplicateOrderIds: Set<string>;
}

interface CallCenterActions {
  openOrder: (order: Order) => void;
  closeOrder: () => void;
  triggerRefresh: () => void;
  dismissDuplicatesFor: (orderId: string) => void;
}

export const useCallCenterStore = create<CallCenterState & CallCenterActions>((set) => ({
  selectedOrder: null,
  refreshKey: 0,
  dismissedDuplicateOrderIds: new Set(),

  openOrder: (order) => set({ selectedOrder: order }),
  closeOrder: () => set({ selectedOrder: null }),
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  dismissDuplicatesFor: (orderId) =>
    set((s) => ({
      dismissedDuplicateOrderIds: new Set(s.dismissedDuplicateOrderIds).add(orderId),
    })),
}));
