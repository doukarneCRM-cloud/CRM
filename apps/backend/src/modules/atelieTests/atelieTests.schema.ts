import { z } from 'zod';

export const TestFabricSchema = z.object({
  fabricTypeId: z.string().cuid(),
  role: z.string().min(1).max(40),
});

export const TestSizeSchema = z.object({
  size: z.string().min(1).max(20),
  tracingMeters: z.number().nonnegative().max(1_000),
});

export const TestAccessorySchema = z.object({
  materialId: z.string().cuid(),
  quantityPerPiece: z.number().nonnegative().max(1_000),
});

export const CreateProductTestSchema = z.object({
  name: z.string().min(1).max(120),
  productId: z.string().cuid().nullable().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  estimatedCostPerPiece: z.number().nonnegative().max(1_000_000).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  fabrics: z.array(TestFabricSchema).max(10).optional(),
  sizes: z.array(TestSizeSchema).max(20).optional(),
  accessories: z.array(TestAccessorySchema).max(50).optional(),
});
export type CreateProductTestInput = z.infer<typeof CreateProductTestSchema>;

export const UpdateProductTestSchema = CreateProductTestSchema.partial();
export type UpdateProductTestInput = z.infer<typeof UpdateProductTestSchema>;
