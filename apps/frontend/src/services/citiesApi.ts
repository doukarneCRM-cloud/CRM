import { api } from './api';

export interface City {
  id: string;
  name: string;
  price: number;
  zone: string | null;
  isActive: boolean;
}

export interface ImportOutcome {
  name: string;
  action: 'created' | 'updated' | 'unchanged' | 'skipped';
  reason?: string;
}

export interface ImportResponse {
  outcomes: ImportOutcome[];
  summary: {
    created: number;
    updated: number;
    unchanged: number;
    deactivated: number;
    skipped: number;
  };
}

export const citiesApi = {
  list: (activeOnly = false) =>
    api
      .get<{ data: City[] }>('/shipping-cities', { params: { activeOnly: activeOnly ? 'true' : 'false' } })
      .then((r) => r.data.data),

  create: (payload: { name: string; price: number; zone?: string | null; isActive?: boolean }) =>
    api.post<City>('/shipping-cities', payload).then((r) => r.data),

  update: (
    id: string,
    payload: { name?: string; price?: number; zone?: string | null; isActive?: boolean },
  ) => api.patch<City>(`/shipping-cities/${id}`, payload).then((r) => r.data),

  remove: (id: string) => api.delete(`/shipping-cities/${id}`),

  importCsv: (rows: Array<{ name: string; price: number; zone?: string | null }>, mode: 'upsert' | 'replace' = 'upsert') =>
    api
      .post<ImportResponse>('/shipping-cities/import', { rows, mode })
      .then((r) => r.data),
};
