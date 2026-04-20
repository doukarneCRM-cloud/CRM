import { api } from './api';
import type { Product } from '@/types/orders';

export interface ProductVariant {
  id: string;
  color: string | null;
  size: string | null;
  sku: string;
  stock: number;
  price: number;
}

export interface ProductMeasurements {
  columns: string[];
  rows: string[][];
}

export interface ProductDetail extends Product {
  description?: string | null;
  isActive?: boolean;
  assignedAgentId?: string | null;
  measurements?: ProductMeasurements | null;
}

export interface VariantInput {
  id?: string;
  color?: string | null;
  size?: string | null;
  sku: string;
  price: number;
  stock: number;
}

export interface CreateProductPayload {
  name: string;
  sku: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice: number;
  assignedAgentId?: string | null;
  measurements?: ProductMeasurements | null;
  variants: VariantInput[];
}

export interface UpdateProductPayload {
  name?: string;
  sku?: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice?: number;
  isActive?: boolean;
  assignedAgentId?: string | null;
  measurements?: ProductMeasurements | null;
  variants?: VariantInput[];
}

export interface ProductListFilters {
  search?: string;
  isActive?: 'true' | 'false';
}

export const productsApi = {
  list: (filters?: ProductListFilters) =>
    api.get<{ data: ProductDetail[] }>('/products', { params: filters }).then((r) => r.data.data),

  getById: (id: string) =>
    api.get<ProductDetail>(`/products/${id}`).then((r) => r.data),

  create: (payload: CreateProductPayload) =>
    api.post<ProductDetail>('/products', payload).then((r) => r.data),

  update: (id: string, payload: UpdateProductPayload) =>
    api.patch<ProductDetail>(`/products/${id}`, payload).then((r) => r.data),

  // Soft delete with tombstone — product disappears from catalog, historical
  // orders still render with the original name/image but get a red "untracked"
  // indicator since stock is no longer maintained.
  remove: (id: string) =>
    api.delete<ProductDetail>(`/products/${id}`).then((r) => r.data),

  updateStock: (productId: string, variantId: string, stock: number) =>
    api
      .patch<ProductVariant>(`/products/${productId}/variants/${variantId}/stock`, { stock })
      .then((r) => r.data),

  uploadImage: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    // The axios instance defaults Content-Type to application/json, which
    // triggers axios's built-in "JSON.stringify a FormData" branch. Setting
    // multipart/form-data here defuses that check; the XHR adapter then
    // clears this header so the browser can generate it with the boundary.
    return api
      .post<{ url: string }>('/products/upload-image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
