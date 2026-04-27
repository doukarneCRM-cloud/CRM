import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import {
  CreateStoreSchema,
  UpdateStoreSchema,
  OAuthCallbackSchema,
  ImportProductsSchema,
  ImportOrdersSchema,
  UpdateProviderSchema,
} from './integrations.schema';
import * as svc from './integrations.service';
import * as providers from './providers.service';
import * as coliix from './coliix.service';
import { maskSecret } from '../../shared/encryption';
import { z } from 'zod';

const BulkExportSchema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(100),
});

export async function integrationsRoutes(app: FastifyInstance) {
  // ── Store CRUD ──────────────────────────────────────────────────────────────

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

  // ── OAuth ───────────────────────────────────────────────────────────────────

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

  // One-shot repair: re-fetch every imported YouCan order and patch its
  // Order.createdAt to the original placement timestamp from YouCan. Needed
  // because older imports defaulted to `now()` and the CRM list ended up
  // sorted by Prisma insert order. Safe to re-run — already-correct rows
  // (within 1 second) are skipped.
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

  // ── Shipping providers (Coliix, etc.) ──────────────────────────────────────

  app.get('/providers', { preHandler: [verifyJWT, requirePermission('integrations:view')] }, async (_req, reply) => {
    const rows = await providers.listProvidersPublic();
    return reply.send({ data: rows });
  });

  app.get('/providers/:name', { preHandler: [verifyJWT, requirePermission('integrations:view')] }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const row = await providers.getProviderPublic(name);
    return reply.send(row);
  });

  app.patch('/providers/:name', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const input = UpdateProviderSchema.parse(req.body);
    const row = await providers.updateProvider(name, input);
    return reply.send(row);
  });

  app.post('/providers/:name/rotate-secret', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const row = await providers.rotateWebhookSecret(name);
    return reply.send(row);
  });

  app.post('/providers/:name/test', { preHandler: [verifyJWT, requirePermission('integrations:manage')] }, async (req, reply) => {
    const { name } = req.params as { name: string };
    const result = await providers.testConnection(name);
    return reply.send(result);
  });

  // ── Coliix export ─────────────────────────────────────────────────────────

  app.post('/coliix/export/:orderId', { preHandler: [verifyJWT, requirePermission('shipping:push')] }, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const result = await coliix.exportOrder(orderId, req.user);
    const status = result.ok ? 200 : 400;
    return reply.status(status).send(result);
  });

  app.post('/coliix/export', { preHandler: [verifyJWT, requirePermission('shipping:push')] }, async (req, reply) => {
    const { orderIds } = BulkExportSchema.parse(req.body);
    const result = await coliix.exportOrders(orderIds, req.user);
    return reply.send(result);
  });

  // ── Coliix tracking — manual diagnostics ──────────────────────────────────
  // The poller runs every 5 minutes; these endpoints let an admin force a
  // refresh now and inspect the raw Coliix response (state + history) so the
  // mapping can be verified end-to-end without waiting for the next tick.

  app.get('/coliix/in-flight', { preHandler: [verifyJWT, requirePermission('shipping:push')] }, async (_req, reply) => {
    const orders = await coliix.listInFlightOrders();
    return reply.send({ total: orders.length, orders });
  });

  app.post('/coliix/track/:orderId', { preHandler: [verifyJWT, requirePermission('shipping:push')] }, async (req, reply) => {
    const { orderId } = req.params as { orderId: string };
    const result = await coliix.trackOrderNow(orderId);
    return reply.status(result.ok ? 200 : 400).send(result);
  });

  app.post('/coliix/refresh-all', { preHandler: [verifyJWT, requirePermission('shipping:push')] }, async (_req, reply) => {
    const result = await coliix.refreshAllInFlight();
    return reply.send(result);
  });

  // Webhook health — last inbound webhook, last poller hit, count in the
  // last hour and 24 hours. Lets the admin tell at a glance whether Coliix
  // is actually calling our URL (the precondition for "instant" updates).
  app.get(
    '/coliix/webhook-health',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (_req, reply) => {
      const health = await providers.getColiixWebhookHealth();
      return reply.send(health);
    },
  );

  // ── Coliix webhook — instant status updates ───────────────────────────────
  // Coliix calls this URL (GET or POST) whenever a parcel state changes. The
  // path-segment secret is how we authenticate — no header, no HMAC, so don't
  // move it to a query string and don't ever log the full URL.
  //
  // We accept flexible field names since Coliix docs vary across environments:
  //   tracking:  tracking | tracking_code | ref | trackingCode
  //   state:     state | status | new_state
  //   driver:    driver_note | note | comment
  const coliixWebhookHandler = async (req: any, reply: any) => {
    // Always-on diagnostic log of the raw inbound hit. Critical when Coliix
    // is "supposed to be calling us" but orders aren't moving — without
    // this line we have no proof the request even reached the server, and
    // a typo'd URL / IP block / wrong content-type silently produces zero
    // trace. Body and query are flattened so we capture both shapes.
    app.log.info(
      {
        secretMasked: maskSecret(((req.params as any)?.secret) ?? ''),
        method: req.method,
        ip: req.ip,
        contentType: req.headers?.['content-type'] ?? null,
        userAgent: req.headers?.['user-agent'] ?? null,
        query: req.query ?? null,
        body: req.body ?? null,
      },
      '[coliix-webhook] inbound',
    );

    const { secret } = req.params as { secret: string };
    const { prisma } = await import('../../shared/prisma');
    const row = await prisma.shippingProvider.findFirst({
      where: { name: 'coliix', webhookSecret: secret },
      select: { id: true, isActive: true },
    });
    if (!row) {
      app.log.warn(
        { secretMasked: maskSecret(secret) },
        '[coliix-webhook] rejected — secret does not match any Coliix provider row',
      );
      return reply.status(404).send({ error: 'Invalid webhook secret' });
    }
    if (!row.isActive) {
      app.log.info('[coliix-webhook] integration disabled — accepted but ignored');
      return reply.status(200).send({ ignored: true, reason: 'Coliix integration disabled' });
    }

    const source = { ...(req.query ?? {}), ...((req.body as Record<string, unknown>) ?? {}) } as Record<string, unknown>;

    const tracking = String(source.tracking ?? source.tracking_code ?? source.trackingCode ?? source.ref ?? '').trim();
    const rawState = String(source.state ?? source.status ?? source.new_state ?? '').trim();
    const driverNote =
      typeof source.driver_note === 'string'
        ? source.driver_note
        : typeof source.note === 'string'
        ? source.note
        : typeof source.comment === 'string'
        ? source.comment
        : null;
    const eventDateStr =
      typeof source.date === 'string'
        ? source.date
        : typeof source.event_date === 'string'
        ? source.event_date
        : null;
    const eventDate = eventDateStr ? new Date(eventDateStr) : null;

    if (!tracking || !rawState) {
      app.log.warn(
        {
          parsedTracking: tracking || null,
          parsedRawState: rawState || null,
          payloadKeys: Object.keys(source),
        },
        '[coliix-webhook] payload missing tracking or state — Coliix sent fields we do not recognize',
      );
      return reply.status(400).send({
        error: 'Missing tracking or state',
        hint: 'Send tracking + state in JSON body, query string, or form-urlencoded. Accepted aliases: tracking|tracking_code|trackingCode|ref AND state|status|new_state.',
        payloadKeys: Object.keys(source),
      });
    }

    const result = await coliix.ingestStatus({
      tracking,
      rawState,
      driverNote,
      eventDate: eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate : null,
      source: 'webhook',
    });

    app.log.info({ tracking, rawState, result }, '[coliix-webhook] ingest result');

    // Always 200 on matched events — even when the status didn't actually
    // change — so Coliix doesn't hammer us with retries. Only unmatched
    // tracking codes produce 404 so ops can notice the drift.
    if (!result.matched) {
      return reply.status(404).send({ received: true, ...result });
    }
    return reply.status(200).send({ received: true, ...result });
  };

  app.get('/coliix/webhook/:secret', coliixWebhookHandler);
  app.post('/coliix/webhook/:secret', coliixWebhookHandler);

  // ── Webhook (no auth — verified by HMAC signature) ────────────────────────

  app.post('/youcan/webhook/:storeId', { config: { rawBody: true } }, async (req, reply) => {
    const { storeId } = req.params as { storeId: string };
    const signature = req.headers['x-youcan-signature'] as string | undefined;

    const store = await svc.getStore(storeId).catch(() => null);
    if (!store) return reply.status(404).send({ error: 'Store not found' });

    // Verify signature if webhook secret exists
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

    // Process asynchronously
    const payload = (req.body as { data?: unknown })?.data ?? req.body;
    svc.processWebhookOrder(storeId, payload as any).catch((err) => {
      console.error(`[webhook] Error processing order for store ${storeId}:`, err);
    });

    return reply.status(200).send({ received: true });
  });
}
