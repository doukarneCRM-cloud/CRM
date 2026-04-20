import { z } from 'zod';

export const MaterialCategorySchema = z.enum(['fabric', 'accessory', 'needle', 'thread', 'other']);
export const MaterialUnitSchema = z.enum(['meter', 'piece', 'kilogram', 'spool', 'box']);
export const MovementTypeSchema = z.enum(['in', 'out', 'adjustment']);

export const CreateMaterialSchema = z.object({
  name: z.string().min(1).max(120),
  category: MaterialCategorySchema,
  unit: MaterialUnitSchema,
  stock: z.number().nonnegative().max(1_000_000).optional(),
  lowStockThreshold: z.number().nonnegative().max(1_000_000).optional(),
  unitCost: z.number().nonnegative().max(1_000_000).nullable().optional(),
  supplier: z.string().max(120).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
export type CreateMaterialInput = z.infer<typeof CreateMaterialSchema>;

export const UpdateMaterialSchema = CreateMaterialSchema.partial();
export type UpdateMaterialInput = z.infer<typeof UpdateMaterialSchema>;

export const MovementSchema = z.object({
  type: MovementTypeSchema,
  quantity: z.number().positive().max(1_000_000),
  reason: z.string().max(300).optional(),
});
export type MovementInput = z.infer<typeof MovementSchema>;
