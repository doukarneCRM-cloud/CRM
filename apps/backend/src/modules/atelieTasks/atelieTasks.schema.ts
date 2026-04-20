import { z } from 'zod';

export const TaskStatusSchema = z.enum(['backlog', 'processing', 'done', 'forgotten', 'incomplete']);
export const TaskVisibilitySchema = z.enum(['private', 'shared']);

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
  status: TaskStatusSchema.optional(),
  visibility: TaskVisibilitySchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(4000).nullable().optional(),
  visibility: TaskVisibilitySchema.optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;

export const MoveTaskSchema = z.object({
  status: TaskStatusSchema,
  // Caller supplies the target position; server validates and may
  // renormalize if gaps shrink below threshold.
  position: z.number(),
  incompleteReason: z.string().max(300).optional(),
});
export type MoveTaskInput = z.infer<typeof MoveTaskSchema>;

export const CreateCommentSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;
