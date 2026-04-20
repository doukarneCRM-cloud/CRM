import type { FastifyReply } from 'fastify';

/**
 * Send a service-thrown error through Fastify in the canonical
 * `{ error: { code, message, statusCode } }` shape. Anything without a
 * `statusCode` field is re-thrown so Fastify's global error handler can
 * respond with a 500.
 */
export function replyError(reply: FastifyReply, err: unknown): FastifyReply {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    const e = err as { statusCode: number; code: string; message: string };
    return reply.status(e.statusCode).send({
      error: { code: e.code, message: e.message, statusCode: e.statusCode },
    });
  }
  throw err;
}
