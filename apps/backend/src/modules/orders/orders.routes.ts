import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission, requireAnyPermission } from '../../shared/middleware/rbac.middleware';
import * as ctrl from './orders.controller';

type WithId = { Params: { id: string } };

export async function ordersRoutes(app: FastifyInstance) {
  // ── GET /api/v1/orders ──────────────────────────────────────────────────
  app.get('/', { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] }, ctrl.listOrders);

  // ── GET /api/v1/orders/summary — MUST be before /:id ──────────────────
  app.get('/summary', { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] }, ctrl.ordersSummary);

  // ── POST /api/v1/orders/bulk — MUST be before /:id ─────────────────────
  app.post('/bulk', { preHandler: [verifyJWT, requirePermission('orders:assign')] }, ctrl.bulkAction);

  // ── GET /api/v1/orders/duplicates — MUST be before /:id ────────────────
  app.get(
    '/duplicates',
    { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] },
    ctrl.listDuplicates,
  );

  // ── POST /api/v1/orders/merge — MUST be before /:id ────────────────────
  // call_center:view agents can merge duplicates from the confirm popup; the
  // service auto-reassigns siblings to the keeper's agent.
  app.post(
    '/merge',
    { preHandler: [verifyJWT, requireAnyPermission('orders:edit', 'call_center:view')] },
    ctrl.mergeOrders,
  );

  // ── GET /api/v1/orders/by-tracking/:code — MUST be before /:id ─────────
  // Resolves a Coliix tracking code to the linked Order. Powers the
  // Scan to Pick Up flow: stock agents scan the shipping label QR and
  // get a full payload (items + variants + photos) so they can verify
  // the parcel contents before packing. Permission isolated from
  // orders:view so a stock agent can do nothing else with order data.
  app.get<{ Params: { code: string } }>(
    '/by-tracking/:code',
    { preHandler: [verifyJWT, requirePermission('pickup:scan')] },
    ctrl.showOrderByTracking,
  );

  // ── GET /api/v1/orders/:id ──────────────────────────────────────────────
  app.get<WithId>('/:id', { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] }, ctrl.showOrder);

  // ── GET /api/v1/orders/:id/logs ─────────────────────────────────────────
  app.get<WithId>('/:id/logs', { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] }, ctrl.showOrderLogs);

  // ── GET /api/v1/orders/:id/pending-siblings ─────────────────────────────
  // Unshipped, unarchived pending orders for the same customer from the last
  // 3 days — used by the call-center confirm flow to offer a merge step.
  app.get<WithId>(
    '/:id/pending-siblings',
    { preHandler: [verifyJWT, requireAnyPermission('orders:view', 'call_center:view')] },
    ctrl.showPendingSiblings,
  );

  // ── POST /api/v1/orders ─────────────────────────────────────────────────
  app.post('/', { preHandler: [verifyJWT, requirePermission('orders:create')] }, ctrl.createOrder);

  // ── PATCH /api/v1/orders/:id ────────────────────────────────────────────
  // call_center:view agents can edit their own orders — controller enforces
  // ownership before the service runs.
  app.patch<WithId>(
    '/:id',
    { preHandler: [verifyJWT, requireAnyPermission('orders:edit', 'call_center:view')] },
    ctrl.updateOrder,
  );

  // ── DELETE /api/v1/orders/:id — soft archive ────────────────────────────
  app.delete<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('orders:delete')] }, ctrl.deleteOrder);

  // ── PATCH /api/v1/orders/:id/status ────────────────────────────────────
  app.patch<WithId>(
    '/:id/status',
    {
      preHandler: [
        verifyJWT,
        requireAnyPermission('confirmation:update_status', 'shipping:push', 'shipping:return_validate'),
      ],
    },
    ctrl.updateStatus,
  );

  // ── PATCH /api/v1/orders/:id/assign ────────────────────────────────────
  app.patch<WithId>(
    '/:id/assign',
    { preHandler: [verifyJWT, requirePermission('orders:assign')] },
    ctrl.assignOrder,
  );
}
