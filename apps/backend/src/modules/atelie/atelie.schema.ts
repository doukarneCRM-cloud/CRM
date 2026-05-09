import { z } from 'zod';

export const CreateEmployeeSchema = z.object({
  name: z.string().min(1).max(80),
  phone: z.string().max(32).nullable().optional(),
  role: z.string().min(1).max(60),
  baseSalary: z.number().nonnegative().max(100_000),
  workingDays: z.number().int().min(1).max(7).optional(),
  isActive: z.boolean().optional(),
});
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const ToggleDaySchema = z.object({
  employeeId: z.string().min(1),
  weekStart: z.string().datetime(),     // ISO string for week's Monday 00:00 UTC
  dayIndex: z.number().int().min(0).max(6),
  state: z.enum(['absent', 'half', 'full']),
});
export type ToggleDayInput = z.infer<typeof ToggleDaySchema>;

export const PaySalarySchema = z.object({
  paidAmount: z.number().nonnegative().max(1_000_000).optional(),
  notes: z.string().max(500).optional(),
});
export type PaySalaryInput = z.infer<typeof PaySalarySchema>;

export const UpdateSalaryExtrasSchema = z.object({
  commission: z.number().nonnegative().max(1_000_000).optional(),
  supplementHours: z.number().nonnegative().max(200).optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateSalaryExtrasInput = z.infer<typeof UpdateSalaryExtrasSchema>;
