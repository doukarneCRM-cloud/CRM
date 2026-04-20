import { useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilterStore, type FilterState } from '@/store/filterStore';

const ARRAY_KEYS: (keyof FilterState)[] = [
  'cities',
  'agentIds',
  'productIds',
  'confirmationStatuses',
  'shippingStatuses',
  'sources',
];

/**
 * Syncs the global filter store to/from URL query params.
 * Call once in your page component — it reads from URL on mount
 * and writes back to URL whenever filters change.
 */
export function useFilterSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { setFilter, clearAll } = useFilterStore();
  const state = useFilterStore();

  // On mount: restore filters from URL
  useEffect(() => {
    clearAll();

    ARRAY_KEYS.forEach((key) => {
      const raw = searchParams.get(key);
      if (raw) {
        setFilter(key as keyof FilterState, raw.split(',') as never);
      }
    });

    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      setFilter('dateRange', { from: dateFrom, to: dateTo });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever filters change: write to URL
  useEffect(() => {
    const params = new URLSearchParams();

    ARRAY_KEYS.forEach((key) => {
      const values = state[key] as string[];
      if (values.length > 0) {
        params.set(key, values.join(','));
      }
    });

    if (state.dateRange.from) params.set('dateFrom', state.dateRange.from);
    if (state.dateRange.to) params.set('dateTo', state.dateRange.to);

    setSearchParams(params, { replace: true });
  }, [
    state.cities,
    state.agentIds,
    state.productIds,
    state.dateRange,
    state.confirmationStatuses,
    state.shippingStatuses,
    state.sources,
    setSearchParams,
  ]);

  const getQueryObject = useCallback(() => {
    const q: Record<string, string | string[]> = {};
    ARRAY_KEYS.forEach((key) => {
      const values = state[key] as string[];
      if (values.length > 0) q[key] = values;
    });
    if (state.dateRange.from) q['dateFrom'] = state.dateRange.from;
    if (state.dateRange.to) q['dateTo'] = state.dateRange.to;
    return q;
  }, [state]);

  return { getQueryObject };
}
