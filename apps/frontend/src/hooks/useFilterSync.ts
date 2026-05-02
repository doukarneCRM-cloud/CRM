import { useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilterStore } from '@/store/filterStore';

/**
 * Syncs the global filter store to/from URL query params.
 * Call once in your page component — it reads from URL on mount
 * and writes back to URL whenever filters change.
 */
export function useFilterSync() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Subscribe to slices individually so React's exhaustive-deps lint can
  // verify the effect's dependencies statically. Reading the whole store
  // and indexing it via `state[key]` hides the dependency graph from the
  // linter and from React's reconciler.
  const cities = useFilterStore((s) => s.cities);
  const agentIds = useFilterStore((s) => s.agentIds);
  const productIds = useFilterStore((s) => s.productIds);
  const confirmationStatuses = useFilterStore((s) => s.confirmationStatuses);
  const shippingStatuses = useFilterStore((s) => s.shippingStatuses);
  const sources = useFilterStore((s) => s.sources);
  const dateRange = useFilterStore((s) => s.dateRange);
  const setFilter = useFilterStore((s) => s.setFilter);
  const clearAll = useFilterStore((s) => s.clearAll);

  // On mount: restore filters from URL. Runs once — `searchParams`,
  // `setFilter`, and `clearAll` are intentionally read fresh from the
  // initial render, so we don't want this to re-run when they change.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    clearAll();

    const cityParam = searchParams.get('cities');
    if (cityParam) setFilter('cities', cityParam.split(','));
    const agentParam = searchParams.get('agentIds');
    if (agentParam) setFilter('agentIds', agentParam.split(','));
    const productParam = searchParams.get('productIds');
    if (productParam) setFilter('productIds', productParam.split(','));
    const confirmParam = searchParams.get('confirmationStatuses');
    if (confirmParam) setFilter('confirmationStatuses', confirmParam.split(','));
    const shipParam = searchParams.get('shippingStatuses');
    if (shipParam) setFilter('shippingStatuses', shipParam.split(','));
    const sourceParam = searchParams.get('sources');
    if (sourceParam) setFilter('sources', sourceParam.split(','));

    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      setFilter('dateRange', { from: dateFrom, to: dateTo });
    }
  }, [searchParams, setFilter, clearAll]);

  // Whenever filters change: write to URL.
  useEffect(() => {
    const params = new URLSearchParams();
    if (cities.length > 0) params.set('cities', cities.join(','));
    if (agentIds.length > 0) params.set('agentIds', agentIds.join(','));
    if (productIds.length > 0) params.set('productIds', productIds.join(','));
    if (confirmationStatuses.length > 0) params.set('confirmationStatuses', confirmationStatuses.join(','));
    if (shippingStatuses.length > 0) params.set('shippingStatuses', shippingStatuses.join(','));
    if (sources.length > 0) params.set('sources', sources.join(','));
    if (dateRange.from) params.set('dateFrom', dateRange.from);
    if (dateRange.to) params.set('dateTo', dateRange.to);

    setSearchParams(params, { replace: true });
  }, [
    cities,
    agentIds,
    productIds,
    confirmationStatuses,
    shippingStatuses,
    sources,
    dateRange,
    setSearchParams,
  ]);

  const getQueryObject = useCallback(() => {
    const q: Record<string, string | string[]> = {};
    if (cities.length > 0) q.cities = cities;
    if (agentIds.length > 0) q.agentIds = agentIds;
    if (productIds.length > 0) q.productIds = productIds;
    if (confirmationStatuses.length > 0) q.confirmationStatuses = confirmationStatuses;
    if (shippingStatuses.length > 0) q.shippingStatuses = shippingStatuses;
    if (sources.length > 0) q.sources = sources;
    if (dateRange.from) q.dateFrom = dateRange.from;
    if (dateRange.to) q.dateTo = dateRange.to;
    return q;
  }, [cities, agentIds, productIds, confirmationStatuses, shippingStatuses, sources, dateRange]);

  return { getQueryObject };
}
