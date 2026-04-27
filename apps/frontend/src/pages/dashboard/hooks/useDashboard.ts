import { useCallback, useEffect, useRef, useState } from 'react';
import { useFilterStore } from '@/store/filterStore';
import { getSocket } from '@/services/socket';
import { dashboardApi, type DashboardPayload } from '@/services/dashboardApi';

interface UseDashboardReturn {
  data: DashboardPayload | null;
  loading: boolean;
  refresh: () => void;
}

interface UseDashboardOptions {
  compareFrom?: string | null;
  compareTo?: string | null;
}

export function useDashboard(options: UseDashboardOptions = {}): UseDashboardReturn {
  const filters = useFilterStore();
  const { compareFrom, compareTo } = options;
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const fetchRef = useRef<() => void>(() => {});

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dashboardApi.get({
        agentIds: filters.agentIds.length ? filters.agentIds.join(',') : undefined,
        cities: filters.cities.length ? filters.cities.join(',') : undefined,
        productIds: filters.productIds.length ? filters.productIds.join(',') : undefined,
        confirmationStatuses: filters.confirmationStatuses.length
          ? filters.confirmationStatuses.join(',')
          : undefined,
        shippingStatuses: filters.shippingStatuses.length
          ? filters.shippingStatuses.join(',')
          : undefined,
        coliixRawStates: filters.coliixRawStates.length
          ? filters.coliixRawStates.join(',')
          : undefined,
        sources: filters.sources.length ? filters.sources.join(',') : undefined,
        dateFrom: filters.dateRange.from ?? undefined,
        dateTo: filters.dateRange.to ?? undefined,
        compareFrom: compareFrom ?? undefined,
        compareTo: compareTo ?? undefined,
      });
      setData(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [
    filters.agentIds,
    filters.cities,
    filters.productIds,
    filters.confirmationStatuses,
    filters.shippingStatuses,
    filters.coliixRawStates,
    filters.sources,
    filters.dateRange.from,
    filters.dateRange.to,
    compareFrom,
    compareTo,
  ]);

  fetchRef.current = fetch;

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Live refresh on KPI-impacting events
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
      const handler = () => fetchRef.current();
      socket.on('kpi:refresh', handler);
      socket.on('order:created', handler);
      socket.on('order:updated', handler);
      socket.on('order:archived', handler);
      socket.on('order:bulk_updated', handler);
      return () => {
        socket?.off('kpi:refresh', handler);
        socket?.off('order:created', handler);
        socket?.off('order:updated', handler);
        socket?.off('order:archived', handler);
        socket?.off('order:bulk_updated', handler);
      };
    } catch {
      // socket not ready
    }
  }, []);

  return { data, loading, refresh: fetch };
}
