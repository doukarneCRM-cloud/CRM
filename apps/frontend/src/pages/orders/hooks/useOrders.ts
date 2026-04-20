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

  // Socket: re-fetch list on order updates
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const handler = () => fetchRef.current();
      socket.on('order:created', handler);
      socket.on('order:updated', handler);
      socket.on('order:archived', handler);
      socket.on('order:bulk_updated', handler);
      return () => {
        socket?.off('order:created', handler);
        socket?.off('order:updated', handler);
        socket?.off('order:archived', handler);
        socket?.off('order:bulk_updated', handler);
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
