import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import * as ctrl from './notifications.controller';

export async function notificationsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [verifyJWT] }, ctrl.listForCurrentUser);
  app.patch('/read-all', { preHandler: [verifyJWT] }, ctrl.markAllRead);
}
