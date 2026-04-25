import { z } from 'zod';
import { BroadcastKind } from '@prisma/client';

const VALID_KINDS = Object.values(BroadcastKind) as readonly string[];

// We accept JSON-encoded multipart fields, so types arrive as strings even for
// arrays / booleans. The schema below handles the wire-format coming off
// `@fastify/multipart` (everything is a string) — the routes pre-parse the
// JSON ones (`recipientIds`) before handing the body to Zod.

export const CreateBroadcastSchema = z
  .object({
    kind: z.string().refine((v) => VALID_KINDS.includes(v), 'Invalid kind'),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().max(2000).optional().nullable(),
    linkUrl: z
      .string()
      .trim()
      .max(2000)
      .url('linkUrl must be a valid URL')
      .optional()
      .nullable(),
    recipientIds: z.array(z.string().min(1)).max(500).default([]),
    allUsers: z.boolean().default(false),
  })
  .refine(
    (input) => input.allUsers || input.recipientIds.length > 0,
    {
      message: 'Pick at least one recipient or enable allUsers',
      path: ['recipientIds'],
    },
  );

export type CreateBroadcastInput = z.infer<typeof CreateBroadcastSchema>;

export const ListFilterSchema = z.object({
  kind: z
    .string()
    .refine((v) => VALID_KINDS.includes(v), 'Invalid kind')
    .optional(),
  isActive: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});
export type ListFilterInput = z.infer<typeof ListFilterSchema>;
