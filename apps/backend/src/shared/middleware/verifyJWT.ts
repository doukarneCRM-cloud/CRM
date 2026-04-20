import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken, type JwtPayload } from '../jwt';

declare module 'fastify' {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function verifyJWT(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'No token provided', statusCode: 401 },
    });
  }

  const token = authHeader.slice(7);
  try {
    request.user = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({
      error: { code: 'UNAUTHORIZED', message: 'Token expired or invalid', statusCode: 401 },
    });
  }
}
