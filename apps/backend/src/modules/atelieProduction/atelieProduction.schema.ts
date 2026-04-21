import { z } from 'zod';

export const RunFabricSchema = z.object({
  fabricTypeId: z.string().cuid(),
  role: z.string().min(1).max(40),
});

export const RunSizeSchema = z.object({
  size: z.string().min(1).max(20),
  tracingMeters: z.number().nonnegative().max(1_000),
  expectedPieces: z.number().int().nonnegative().max(100_000),
  actualPieces: z.number().int().nonnegative().max(100_000).optional(),
  variantId: z.string().cuid().nullable().optional(),
});

export const CreateRunSchema = z.object({
  testId: z.string().cuid().nullable().optional(),
  productId: z.string().cuid().nullable().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  fabrics: z.array(RunFabricSchema).max(10).optional(),
  sizes: z.array(RunSizeSchema).max(20).optional(),
  workerIds: z.array(z.string().cuid()).max(50).optional(),
});
export type CreateRunInput = z.infer<typeof CreateRunSchema>;

export const UpdateRunSchema = z.object({
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).nullable().optional(),
  status: z.enum(['draft', 'active', 'finished', 'cancelled']).optional(),
  notes: z.string().max(1000).nullable().optional(),
  fabrics: z.array(RunFabricSchema).max(10).optional(),
  sizes: z.array(RunSizeSchema).max(20).optional(),
});
export type UpdateRunInput = z.infer<typeof UpdateRunSchema>;

export const ConsumeSchema = z.object({
  sourceType: z.enum(['fabric_roll', 'accessory']),
  fabricRollId: z.string().cuid().optional(),
  materialId: z.string().cuid().optional(),
  quantity: z.number().positive().max(100_000),
});
export type ConsumeInput = z.infer<typeof ConsumeSchema>;
