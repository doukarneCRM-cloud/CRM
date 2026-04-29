/**
 * Coliix V2 admin + webhook routes.
 *
 * Mounted at /api/v1/coliixv2 (see src/index.ts). Auth model:
 *   - admin endpoints: verifyJWT + requirePermission
 *   - webhook: public (auth via path secret)
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ShipmentState } from '@prisma/client';

import { verifyJWT } from '../../../shared/middleware/verifyJWT';
import { requirePermission } from '../../../shared/middleware/rbac.middleware';
import { prisma } from '../../../shared/prisma';

import * as accounts from './accounts.service';
import * as cities from './cities.service';
import * as shipments from './shipments.service';
import { migrateV1Orders } from './migration.service';
import { decryptAccount, ping } from './coliixV2.client';
import { invalidateMappingCache } from './mapping.cache';
import { coliixV2WebhookHandler } from './webhook.controller';
import { ingestTrackHistory } from './events.service';
import { trackParcel } from './coliixV2.client';

const CARRIER_CODE = 'coliix_v2';

const CreateAccountSchema = z.object({
  hubLabel: z.string().min(1).max(80),
  apiBaseUrl: z.string().url().optional(),
  apiKey: z.string().min(8).max(256),
  storeId: z.string().nullable().optional(),
});

const UpdateAccountSchema = z.object({
  hubLabel: z.string().min(1).max(80).optional(),
  apiBaseUrl: z.string().url().optional(),
  apiKey: z.string().min(8).max(256).optional(),
  storeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const CreateShipmentSchema = z.object({
  accountId: z.string().optional(),
  cod: z.number().positive().optional(),
  note: z.string().max(500).nullable().optional(),
});

const UpdateMappingSchema = z.object({
  // null = "stay raw" (no enum bucket flip on this wording)
  internalState: z.nativeEnum(ShipmentState).nullable(),
  isTerminal: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function coliixV2Routes(app: FastifyInstance) {
  // ── Carrier accounts ──────────────────────────────────────────────────────

  app.get(
    '/accounts',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (_req, reply) => {
      const list = await accounts.listAccounts();
      return reply.send({ accounts: list });
    },
  );

  app.post(
    '/accounts',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const body = CreateAccountSchema.parse(req.body);
      const created = await accounts.createAccount(body);
      return reply.status(201).send(created);
    },
  );

  app.patch(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = UpdateAccountSchema.parse(req.body);
      const updated = await accounts.updateAccount(id, body);
      return reply.send(updated);
    },
  );

  app.delete(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      // Refuse delete if any active shipments exist — the operator should
      // cancel or finish them first.
      const active = await prisma.shipment.count({
        where: {
          accountId: id,
          state: { notIn: ['delivered', 'returned', 'refused', 'lost', 'cancelled'] },
        },
      });
      if (active > 0) {
        return reply.status(409).send({
          error: `Cannot delete: ${active} active shipment(s) still in flight`,
          activeCount: active,
        });
      }
      await prisma.carrierAccount.delete({ where: { id } });
      return reply.send({ ok: true });
    },
  );

  app.post(
    '/accounts/:id/test',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const decrypted = await accounts.getDecryptedAccount(id);
      const result = await ping({ apiBaseUrl: decrypted.apiBaseUrl, apiKey: decrypted.apiKey });
      await accounts.recordHealth(id, { ok: result.ok, message: result.message });
      return reply.send(result);
    },
  );

  app.post(
    '/accounts/:id/rotate-secret',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const updated = await accounts.rotateWebhookSecret(id);
      return reply.send(updated);
    },
  );

  app.post(
    '/accounts/:id/sync-cities',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await cities.syncCities(id);
      return reply.send(result);
    },
  );

  // Bridge from V1 ShippingCity table — admins have already curated
  // city / zone / price there, so V2 inherits with one click.
  app.post(
    '/accounts/:id/import-v1-cities',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await cities.importFromV1Cities(id);
      return reply.send(result);
    },
  );

  // CSV import — admins paste rows from spreadsheet. Schema mirrors V1's
  // ShippingCity import for muscle-memory (name → ville here).
  const ImportCitiesCsvSchema = z.object({
    rows: z
      .array(
        z.object({
          ville: z.string().min(1).max(120),
          zone: z.string().max(80).nullable().optional(),
          deliveryPrice: z.number().nonnegative().max(10_000).nullable().optional(),
        }),
      )
      .min(1)
      .max(2000),
    mode: z.enum(['upsert', 'replace']).default('upsert'),
  });
  app.post(
    '/accounts/:id/import-cities-csv',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = ImportCitiesCsvSchema.parse(req.body);
      const result = await cities.importCitiesCsv(id, body.rows, body.mode);
      return reply.send(result);
    },
  );

  // V1 → V2 migration. Creates Shipment rows for every in-flight V1 order
  // (has coliixTrackingId, not terminal) so V2 webhooks can find them by
  // tracking code. Idempotent — re-runs are safe.
  app.post(
    '/accounts/:id/migrate-v1',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const result = await migrateV1Orders(id);
      return reply.send(result);
    },
  );

  app.get(
    '/accounts/:id/cities',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const list = await cities.listCities(id);
      return reply.send({ cities: list });
    },
  );

  // ── Diagnostic — single endpoint that returns every observable signal
  // we'd otherwise have to hunt for. Used for "why isn't V2 working" triage.
  app.get(
    '/accounts/:id/diagnostic',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const since1h = new Date(Date.now() - 60 * 60_000);
      const since24h = new Date(Date.now() - 24 * 60 * 60_000);

      const [
        account,
        shipmentTotal,
        shipmentByState,
        latestShipment,
        latestEvent,
        webhook1h,
        webhook24h,
        webhookLast,
        webhookLastFail,
        recentEvents,
        v1OrderCount,
        v1OrderInflight,
        v1OrderMigrated,
      ] = await Promise.all([
        prisma.carrierAccount.findUnique({
          where: { id },
          select: { id: true, hubLabel: true, isActive: true, lastError: true, lastHealthAt: true },
        }),
        prisma.shipment.count({ where: { accountId: id } }),
        prisma.shipment.groupBy({
          by: ['state'],
          where: { accountId: id },
          _count: { _all: true },
        }),
        prisma.shipment.findFirst({
          where: { accountId: id },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            trackingCode: true,
            state: true,
            rawState: true,
            createdAt: true,
            updatedAt: true,
            nextPollAt: true,
            lastPolledAt: true,
            orderId: true,
          },
        }),
        prisma.shipmentEvent.findFirst({
          where: { shipment: { accountId: id } },
          orderBy: { receivedAt: 'desc' },
          select: { id: true, source: true, rawState: true, receivedAt: true },
        }),
        prisma.webhookEventLog.count({
          where: { provider: 'coliix_v2', createdAt: { gte: since1h } },
        }),
        prisma.webhookEventLog.count({
          where: { provider: 'coliix_v2', createdAt: { gte: since24h } },
        }),
        prisma.webhookEventLog.findFirst({
          where: { provider: 'coliix_v2' },
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            ok: true,
            statusCode: true,
            tracking: true,
            rawState: true,
            reason: true,
          },
        }),
        prisma.webhookEventLog.findFirst({
          where: { provider: 'coliix_v2', ok: false },
          orderBy: { createdAt: 'desc' },
          select: {
            createdAt: true,
            statusCode: true,
            tracking: true,
            reason: true,
          },
        }),
        prisma.shipmentEvent.findMany({
          where: { shipment: { accountId: id } },
          orderBy: { receivedAt: 'desc' },
          take: 5,
          select: {
            source: true,
            rawState: true,
            mappedState: true,
            occurredAt: true,
            shipment: { select: { trackingCode: true, state: true, orderId: true } },
          },
        }),
        // V1 order context (independent of any V2 account)
        prisma.order.count({ where: { coliixTrackingId: { not: null } } }),
        prisma.order.count({
          where: {
            coliixTrackingId: { not: null },
            shippingStatus: {
              notIn: ['delivered', 'returned', 'return_validated', 'return_refused', 'exchange', 'lost', 'destroyed'],
            },
          },
        }),
        prisma.shipment.count({ where: { accountId: id, idempotencyKey: { startsWith: 'migrated-' } } }),
      ]);

      return reply.send({
        deployHint: 'Compare these counts before/after running migrate or after a known Coliix state change.',
        account,
        shipments: {
          total: shipmentTotal,
          byState: shipmentByState.map((b) => ({ state: b.state, count: b._count._all })),
          latest: latestShipment,
          migratedCount: v1OrderMigrated,
        },
        events: {
          latest: latestEvent,
          recent: recentEvents,
        },
        webhook: {
          count1h: webhook1h,
          count24h: webhook24h,
          last: webhookLast,
          lastFailure: webhookLastFail,
        },
        v1Context: {
          totalOrdersWithTrackingCode: v1OrderCount,
          inflightOrdersToMigrate: v1OrderInflight,
        },
      });
    },
  );

  app.get(
    '/accounts/:id/health',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const since1h = new Date(Date.now() - 60 * 60_000);
      const since24h = new Date(Date.now() - 24 * 60 * 60_000);
      const [acct, lastWebhook, count1h, count24h, recentRejections] = await Promise.all([
        accounts.getAccountPublic(id),
        prisma.webhookEventLog.findFirst({
          where: { provider: 'coliix_v2', createdAt: { gte: since24h } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, ok: true, tracking: true, rawState: true },
        }),
        prisma.webhookEventLog.count({
          where: { provider: 'coliix_v2', createdAt: { gte: since1h } },
        }),
        prisma.webhookEventLog.count({
          where: { provider: 'coliix_v2', createdAt: { gte: since24h } },
        }),
        prisma.webhookEventLog.findMany({
          where: { provider: 'coliix_v2', ok: false, createdAt: { gte: since24h } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            createdAt: true,
            statusCode: true,
            secretMatched: true,
            tracking: true,
            rawState: true,
            reason: true,
            ip: true,
          },
        }),
      ]);
      return reply.send({
        account: acct,
        lastWebhookAt: lastWebhook?.createdAt ?? null,
        lastWebhookOk: lastWebhook?.ok ?? null,
        count1h,
        count24h,
        recentRejections,
      });
    },
  );

  // ── Shipments ─────────────────────────────────────────────────────────────

  app.post(
    '/shipments/:orderId',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string };
      const body = CreateShipmentSchema.parse(req.body ?? {});
      try {
        const result = await shipments.createShipmentFromOrder({ orderId, ...body });
        return reply.status(201).send(result);
      } catch (err) {
        if (err instanceof shipments.ShipmentValidationError) {
          return reply.status(400).send({ error: err.message, code: err.code });
        }
        throw err;
      }
    },
  );

  app.post(
    '/shipments/bulk',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const body = z
        .object({ orderIds: z.array(z.string()).min(1).max(100) })
        .parse(req.body);
      const results: Array<{ orderId: string; ok: boolean; shipmentId?: string; error?: string }> = [];
      for (const orderId of body.orderIds) {
        try {
          const r = await shipments.createShipmentFromOrder({ orderId });
          results.push({ orderId, ok: true, shipmentId: r.shipmentId });
        } catch (err) {
          results.push({
            orderId,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return reply.send({
        total: results.length,
        ok: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      });
    },
  );

  app.get(
    '/shipments/:id',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const detail = await shipments.getShipmentDetail(id);
      if (!detail) return reply.status(404).send({ error: 'Not found' });
      return reply.send(detail);
    },
  );

  app.get(
    '/orders/:orderId/shipments',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const { orderId } = req.params as { orderId: string };
      const list = await shipments.listShipmentsForOrder(orderId);
      return reply.send({ shipments: list });
    },
  );

  app.post(
    '/shipments/:id/refresh',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const ship = await prisma.shipment.findUnique({
        where: { id },
        include: {
          account: { select: { apiBaseUrl: true, apiKey: true, isActive: true } },
        },
      });
      if (!ship) return reply.status(404).send({ error: 'Not found' });
      if (!ship.trackingCode) {
        return reply.status(400).send({ error: 'Shipment has no tracking code yet' });
      }
      const acct = decryptAccount({
        apiBaseUrl: ship.account.apiBaseUrl,
        apiKey: ship.account.apiKey,
      });
      const tr = await trackParcel(acct, ship.trackingCode);
      if (tr.events.length === 0) {
        return reply.send({ ok: true, changed: 0, ingested: 0, reason: 'no_events' });
      }
      // Persist the full history — refresh-now should backfill anything we
      // missed, not just the latest. dedupeHash keeps it idempotent.
      const result = await ingestTrackHistory({
        shipmentId: ship.id,
        source: 'manual',
        events: tr.events,
        rawPayload: tr.raw,
      });
      return reply.send({ ok: true, ...result });
    },
  );

  app.post(
    '/shipments/:id/cancel',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body ?? {});
      try {
        await shipments.cancelShipment(id, body.reason ?? null);
        return reply.send({ ok: true });
      } catch (err) {
        if (err instanceof shipments.ShipmentValidationError) {
          return reply.status(400).send({ error: err.message, code: err.code });
        }
        throw err;
      }
    },
  );

  // ── Mappings ──────────────────────────────────────────────────────────────

  app.get(
    '/mappings',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (_req, reply) => {
      const rows = await prisma.coliixV2StatusMapping.findMany({
        where: { carrierCode: CARRIER_CODE },
        orderBy: [{ rawWording: 'asc' }],
      });
      // Count shipments per (rawWording → state) for the editor's preview pane.
      const counts = await prisma.shipment.groupBy({
        by: ['rawState', 'state'],
        where: { rawState: { not: null } },
        _count: { _all: true },
      });
      const enriched = rows.map((r) => {
        const matching = counts.filter((c) => c.rawState === r.rawWording);
        return {
          ...r,
          shipmentCount: matching.reduce((s, m) => s + m._count._all, 0),
          buckets: matching.map((m) => ({ state: m.state, count: m._count._all })),
        };
      });
      return reply.send({ mappings: enriched });
    },
  );

  app.patch(
    '/mappings/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = UpdateMappingSchema.parse(req.body);
      const updated = await prisma.coliixV2StatusMapping.update({
        where: { id },
        data: {
          internalState: body.internalState,
          isTerminal: body.isTerminal ?? false,
          note: body.note ?? null,
          updatedById: req.user.sub,
        },
      });
      invalidateMappingCache();
      // Re-bucket existing shipments that match this wording — only when
      // the new mapping is concrete (null = "stay raw" should NOT touch
      // existing shipments' state).
      let rebucketed = 0;
      if (updated.internalState !== null) {
        const r = await prisma.shipment.updateMany({
          where: { rawState: updated.rawWording },
          data: { state: updated.internalState },
        });
        rebucketed = r.count;
      }
      return reply.send({ mapping: updated, rebucketed });
    },
  );

  // ── Webhook (public — auth by path secret) ────────────────────────────────
  app.get('/webhook/:accountId/:secret', coliixV2WebhookHandler);
  app.post('/webhook/:accountId/:secret', coliixV2WebhookHandler);
}
