import { z } from 'zod';

// Hex like "#10b981" or "#fff" — keep optional, the UI falls back to a neutral
// chip when no color is set.
const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Invalid hex color')
  .max(9);

// Status keys are now Coliix's literal wordings (Ramassé, Livré, Attente De
// Ramassage, …) — free-form strings, not constrained to our internal
// ShippingStatus enum. This lets a group keep its statuses persisted
// even when no orders currently have them, and accepts new Coliix
// wordings the moment Coliix introduces them without a code change.
// Legacy enum values (created before this migration) still validate
// since they're plain strings too.
const StatusKeyArray = z
  .array(z.string().min(1).max(120))
  .max(60)
  .refine(
    (keys) => new Set(keys).size === keys.length,
    { message: 'Duplicate statusKeys are not allowed' },
  );

export const CreateGroupSchema = z.object({
  name: z.string().trim().min(1).max(50),
  color: HexColor.nullable().optional(),
  statusKeys: StatusKeyArray.default([]),
});
export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

export const UpdateGroupSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: HexColor.nullable().optional(),
  statusKeys: StatusKeyArray.optional(),
});
export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

export const ReorderGroupsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});
export type ReorderGroupsInput = z.infer<typeof ReorderGroupsSchema>;
