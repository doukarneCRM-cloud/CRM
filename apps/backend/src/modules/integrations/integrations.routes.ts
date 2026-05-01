import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import {
  CreateStoreSchema,
  UpdateStoreSchema,
  OAuthCallbackSchema,
  ImportProductsSchema,
  ImportOrdersSchema,
} from './integrations.schema';
import * as svc from './integrations.service';

export async function integrationsRoutes(app: FastifyInstance) {
  // ── Store CRUD (YouCan) ───────────────────────────────────────────────────

  app.get('/stores', { preHandler: [verifyJWT, requirePermission('integrations:view')] }, async (_req, reply) => {
    const stores = await svc.listStores();
    return reply.send({ data: stores });
  });

  app.get('/stores/:id', { preHandler: [verifyJWT, requirePermission('integrations:view')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const store = await svc.getStore(id);
    return reply.send(store);
  });

  app.post('/stores', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const input = CreateStoreSchema.parse(req.body);
    const store = await svc.createStore(input);
    return reply.status(201).send(store);
  });

  app.patch('/stores/:id', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = UpdateStoreSchema.parse(req.body);
    const store = await svc.updateStore(id, input);
    return reply.send(store);
  });

  app.delete('/stores/:id', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await svc.deleteStore(id);
    return reply.send({ ok: true });
  });

  app.post('/stores/:id/toggle', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const store = await svc.toggleStore(id);
    return reply.send(store);
  });

  // ── OAuth ─────────────────────────────────────────────────────────────────

  app.get('/stores/:id/oauth/authorize', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await svc.getStore(id); // ensures store exists
    const { url, state } = svc.getOAuthUrl(id);
    return reply.send({ url, state });
  });

  app.post('/stores/:id/oauth/callback', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { code } = OAuthCallbackSchema.parse(req.body);
    await svc.handleOAuthCallback(id, code);
    return reply.send({ ok: true, message: 'Store connected successfully' });
  });

  // ── Field mapping ─────────────────────────────────────────────────────────

  app.get('/stores/:id/checkout-fields', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const fields = await svc.detectCheckoutFields(id);
    return reply.send({ fields });
  });

  app.put('/stores/:id/field-mapping', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const mapping = req.body as Record<string, string>;
    const store = await svc.updateFieldMapping(id, mapping);
    return reply.send(store);
  });

  // ── Product import ────────────────────────────────────────────────────────

  app.get('/stores/:id/youcan/products', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { page?: string; search?: string };
    const result = await svc.previewYoucanProducts(id, Number(q.page ?? 1), q.search);
    return reply.send(result);
  });

  app.post('/stores/:id/import/products', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = ImportProductsSchema.parse(req.body);
    const result = await svc.importProducts(id, input.productIds);
    return reply.send(result);
  });

  app.post('/stores/:id/reconcile-placeholders', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await svc.reconcilePlaceholders(id);
    return reply.send(result);
  });

  // ── Order import ──────────────────────────────────────────────────────────

  app.post('/stores/:id/import/orders', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = ImportOrdersSchema.parse(req.body);
    const result = await svc.importOrders(id, input.count);
    return reply.send(result);
  });

  app.post(
    '/stores/:id/reconcile',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const q = req.query as Record<string, string | undefined>;
      const windowHours = q.hours ? Math.max(1, Math.min(168, Number(q.hours))) : 24;
      const result = await svc.reconcileMissingOrders(id, windowHours);
      return reply.send(result);
    },
  );

  app.post(
    '/youcan/backfill-created-at',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (_req, reply) => {
      const result = await svc.backfillYoucanOrderCreatedAt();
      return reply.send(result);
    },
  );

  // ── Logs ──────────────────────────────────────────────────────────────────

  app.get('/stores/:id/logs', { preHandler: [verifyJWT, requirePermission('integrations:view')] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { page?: string; pageSize?: string };
    const result = await svc.getStoreLogs(id, Number(q.page ?? 1), Number(q.pageSize ?? 50));
    return reply.send(result);
  });

  // ── YouCan webhook (HMAC-verified) ────────────────────────────────────────

  app.post('/youcan/webhook/:storeId', { config: { rawBody: true } }, async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const signature = req.headers['x-youcan-signature'] as string | undefined;

    const store = await svc.getStore(storeId).catch(() => null);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    if (store.isConnected) {
      const storeData = await import('../../shared/prisma').then(m =>
        m.prisma.store.findUnique({ where: { id: storeId }, select: { webhookSecret: true } })
      );
      if (storeData?.webhookSecret && signature) {
        const rawBody = JSON.stringify(req.body);
        const valid = svc.verifyWebhookSignature(rawBody, signature, storeData.webhookSecret);
        if (!valid) {
          return reply.status(401).send({ error: 'Invalid webhook signature' });
        }
      }
    }

    const payload = (req.body as { data?: unknown })?.data ?? req.body;
    svc.processWebhookOrder(storeId, payload as any).catch((err) => {
      console.error(`[webhook] Error processing order for store ${storeId}:`, err);
    });

    return reply.status(200).send({ received: true });
  });
}
