import { useEffect, useCallback, useState, useRef } from 'react';
import { useFilterStore } from '@/store/filterStore';
import { useDebounce } from '@/hooks/useDebounce';
import { getSocket } from '@/services/socket';
import { ordersApi } from '@/services/ordersApi';
import type { Order, Pagination } from '@/types/orders';

interface UseOrdersReturn {
  orders: Order[];
  pagination: Pagination;
  loading: boolean;
  page: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  search: string;
  setSearch: (q: string) => void;
  refresh: () => void;
}

const DEFAULT_PAGINATION: Pagination = {
  page: 1,
  pageSize: 25,
  total: 0,
  totalPages: 0,
};

export function useOrders(): UseOrdersReturn {
  const filters = useFilterStore();

  const [orders, setOrders] = useState<Order[]>([]);
  const [pagination, setPagination] = useState<Pagination>(DEFAULT_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);

  // Stable ref for fetch to avoid stale closure in socket handler
  const fetchRef = useRef<() => void>(() => {});
  // Refs for page/pageSize so the order:created socket handler reads the
  // current values without forcing the effect to re-subscribe on every
  // pagination change.
  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  pageRef.current = page;
  pageSizeRef.current = pageSize;

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ordersApi.list({
        page,
        pageSize,
        search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
        confirmationStatuses:
          filters.confirmationStatuses.length > 0
            ? filters.confirmationStatuses.join(',')
            : undefined,
        shippingStatuses:
          filters.shippingStatuses.length > 0
            ? filters.shippingStatuses.join(',')
            : undefined,
        agentIds:
          filters.agentIds.length > 0 ? filters.agentIds.join(',') : undefined,
        cities:
          filters.cities.length > 0 ? filters.cities.join(',') : undefined,
        productIds:
          filters.productIds.length > 0 ? filters.productIds.join(',') : undefined,
        sources:
          filters.sources.length > 0 ? filters.sources.join(',') : undefined,
        dateFrom: filters.dateRange.from ?? undefined,
        dateTo: filters.dateRange.to ?? undefined,
      });
      setOrders(result.data);
      setPagination(result.pagination);
      // Clear selection on new fetch
      setSelectedIds([]);
    } catch {
      // Silently fail — global error handling handles auth errors
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    debouncedSearch,
    filters.confirmationStatuses,
    filters.shippingStatuses,
    filters.agentIds,
    filters.cities,
    filters.productIds,
    filters.sources,
    filters.dateRange.from,
    filters.dateRange.to,
  ]);

  fetchRef.current = fetch;

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Reset to page 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filters.confirmationStatuses,
    filters.shippingStatuses,
    filters.agentIds,
    filters.cities,
    filters.productIds,
    filters.sources,
    filters.dateRange.from,
    filters.dateRange.to,
  ]);

  // Live row updates without full-page refetch.
  //
  // Why surgical: the previous implementation called fetchRef.current() on
  // every socket hit, which (1) re-set the entire orders array, (2) reset
  // selectedIds, (3) flashed the loading skeleton, and (4) closed open
  // modals derived from the orders array. The user complained that an
  // edit popup would close mid-typing whenever another agent or a
  // webhook touched any order.
  //
  // New behaviour:
  //   - order:updated     → fetch ONLY that order (ordersApi.getById)
  //                         and patch the matching row in-place. If the
  //                         order isn't in the current page (filter/search
  //                         no longer matches, or it dropped off-page),
  //                         silently skip. Pagination, scroll, selection,
  //                         and any open modal are preserved.
  //   - order:created     → fetch only the new order, prepend it on page 1
  //                         (trim to pageSize to keep length stable), bump
  //                         the total counter on other pages. No full
  //                         refresh — keeps scroll, selection, and any
  //                         open modal intact.
  //   - order:archived    → drop the row in-place from current state.
  //   - order:bulk_updated → still refetch (could affect many rows; cheap
  //                          enough since it's an admin action).
  //   - order:stock_warning → patch in-place (single order's stock flag).
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();

      // Surgical patch — fetch one and merge in place.
      const patchOne = async (payload: unknown) => {
        const orderId = (payload as { orderId?: string })?.orderId;
        if (!orderId) return;
        try {
          const fresh = await ordersApi.getById(orderId);
          setOrders((prev) => {
            // Only update if the order is currently rendered. If the
            // updated order is no longer in this view (dropped off-page,
            // filters now exclude it), skip silently — refetching just to
            // catch this edge case would defeat the whole purpose.
            const idx = prev.findIndex((o) => o.id === orderId);
            if (idx === -1) return prev;
            const next = prev.slice();
            next[idx] = { ...next[idx], ...fresh };
            return next;
          });
        } catch {
          // Order may have been deleted/archived between emit + fetch.
          // Drop it from view defensively rather than refetching.
          setOrders((prev) => prev.filter((o) => o.id !== orderId));
        }
      };

      const dropOne = (payload: unknown) => {
        const orderId = (payload as { orderId?: string })?.orderId;
        if (!orderId) return;
        setOrders((prev) => prev.filter((o) => o.id !== orderId));
      };

      // Surgical insert on order:created — no full refresh. Off-page-1
      // viewers just see the total counter increment so pagination stays
      // accurate; their visible rows are untouched.
      const insertOne = async (payload: unknown) => {
        const orderId = (payload as { orderId?: string })?.orderId;
        if (!orderId) return;
        // Other pages: just bump the count so pagination is correct.
        if (pageRef.current !== 1) {
          setPagination((p) => ({
            ...p,
            total: p.total + 1,
            totalPages: Math.max(1, Math.ceil((p.total + 1) / (p.pageSize || 25))),
          }));
          return;
        }
        try {
          const fresh = await ordersApi.getById(orderId);
          setOrders((prev) => {
            // Skip if the row is already there — guards against a race
            // with a manual refresh in flight.
            if (prev.some((o) => o.id === orderId)) return prev;
            const next = [fresh, ...prev];
            // Trim to pageSize so the table doesn't grow unbounded.
            if (next.length > pageSizeRef.current) next.length = pageSizeRef.current;
            return next;
          });
          setPagination((p) => ({
            ...p,
            total: p.total + 1,
            totalPages: Math.max(1, Math.ceil((p.total + 1) / (p.pageSize || 25))),
          }));
        } catch {
          // Order may not match the current filters server-side, or was
          // already deleted between emit + fetch. Silently skip — better
          // than a full reflow that loses the user's place.
        }
      };

      const fullRefresh = () => fetchRef.current();

      socket.on('order:updated', patchOne);
      socket.on('order:stock_warning', patchOne);
      socket.on('order:archived', dropOne);
      socket.on('order:created', insertOne);
      socket.on('order:bulk_updated', fullRefresh);
      // Recovery on (re)connect — events emitted while the socket was
      // disconnected (token refresh, network blip) would otherwise be missed.
      socket.on('connect', fullRefresh);

      return () => {
        socket?.off('order:updated', patchOne);
        socket?.off('order:stock_warning', patchOne);
        socket?.off('order:archived', dropOne);
        socket?.off('order:created', insertOne);
        socket?.off('order:bulk_updated', fullRefresh);
        socket?.off('connect', fullRefresh);
      };
    } catch {
      // Socket not initialized yet — no-op
    }
  }, []);

  const handleSetPage = useCallback((p: number) => {
    setPage(p);
    setSelectedIds([]);
  }, []);

  const handleSetPageSize = useCallback((s: number) => {
    setPageSize(s);
    setPage(1);
    setSelectedIds([]);
  }, []);

  return {
    orders,
    pagination,
    loading,
    page,
    pageSize,
    setPage: handleSetPage,
    setPageSize: handleSetPageSize,
    selectedIds,
    setSelectedIds,
    search,
    setSearch,
    refresh: fetch,
  };
}
