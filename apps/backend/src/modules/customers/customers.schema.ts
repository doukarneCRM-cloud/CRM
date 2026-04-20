import { z } from 'zod';

// ─── Create ──────────────────────────────────────────────────────────────────
export const CreateCustomerSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().min(8).max(20),
  city: z.string().min(2).max(100),
  address: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  tag: z.enum(['normal', 'vip', 'blacklisted']).default('normal'),
});

// ─── Update (phone is editable — conflicts rejected so admin can merge) ──────
export const UpdateCustomerSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  phone: z.string().min(8).max(20).optional(),
  city: z.string().min(2).max(100).optional(),
  address: z.string().max(200).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  tag: z.enum(['normal', 'vip', 'blacklisted']).optional(),
});

// ─── List Query ──────────────────────────────────────────────────────────────
export const CustomerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  city: z.string().optional(),
  tag: z.enum(['normal', 'vip', 'blacklisted']).optional(),
  sortBy: z.enum(['recent', 'totalOrders']).default('recent'),
});

// ─── History Query ────────────────────────────────────────────────────────────
export const HistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;
export type CustomerQueryInput = z.infer<typeof CustomerQuerySchema>;
export type HistoryQueryInput = z.infer<typeof HistoryQuerySchema>;
