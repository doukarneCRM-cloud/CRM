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
import { decryptAccount, ping } from './coliixV2.client';
import { invalidateMappingCache } from './mapping.cache';
import { coliixV2WebhookHandler } from './webhook.controller';
import { ingestEvent } from './events.service';
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
  internalState: z.nativeEnum(ShipmentState),
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

  app.get(
    '/accounts/:id/cities',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const list = await cities.listCities(id);
      return reply.send({ cities: list });
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
      const top = tr.events[0];
      if (!top) {
        return reply.send({ ok: true, changed: false, reason: 'no_events' });
      }
      const result = await ingestEvent({
        shipmentId: ship.id,
        source: 'manual',
        rawState: top.state,
        driverNote: top.driverNote ?? null,
        occurredAt: top.occurredAt ? new Date(top.occurredAt) : new Date(),
        payload: tr.raw as Record<string, unknown>,
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
      // Re-bucket existing shipments that match this wording.
      const rebucket = await prisma.shipment.updateMany({
        where: { rawState: updated.rawWording },
        data: { state: updated.internalState },
      });
      return reply.send({ mapping: updated, rebucketed: rebucket.count });
    },
  );

  // ── Webhook (public — auth by path secret) ────────────────────────────────
  app.get('/webhook/:accountId/:secret', coliixV2WebhookHandler);
  app.post('/webhook/:accountId/:secret', coliixV2WebhookHandler);
}
