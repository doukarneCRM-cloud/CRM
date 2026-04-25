import { z } from 'zod';

// ─── Variant inputs ───────────────────────────────────────────────────────────

const VariantCoreSchema = z.object({
  color: z.string().max(50).nullable().optional(),
  size: z.string().max(50).nullable().optional(),
  sku: z.string().min(1).max(80),
  price: z.number().nonnegative(),
  stock: z.number().int().min(0).default(0),
});

export const CreateVariantSchema = VariantCoreSchema;

// For update, id is optional: present = update existing, absent = create new
export const UpdateVariantSchema = VariantCoreSchema.extend({
  id: z.string().cuid().optional(),
});

// ─── Measurements (free-form clothing chart) ─────────────────────────────────
// Validated so every row matches the column count — keeps the table rectangular.
export const MeasurementsSchema = z
  .object({
    columns: z.array(z.string().max(40)).max(12),
    rows: z.array(z.array(z.string().max(80)).max(12)).max(50),
  })
  .nullable()
  .refine(
    (v) => v == null || v.rows.every((r) => r.length === v.columns.length),
    'Each measurement row must have the same number of cells as columns',
  );

// ─── Product ──────────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  name: z.string().min(2).max(120),
  sku: z.string().min(1).max(80),
  // YouCan-imported products arrive with rich HTML descriptions (multiple
  // <p>, <strong>, &nbsp; entities, sometimes inline imgs) that easily blow
  // past 1k. The DB column is String? / Postgres TEXT, so the cap is purely
  // a guard against abuse — 50k is generous for legitimate marketing copy
  // while still bounded.
  description: z.string().max(50_000).nullable().optional(),
  imageUrl: z
    .string()
    // CDN URLs with cache-busting query params (?v=, ?w=…&h=…&fit=…) can
    // legitimately push past the previous 500-char cap, especially for
    // YouCan / R2 signed URLs.
    .max(2000)
    .regex(/^(https?:\/\/|\/uploads\/)/, 'imageUrl must be an absolute URL or /uploads path')
    .nullable()
    .optional(),
  basePrice: z.number().nonnegative(),
  assignedAgentId: z.string().cuid().nullable().optional(),
  measurements: MeasurementsSchema.optional(),
  variants: z.array(CreateVariantSchema).min(1).max(50),
});

export const UpdateProductSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  sku: z.string().min(1).max(80).optional(),
  // YouCan-imported products arrive with rich HTML descriptions (multiple
  // <p>, <strong>, &nbsp; entities, sometimes inline imgs) that easily blow
  // past 1k. The DB column is String? / Postgres TEXT, so the cap is purely
  // a guard against abuse — 50k is generous for legitimate marketing copy
  // while still bounded.
  description: z.string().max(50_000).nullable().optional(),
  imageUrl: z
    .string()
    // CDN URLs with cache-busting query params (?v=, ?w=…&h=…&fit=…) can
    // legitimately push past the previous 500-char cap, especially for
    // YouCan / R2 signed URLs.
    .max(2000)
    .regex(/^(https?:\/\/|\/uploads\/)/, 'imageUrl must be an absolute URL or /uploads path')
    .nullable()
    .optional(),
  basePrice: z.number().nonnegative().optional(),
  isActive: z.boolean().optional(),
  assignedAgentId: z.string().cuid().nullable().optional(),
  measurements: MeasurementsSchema.optional(),
  // When provided, the server reconciles variants: keeps matched ids (updates),
  // creates missing ones, and soft-handles removal (only allowed if no orderItems)
  variants: z.array(UpdateVariantSchema).min(1).max(50).optional(),
});

// ─── Query ────────────────────────────────────────────────────────────────────

export const ProductQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v == null ? undefined : v === 'true')),
});

// ─── Stock ────────────────────────────────────────────────────────────────────

export const UpdateStockSchema = z.object({
  stock: z.number().int().min(0),
});

export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type ProductQueryInput = z.infer<typeof ProductQuerySchema>;
export type UpdateStockInput = z.infer<typeof UpdateStockSchema>;
export type CreateVariantInput = z.infer<typeof CreateVariantSchema>;
export type UpdateVariantInput = z.infer<typeof UpdateVariantSchema>;
