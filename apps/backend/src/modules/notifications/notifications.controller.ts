import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './notifications.service';

export async function listForCurrentUser(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub;
  const result = await svc.listNotifications(userId);
  return reply.send(result);
}

export async function markAllRead(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user.sub;
  const result = await svc.markAllRead(userId);
  return reply.send(result);
}
