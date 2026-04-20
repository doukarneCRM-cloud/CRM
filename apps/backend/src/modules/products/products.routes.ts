import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as ctrl from './products.controller';
import { uploadProductImage } from './products.upload';

type WithId = { Params: { id: string } };
type WithIdVid = { Params: { id: string; vid: string } };

export async function productsRoutes(app: FastifyInstance) {
  // ── GET /api/v1/products ────────────────────────────────────────────────
  app.get('/', { preHandler: [verifyJWT, requirePermission('products:view')] }, ctrl.listProducts);

  // ── GET /api/v1/products/:id ────────────────────────────────────────────
  app.get<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('products:view')] }, ctrl.showProduct);

  // ── POST /api/v1/products/upload-image (multipart) ──────────────────────
  app.post(
    '/upload-image',
    { preHandler: [verifyJWT, requirePermission('products:create')] },
    uploadProductImage,
  );

  // ── POST /api/v1/products ───────────────────────────────────────────────
  app.post('/', { preHandler: [verifyJWT, requirePermission('products:create')] }, ctrl.createProduct);

  // ── PATCH /api/v1/products/:id ──────────────────────────────────────────
  app.patch<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('products:edit')] }, ctrl.updateProduct);

  // ── DELETE /api/v1/products/:id (soft) ──────────────────────────────────
  app.delete<WithId>('/:id', { preHandler: [verifyJWT, requirePermission('products:delete')] }, ctrl.deactivateProduct);

  // ── PATCH /api/v1/products/:id/variants/:vid/stock ──────────────────────
  app.patch<WithIdVid>(
    '/:id/variants/:vid/stock',
    { preHandler: [verifyJWT, requirePermission('products:edit')] },
    ctrl.updateVariantStock,
  );
}
