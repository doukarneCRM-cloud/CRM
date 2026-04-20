import { create } from 'zustand';
import type { Order } from '@/types/orders';

interface CallCenterState {
  selectedOrder: Order | null;
  refreshKey: number;
}

interface CallCenterActions {
  openOrder: (order: Order) => void;
  closeOrder: () => void;
  triggerRefresh: () => void;
}

export const useCallCenterStore = create<CallCenterState & CallCenterActions>((set) => ({
  selectedOrder: null,
  refreshKey: 0,

  openOrder: (order) => set({ selectedOrder: order }),
  closeOrder: () => set({ selectedOrder: null }),
  triggerRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
