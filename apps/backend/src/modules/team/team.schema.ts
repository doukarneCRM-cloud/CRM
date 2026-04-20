import { z } from 'zod';

// ─── Users ────────────────────────────────────────────────────────────────────

export const CreateUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  phone: z.string().max(20).optional(),
  password: z.string().min(8).max(100),
  roleId: z.string().min(1),
  avatarUrl: z.string().url().max(500).nullable().optional(),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().max(150).optional(),
  phone: z.string().max(20).nullable().optional(),
  password: z.string().min(8).max(100).optional(),
  roleId: z.string().min(1).optional(),
  avatarUrl: z.string().url().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});

export const UserQuerySchema = z.object({
  search: z.string().optional(),
  roleId: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

// ─── Roles ────────────────────────────────────────────────────────────────────

export const CreateRoleSchema = z.object({
  name: z.string()
    .min(2)
    .max(60)
    // letters + digits + underscore only — used as the RBAC lookup key
    .regex(/^[a-z0-9_]+$/, 'name must be lowercase letters, numbers, or underscores'),
  label: z.string().min(2).max(100),
  permissionKeys: z.array(z.string()).default([]),
});

export const UpdateRoleSchema = z.object({
  label: z.string().min(2).max(100).optional(),
  permissionKeys: z.array(z.string()).optional(),
});

// ─── Commission rules ─────────────────────────────────────────────────────────

export const UpsertCommissionSchema = z.object({
  onConfirm: z.number().min(0).max(100_000),
  onDeliver: z.number().min(0).max(100_000),
});

// ─── Assignment rule (global state) ──────────────────────────────────────────

export const AssignmentStrategy = z.enum(['round_robin', 'by_product']);

export const UpdateAssignmentRuleSchema = z.object({
  isActive: z.boolean().optional(),
  strategy: AssignmentStrategy.optional(),
  bounceCount: z.number().int().min(1).max(20).optional(),
});

// ─── Inferred ─────────────────────────────────────────────────────────────────

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
export type UserQueryInput = z.infer<typeof UserQuerySchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
export type UpsertCommissionInput = z.infer<typeof UpsertCommissionSchema>;
export type UpdateAssignmentRuleInput = z.infer<typeof UpdateAssignmentRuleSchema>;
