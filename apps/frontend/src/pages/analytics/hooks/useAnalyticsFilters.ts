import { useMemo } from 'react';
import { useFilterStore } from '@/store/filterStore';
import type { AnalyticsFilters } from '@/services/analyticsApi';

/**
 * Maps the global filter store to the shape the analytics API expects.
 * Memoized so each tab hook can use it as a stable dependency.
 */
export function useAnalyticsFilters(): AnalyticsFilters {
  const cities = useFilterStore((s) => s.cities);
  const agentIds = useFilterStore((s) => s.agentIds);
  const productIds = useFilterStore((s) => s.productIds);
  const confirmationStatuses = useFilterStore((s) => s.confirmationStatuses);
  const shippingStatuses = useFilterStore((s) => s.shippingStatuses);
  const sources = useFilterStore((s) => s.sources);
  const dateRange = useFilterStore((s) => s.dateRange);

  return useMemo(
    () => ({
      cities: cities.length ? cities.join(',') : undefined,
      agentIds: agentIds.length ? agentIds.join(',') : undefined,
      productIds: productIds.length ? productIds.join(',') : undefined,
      confirmationStatuses: confirmationStatuses.length
        ? confirmationStatuses.join(',')
        : undefined,
      shippingStatuses: shippingStatuses.length ? shippingStatuses.join(',') : undefined,
      sources: sources.length ? sources.join(',') : undefined,
      dateFrom: dateRange.from ?? undefined,
      dateTo: dateRange.to ?? undefined,
    }),
    [
      cities,
      agentIds,
      productIds,
      confirmationStatuses,
      shippingStatuses,
      sources,
      dateRange.from,
      dateRange.to,
    ],
  );
}
