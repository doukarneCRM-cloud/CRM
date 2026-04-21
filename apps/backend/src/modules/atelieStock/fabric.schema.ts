import { z } from 'zod';

export const CreateFabricTypeSchema = z.object({
  name: z.string().min(1).max(120),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateFabricTypeInput = z.infer<typeof CreateFabricTypeSchema>;

export const UpdateFabricTypeSchema = CreateFabricTypeSchema.partial();
export type UpdateFabricTypeInput = z.infer<typeof UpdateFabricTypeSchema>;

export const CreateFabricRollSchema = z.object({
  fabricTypeId: z.string().cuid(),
  color: z.string().min(1).max(80),
  widthCm: z.number().positive().max(1000).nullable().optional(),
  initialLength: z.number().positive().max(100_000),
  unitCostPerMeter: z.number().nonnegative().max(1_000_000),
  purchaseDate: z.string().datetime().or(z.string().min(1)),
  supplier: z.string().max(120).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CreateFabricRollInput = z.infer<typeof CreateFabricRollSchema>;

export const UpdateFabricRollSchema = z.object({
  color: z.string().min(1).max(80).optional(),
  widthCm: z.number().positive().max(1000).nullable().optional(),
  unitCostPerMeter: z.number().nonnegative().max(1_000_000).optional(),
  purchaseDate: z.string().min(1).optional(),
  supplier: z.string().max(120).nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateFabricRollInput = z.infer<typeof UpdateFabricRollSchema>;

export const AdjustFabricRollSchema = z.object({
  remainingLength: z.number().nonnegative().max(100_000),
  reason: z.string().max(300).optional(),
});
export type AdjustFabricRollInput = z.infer<typeof AdjustFabricRollSchema>;
