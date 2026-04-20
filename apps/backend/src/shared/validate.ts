import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/**
 * Parse `body` with `schema`. On failure, sends a canonical 400 response and
 * returns null (caller short-circuits). On success, returns the typed data.
 *
 * Keeps the canonical error shape `{ error: { code, message, statusCode, issues } }`
 * consistent with every other error in the app.
 */
export function validateBody<S extends z.ZodTypeAny>(
  reply: FastifyReply,
  schema: S,
  body: unknown,
): z.infer<S> | null {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        statusCode: 400,
        issues: parsed.error.issues,
      },
    });
    return null;
  }
  return parsed.data;
}

export function validateQuery<S extends z.ZodTypeAny>(
  reply: FastifyReply,
  schema: S,
  query: unknown,
): z.infer<S> | null {
  const parsed = schema.safeParse(query);
  if (!parsed.success) {
    reply.status(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        statusCode: 400,
        issues: parsed.error.issues,
      },
    });
    return null;
  }
  return parsed.data;
}
