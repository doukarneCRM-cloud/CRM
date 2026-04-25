import { z } from 'zod';
import { ShippingStatus } from '@prisma/client';

const VALID_STATUS_KEYS = Object.values(ShippingStatus) as readonly string[];

// Hex like "#10b981" or "#fff" — keep optional, the UI falls back to a neutral
// chip when no color is set.
const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}){1,2}$/, 'Invalid hex color')
  .max(9);

const StatusKeyArray = z
  .array(z.string().min(1).max(64))
  .max(60)
  .refine(
    (keys) => keys.every((k) => VALID_STATUS_KEYS.includes(k)),
    { message: 'One or more statusKeys are not valid ShippingStatus values' },
  )
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
