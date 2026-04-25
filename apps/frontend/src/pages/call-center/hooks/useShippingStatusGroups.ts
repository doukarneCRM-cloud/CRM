import { useCallback, useEffect, useState } from 'react';
import {
  shippingStatusGroupsApi,
  type ShippingStatusGroup,
  type CreateGroupPayload,
  type UpdateGroupPayload,
} from '@/services/shippingStatusGroupsApi';

interface UseShippingStatusGroupsResult {
  groups: ShippingStatusGroup[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (payload: CreateGroupPayload) => Promise<ShippingStatusGroup>;
  update: (id: string, payload: UpdateGroupPayload) => Promise<ShippingStatusGroup>;
  remove: (id: string) => Promise<void>;
  reorder: (ids: string[]) => Promise<ShippingStatusGroup[]>;
}

/**
 * Loads shipping status groups and exposes thin wrappers around the CRUD
 * mutations. Each mutation refreshes the local list on success so the UI
 * stays in sync without manual cache management.
 */
export function useShippingStatusGroups(): UseShippingStatusGroupsResult {
  const [groups, setGroups] = useState<ShippingStatusGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await shippingStatusGroupsApi.list();
      setGroups(data);
      setError(null);
    } catch (e) {
      const msg =
        (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to load groups';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: CreateGroupPayload) => {
      const created = await shippingStatusGroupsApi.create(payload);
      await refresh();
      return created;
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, payload: UpdateGroupPayload) => {
      const updated = await shippingStatusGroupsApi.update(id, payload);
      await refresh();
      return updated;
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await shippingStatusGroupsApi.remove(id);
      await refresh();
    },
    [refresh],
  );

  const reorder = useCallback(
    async (ids: string[]) => {
      const next = await shippingStatusGroupsApi.reorder(ids);
      setGroups(next);
      return next;
    },
    [],
  );

  return { groups, loading, error, refresh, create, update, remove, reorder };
}
