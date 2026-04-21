import { z } from 'zod';

export const LoginBody = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export const RefreshBody = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const LogoutBody = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const UpdateProfileBody = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
});

export type LoginBodyType = z.infer<typeof LoginBody>;
export type RefreshBodyType = z.infer<typeof RefreshBody>;
export type LogoutBodyType = z.infer<typeof LogoutBody>;
export type UpdateProfileBodyType = z.infer<typeof UpdateProfileBody>;
