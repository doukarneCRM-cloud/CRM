import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { customersApi, type ClientListItem, type ClientsListFilters } from '@/services/ordersApi';

interface UseClientsState {
  clients: ClientListItem[];
  total: number;
  totalPages: number;
  loading: boolean;
}

const DEFAULT_STATE: UseClientsState = {
  clients: [],
  total: 0,
  totalPages: 0,
  loading: false,
};

/**
 * useClients — encapsulates filter/pagination state for the Clients page,
 * debounces the free-text search, and reloads when any input changes.
 * Exposed `refresh()` lets callers force a reload after a mutation.
 */
export function useClients() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState<string>('');
  const [tag, setTag] = useState<ClientsListFilters['tag'] | ''>('');
  const [sortBy, setSortBy] = useState<ClientsListFilters['sortBy']>('recent');

  const [state, setState] = useState<UseClientsState>(DEFAULT_STATE);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search 300ms — avoids pummeling the API while the user types
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1); // reset page when the query changes
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  // Reset page when any non-debounced filter changes
  useEffect(() => {
    setPage(1);
  }, [city, tag, sortBy, pageSize]);

  const filters = useMemo<ClientsListFilters>(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      city: city || undefined,
      tag: (tag || undefined) as ClientsListFilters['tag'],
      sortBy,
    }),
    [page, pageSize, debouncedSearch, city, tag, sortBy],
  );

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await customersApi.list(filters);
      setState({
        clients: res.data,
        total: res.pagination.total,
        totalPages: res.pagination.totalPages,
        loading: false,
      });
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    // data
    ...state,
    // filter state
    page, setPage,
    pageSize, setPageSize,
    search, setSearch,
    city, setCity,
    tag, setTag,
    sortBy, setSortBy,
    // actions
    refresh: load,
  };
}
