import { isAxiosError } from 'axios';

/**
 * Extract a user-facing message from an API error. Prefers the backend's
 * `response.data.error.message` (shaped by the Fastify global error handler)
 * over axios's generic `error.message` like "Request failed with status code 409".
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as
      | { error?: { message?: string } | string }
      | undefined;
    if (typeof data?.error === 'string') return data.error;
    if (data?.error?.message) return data.error.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
