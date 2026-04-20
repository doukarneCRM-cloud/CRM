import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as ctrl from './customers.controller';

type WithId = { Params: { id: string } };

export async function customersRoutes(app: FastifyInstance) {
  // ── GET /api/v1/customers ───────────────────────────────────────────────
  app.get('/', { preHandler: [verifyJWT, requirePermission('clients:view')] }, ctrl.listCustomers);

  // ── GET /api/v1/customers/:id ───────────────────────────────────────────
  app.get<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('clients:view')] }, ctrl.showCustomer);

  // ── GET /api/v1/customers/:id/history ──────────────────────────────────
  app.get<WithId>('/:id/history', { preHandler: [verifyJWT, requirePermission('clients:view')] }, ctrl.showCustomerHistory);

  // ── POST /api/v1/customers ──────────────────────────────────────────────
  app.post('/', { preHandler: [verifyJWT, requirePermission('orders:create')] }, ctrl.createCustomer);

  // ── PATCH /api/v1/customers/:id ─────────────────────────────────────────
  app.patch<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('clients:edit')] }, ctrl.updateCustomer);
}
