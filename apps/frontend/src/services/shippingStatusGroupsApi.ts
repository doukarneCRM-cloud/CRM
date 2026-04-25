import { api } from './api';

export interface ShippingStatusGroup {
  id: string;
  name: string;
  color: string | null;
  statusKeys: string[];
  position: number;
  createdAt: string;
  updatedAt: string;
  createdById: string | null;
}

export interface CreateGroupPayload {
  name: string;
  color?: string | null;
  statusKeys?: string[];
}

export interface UpdateGroupPayload {
  name?: string;
  color?: string | null;
  statusKeys?: string[];
}

export const shippingStatusGroupsApi = {
  list: () =>
    api
      .get<{ data: ShippingStatusGroup[] }>('/shipping-status-groups')
      .then((r) => r.data.data),

  create: (payload: CreateGroupPayload) =>
    api.post<ShippingStatusGroup>('/shipping-status-groups', payload).then((r) => r.data),

  update: (id: string, payload: UpdateGroupPayload) =>
    api
      .patch<ShippingStatusGroup>(`/shipping-status-groups/${id}`, payload)
      .then((r) => r.data),

  remove: (id: string) => api.delete(`/shipping-status-groups/${id}`),

  reorder: (ids: string[]) =>
    api
      .put<{ data: ShippingStatusGroup[] }>('/shipping-status-groups/reorder', { ids })
      .then((r) => r.data.data),
};
