import { useEffect, useRef, useState, useCallback } from 'react';
import { useFilterStore } from '@/store/filterStore';
import { getSocket } from '@/services/socket';
import type { DashboardFilters } from '@/services/dashboardApi';

/**
 * Build the wire-format filter payload from the global filter store.
 *
 * The same store powers Orders / Dashboard / Analytics / Returns so a chip
 * change anywhere in the CRM produces matching numbers everywhere — that's
 * the whole point of the global filter bar.
 */
export function useDashboardFilters(): DashboardFilters {
  const cities = useFilterStore((s) => s.cities);
  const agentIds = useFilterStore((s) => s.agentIds);
  const productIds = useFilterStore((s) => s.productIds);
  const confirmationStatuses = useFilterStore((s) => s.confirmationStatuses);
  const shippingStatuses = useFilterStore((s) => s.shippingStatuses);
  const sources = useFilterStore((s) => s.sources);
  const dateRange = useFilterStore((s) => s.dateRange);

  return {
    cities: cities.length ? cities.join(',') : undefined,
    agentIds: agentIds.length ? agentIds.join(',') : undefined,
    productIds: productIds.length ? productIds.join(',') : undefined,
    confirmationStatuses: confirmationStatuses.length ? confirmationStatuses.join(',') : undefined,
    shippingStatuses: shippingStatuses.length ? shippingStatuses.join(',') : undefined,
    sources: sources.length ? sources.join(',') : undefined,
    dateFrom: dateRange.from ?? undefined,
    dateTo: dateRange.to ?? undefined,
  };
}

/**
 * Card hook — fetches via the supplied loader on mount, refetches on any of
 * the configured socket events, and ALSO refetches whenever a filter
 * changes (via the JSON-stringified deps key).
 *
 * Each card decides which order events affect it; the filter dependency is
 * shared across every card so the "filter, then refresh" experience is
 * consistent.
 */
export function useDashboardCard<T>(
  loader: () => Promise<T>,
  events: string[],
  deps: unknown = null,
): { data: T | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await loaderRef.current();
      setData(fresh);
    } catch {
      // ignore — leave stale data on screen
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + reload whenever filter deps change. Stringify to dodge
  // referential-equality re-runs on otherwise-identical filter objects.
  const depKey = JSON.stringify(deps);
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, refetch]);

  // Socket subscriptions — fire surgically on the events the caller picked.
  useEffect(() => {
    if (events.length === 0) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const handler = () => {
        refetch();
      };
      for (const ev of events) socket.on(ev, handler);
      return () => {
        for (const ev of events) socket?.off(ev, handler);
      };
    } catch {
      // socket not ready — initial load already populated.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join('|'), refetch]);

  return { data, loading, refetch };
}
