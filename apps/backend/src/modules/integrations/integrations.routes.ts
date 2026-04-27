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

  // Distinct Coliix raw-state values currently present on orders. Drives
  // the shipping-status chip dropdown so admins filter by Coliix's actual
  // wordings (Ramassé, Livré, Attente De Ramassage, …) instead of our
  // internal enum.
  app.get(
    '/coliix/states',
    { preHandler: [verifyJWT] },
    async (_req, reply) => {
      const { prisma } = await import('../../shared/prisma');
      const rows = await prisma.order.groupBy({
        by: ['coliixRawState'],
        where: { coliixRawState: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { coliixRawState: 'desc' } },
      });
      return reply.send({
        states: rows
          .filter((r) => r.coliixRawState !== null)
          .map((r) => ({ value: r.coliixRawState as string, count: r._count._all })),
      });
    },
  );

  // ── Coliix webhook — instant status updates ───────────────────────────────
  // Coliix calls this URL (GET or POST) whenever a parcel state changes. The
  // path-segment secret is how we authenticate — no header, no HMAC, so don't
  // move it to a query string and don't ever log the full URL.
  //
  // We accept flexible field names since Coliix docs vary across environments,
  // and the production dashboard documents the canonical names below:
  //   tracking:  code (canonical) | tracking | tracking_code | trackingCode | ref
  //   state:     state (canonical) | status | new_state
  //   date:      datereported (canonical) | date | event_date
  //   note:      note (canonical) | driver_note | comment
  const coliixWebhookHandler = async (req: any, reply: any) => {
    const { prisma } = await import('../../shared/prisma');
    const source = {
      ...(req.query ?? {}),
      ...((req.body as Record<string, unknown>) ?? {}),
    } as Record<string, unknown>;

    // Parse early so the audit row records what we extracted (or didn't).
    const tracking = String(
      source.code ??           // Coliix's documented canonical name
      source.tracking ??
      source.tracking_code ??
      source.trackingCode ??
      source.ref ?? ''
    ).trim();
    const rawState = String(source.state ?? source.status ?? source.new_state ?? '').trim();
    const driverNote =
      typeof source.note === 'string'
        ? source.note         // Coliix's canonical name
        : typeof source.driver_note === 'string'
        ? source.driver_note
        : typeof source.comment === 'string'
        ? source.comment
        : null;
    const eventDateStr =
      typeof source.datereported === 'string'   // Coliix's canonical name
        ? source.datereported
        : typeof source.date === 'string'
        ? source.date
        : typeof source.event_date === 'string'
        ? source.event_date
        : null;
    const eventDate = eventDateStr ? new Date(eventDateStr) : null;

    // Audit-log every inbound hit to a dedicated table BEFORE branching, so
    // the Health panel can show rejected calls (wrong secret, bad payload,
    // unknown tracking) — not just successful ingests. Fire-and-forget on
    // the write so a DB hiccup never fails the webhook itself; Coliix would
    // retry into a perpetual loop.
    const recordEvent = (
      ok: boolean,
      statusCode: number,
      secretMatched: boolean,
      reason: string | null,
    ) => {
      void prisma.webhookEventLog
        .create({
          data: {
            provider: 'coliix',
            ok,
            secretMatched,
            statusCode,
            tracking: tracking || null,
            rawState: rawState || null,
            payload: source as object,
            ip: typeof req.ip === 'string' ? req.ip : null,
            reason,
          },
        })
        .catch((err: unknown) => {
          app.log.warn({ err }, '[coliix-webhook] audit insert failed');
        });
    };

    // Always-on diagnostic log to fastify too — visible in the platform's
    // log aggregator alongside the DB audit row.
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
    const row = await prisma.shippingProvider.findFirst({
      where: { name: 'coliix', webhookSecret: secret },
      select: { id: true, isActive: true },
    });
    if (!row) {
      app.log.warn(
        { secretMasked: maskSecret(secret) },
        '[coliix-webhook] rejected — secret does not match any Coliix provider row',
      );
      recordEvent(false, 404, false, 'Invalid webhook secret');
      return reply.status(404).send({ error: 'Invalid webhook secret' });
    }
    if (!row.isActive) {
      app.log.info('[coliix-webhook] integration disabled — accepted but ignored');
      recordEvent(true, 200, true, 'Coliix integration disabled');
      return reply.status(200).send({ ignored: true, reason: 'Coliix integration disabled' });
    }

    if (!tracking || !rawState) {
      app.log.warn(
        {
          parsedTracking: tracking || null,
          parsedRawState: rawState || null,
          payloadKeys: Object.keys(source),
        },
        '[coliix-webhook] payload missing tracking or state — Coliix sent fields we do not recognize',
      );
      recordEvent(
        false,
        400,
        true,
        `Missing tracking or state — payload keys: ${Object.keys(source).join(', ') || '(empty)'}`,
      );
      return reply.status(400).send({
        error: 'Missing tracking or state',
        hint: 'Send tracking + state in JSON body, query string, or form-urlencoded. Accepted aliases: code|tracking|tracking_code|trackingCode|ref AND state|status|new_state.',
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
      recordEvent(false, 404, true, result.reason ?? 'Tracking not found in CRM');
      return reply.status(404).send({ received: true, ...result });
    }
    recordEvent(
      true,
      200,
      true,
      result.changed
        ? `Status → ${result.newStatus}`
        : (result.reason ?? 'Status unchanged'),
    );
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
