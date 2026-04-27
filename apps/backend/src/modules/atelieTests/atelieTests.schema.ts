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
  // Optional snapshot — when omitted the service captures the current
  // material.unitCost at write time so the sample's estimate is frozen.
  unitCostSnapshot: z.number().nonnegative().max(1_000_000).nullable().optional(),
});

export const SampleStatusEnum = z.enum(['draft', 'tested', 'approved', 'archived']);
export type SampleStatusInput = z.infer<typeof SampleStatusEnum>;

export const CreateProductTestSchema = z.object({
  name: z.string().min(1).max(120),
  productId: z.string().cuid().nullable().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  // HTML stripped on save (utils/stripHtml). Generous cap matches Product.description.
  description: z.string().max(50_000).nullable().optional(),
  // estimatedCostPerPiece + suggestedPrice are computed by the service
  // from sizes/fabrics/accessories/fees/markup; clients can pass them but
  // they will be overwritten on every save.
  estimatedCostPerPiece: z.number().nonnegative().max(1_000_000).nullable().optional(),
  suggestedPrice: z.number().nonnegative().max(1_000_000).nullable().optional(),
  // Cost-calc inputs.
  laborMadPerPiece: z.number().nonnegative().max(1_000_000).nullable().optional(),
  confirmationFee: z.number().nonnegative().max(1_000_000).nullable().optional(),
  deliveryFee: z.number().nonnegative().max(1_000_000).nullable().optional(),
  // 0..500 covers anything from giveaway to luxury markup.
  markupPercent: z.number().min(0).max(500).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  fabrics: z.array(TestFabricSchema).max(10).optional(),
  sizes: z.array(TestSizeSchema).max(20).optional(),
  accessories: z.array(TestAccessorySchema).max(50).optional(),
});
export type CreateProductTestInput = z.infer<typeof CreateProductTestSchema>;

export const UpdateProductTestSchema = CreateProductTestSchema.partial();
export type UpdateProductTestInput = z.infer<typeof UpdateProductTestSchema>;

// ─── Lifecycle transitions ───────────────────────────────────────────────────
//
// Forward-only by default. The valid transitions are enforced in the
// service layer; the schema only validates the target value.
export const TransitionSampleSchema = z.object({
  to: SampleStatusEnum,
});
export type TransitionSampleInput = z.infer<typeof TransitionSampleSchema>;

// ─── Photo bulk-replace ──────────────────────────────────────────────────────
export const SamplePhotoSchema = z.object({
  url: z
    .string()
    .max(2000)
    .regex(/^(https?:\/\/|\/uploads\/)/, 'url must be an absolute URL or /uploads path'),
  caption: z.string().max(200).nullable().optional(),
  position: z.number().optional(),
});

export const ReplaceSamplePhotosSchema = z.object({
  photos: z.array(SamplePhotoSchema).max(20),
});
export type ReplaceSamplePhotosInput = z.infer<typeof ReplaceSamplePhotosSchema>;
