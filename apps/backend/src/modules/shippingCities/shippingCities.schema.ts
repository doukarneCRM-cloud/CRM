import { z } from 'zod';

export const CreateCitySchema = z.object({
  name: z.string().min(1).max(80),
  price: z.number().nonnegative().max(10_000),
  zone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateCityInput = z.infer<typeof CreateCitySchema>;

export const UpdateCitySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  price: z.number().nonnegative().max(10_000).optional(),
  zone: z.string().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCityInput = z.infer<typeof UpdateCitySchema>;

// CSV import — one row per { name, price, zone? }. We normalize and dedupe in
// the service so callers can paste messy spreadsheets without pre-cleaning.
export const CsvImportRowSchema = z.object({
  name: z.string().min(1).max(80),
  price: z.number().nonnegative().max(10_000),
  zone: z.string().max(40).nullable().optional(),
});
export const CsvImportSchema = z.object({
  rows: z.array(CsvImportRowSchema).min(1).max(2000),
  mode: z.enum(['upsert', 'replace']).default('upsert'),
});
export type CsvImportInput = z.infer<typeof CsvImportSchema>;
