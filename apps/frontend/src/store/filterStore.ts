import { create } from 'zustand';

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface FilterState {
  cities: string[];
  agentIds: string[];
  productIds: string[];
  dateRange: DateRange;
  confirmationStatuses: string[];
  shippingStatuses: string[];
  sources: string[];
}

interface FilterActions {
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  toggleArrayFilter: (
    key:
      | 'cities'
      | 'agentIds'
      | 'productIds'
      | 'confirmationStatuses'
      | 'shippingStatuses'
      | 'sources',
    value: string,
  ) => void;
  clearFilter: (key: keyof FilterState) => void;
  clearAll: () => void;
  hasActiveFilters: () => boolean;
  activeFilterCount: () => number;
}

const DEFAULT_STATE: FilterState = {
  cities: [],
  agentIds: [],
  productIds: [],
  dateRange: { from: null, to: null },
  confirmationStatuses: [],
  shippingStatuses: [],
  sources: [],
};

export const useFilterStore = create<FilterState & FilterActions>((set, get) => ({
  ...DEFAULT_STATE,

  setFilter: (key, value) => set({ [key]: value }),

  toggleArrayFilter: (key, value) => {
    const current = get()[key] as string[];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    set({ [key]: next });
  },

  clearFilter: (key) => {
    const defaults = DEFAULT_STATE as unknown as Record<string, unknown>;
    set({ [key]: defaults[key] });
  },

  clearAll: () => set(DEFAULT_STATE),

  hasActiveFilters: () => {
    const state = get();
    return (
      state.cities.length > 0 ||
      state.agentIds.length > 0 ||
      state.productIds.length > 0 ||
      state.confirmationStatuses.length > 0 ||
      state.shippingStatuses.length > 0 ||
      state.sources.length > 0 ||
      state.dateRange.from !== null ||
      state.dateRange.to !== null
    );
  },

  activeFilterCount: () => {
    const state = get();
    let count = 0;
    count += state.cities.length;
    count += state.agentIds.length;
    count += state.productIds.length;
    count += state.confirmationStatuses.length;
    count += state.shippingStatuses.length;
    count += state.sources.length;
    if (state.dateRange.from || state.dateRange.to) count += 1;
    return count;
  },
}));
