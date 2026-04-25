import { z } from 'zod';

export const CreateStoreSchema = z.object({
  name: z.string().min(1, 'Store name is required'),
});
export type CreateStoreInput = z.infer<typeof CreateStoreSchema>;

export const UpdateStoreSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  // When false, the background poller and the order.create webhook both
  // skip this store — only the manual "Import orders" button pulls data.
  autoSyncEnabled: z.boolean().optional(),
  fieldMapping: z.record(z.string(), z.string()).optional(),
});
export type UpdateStoreInput = z.infer<typeof UpdateStoreSchema>;

export const OAuthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State token is required'),
});
export type OAuthCallbackInput = z.infer<typeof OAuthCallbackSchema>;

export const ImportProductsSchema = z.object({
  productIds: z.array(z.string()).optional(), // if empty → import all
});
export type ImportProductsInput = z.infer<typeof ImportProductsSchema>;

export const ImportOrdersSchema = z.object({
  // Upper bound is generous (10k) so admins can pull a full backlog in one
  // call when seeding a new install. Empty/undefined → import all.
  count: z.number().int().min(1).max(10_000).optional(),
});
export type ImportOrdersInput = z.infer<typeof ImportOrdersSchema>;

// Shipping providers (Coliix, etc.)
export const UpdateProviderSchema = z.object({
  apiBaseUrl: z.string().url().optional(),
  apiKey: z.string().min(8).max(256).nullable().optional(), // null = clear, string = set
  isActive: z.boolean().optional(),
});
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>;
