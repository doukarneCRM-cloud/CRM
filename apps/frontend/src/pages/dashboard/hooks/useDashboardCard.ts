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
  // Track whether we've ever loaded data successfully. The loading skeleton
  // should only appear before the first successful fetch — every subsequent
  // refetch (filter change, socket event, manual) keeps the previous data
  // visible while the new data is in flight, then swaps silently. Without
  // this, a single new order across the team would flash 11 dashboard
  // skeletons every few seconds.
  const hasDataRef = useRef(false);

  const refetch = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true);
    try {
      const fresh = await loaderRef.current();
      setData(fresh);
      hasDataRef.current = true;
    } catch {
      // ignore — leave stale data on screen
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce socket-triggered refetches: 11 dashboard cards each refetching
  // on the same `order:updated` event would cascade ~11 simultaneous network
  // calls + 11 re-renders, locking the main thread for ~400ms. With a 250ms
  // window only one refetch per card runs even if 5 events arrive in a burst.
  const debouncedRefetch = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (debouncedRefetch.current) clearTimeout(debouncedRefetch.current);
    debouncedRefetch.current = setTimeout(() => {
      void refetch();
    }, 250);
  }, [refetch]);

  // Initial load + reload whenever filter deps change. Stringify to dodge
  // referential-equality re-runs on otherwise-identical filter objects.
  const depKey = JSON.stringify(deps);
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, refetch]);

  // Socket subscriptions — fire surgically on the events the caller picked.
  // Plus a refetch on every (re)connect so we recover from any window where
  // the socket was disconnected (token refresh, network blip, server restart).
  // Without this, events emitted while the socket is reauthing land in the
  // void and the card stays stale until the next manual reload.
  useEffect(() => {
    if (events.length === 0) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const handler = () => () => {
        scheduleRefetch();
      };
      const onReconnect = () => {
        scheduleRefetch();
      };
      const handlers = events.map((ev) => [ev, handler()] as const);
      for (const [ev, h] of handlers) socket.on(ev, h);
      socket.on('connect', onReconnect);
      return () => {
        for (const [ev, h] of handlers) socket?.off(ev, h);
        socket?.off('connect', onReconnect);
        if (debouncedRefetch.current) clearTimeout(debouncedRefetch.current);
      };
    } catch {
      // socket not ready — initial load already populated.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.join('|'), refetch]);

  return { data, loading, refetch };
}
