/**
 * Coliix integration routes — `/api/v1/coliix/*`.
 *
 * Phase B routes only (account CRUD + health + test). Cities, Mappings,
 * Shipments, Webhook, Errors will be added in their respective phases —
 * this file is the single registration point so adding a phase = adding
 * a route block here, no further wiring needed.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT } from '../../../shared/middleware/verifyJWT';
import { requirePermission } from '../../../shared/middleware/rbac.middleware';
import { ShipmentState } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import * as accounts from './accounts.service';
import * as cities from './cities.service';
import * as mapping from './mapping.service';
import * as shipments from './shipments.service';
import * as errors from './errors.service';
import { registerWebhookRoutes } from './webhook.controller';

// ─── Schemas ────────────────────────────────────────────────────────────────

const CreateAccountSchema = z.object({
  hubLabel: z.string().min(1).max(60),
  apiBaseUrl: z.string().url(),
  apiKey: z.string().min(8).max(256),
});

const UpdateAccountSchema = z.object({
  hubLabel: z.string().min(1).max(60).optional(),
  apiBaseUrl: z.string().url().optional(),
  // null leaves the existing key untouched; a string replaces it.
  apiKey: z.string().min(8).max(256).nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateCitySchema = z.object({
  ville: z.string().min(1).max(120).optional(),
  zone: z.string().max(60).nullable().optional(),
  // null clears the fee; positive number sets it.
  deliveryPrice: z.number().nonnegative().nullable().optional(),
});

const CreateMappingSchema = z.object({
  rawWording: z.string().min(1).max(120),
  internalState: z.nativeEnum(ShipmentState).nullable().optional(),
  isTerminal: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

const UpdateMappingSchema = z.object({
  internalState: z.nativeEnum(ShipmentState).nullable().optional(),
  isTerminal: z.boolean().optional(),
  note: z.string().max(500).nullable().optional(),
});

const CreateShipmentSchema = z.object({
  // Optional when the CRM has only one active hub; required otherwise.
  accountId: z.string().cuid().optional(),
  // Force=true replaces an existing shipment (re-send). UI uses this
  // when the agent confirms a re-link.
  force: z.boolean().optional(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function coliixRoutes(app: FastifyInstance) {
  // ── Webhook (no JWT — auth via path-secret) ──────────────────────────────
  // Registered first so it doesn't get accidentally caught by a more
  // specific authenticated route below.
  registerWebhookRoutes(app);

  // ── Accounts (hubs) ──────────────────────────────────────────────────────

  app.get(
    '/accounts',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (_req, reply) => reply.send({ data: await accounts.listAccounts() }),
  );

  app.get<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => reply.send(await accounts.getAccount(req.params.id)),
  );

  app.post(
    '/accounts',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = CreateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const row = await accounts.createAccount(parsed.data);
      return reply.status(201).send(row);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = UpdateAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const row = await accounts.updateAccount(req.params.id, parsed.data);
      return reply.send(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      await accounts.deleteAccount(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/accounts/:id/test',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => reply.send(await accounts.testAccount(req.params.id)),
  );

  app.post<{ Params: { id: string } }>(
    '/accounts/:id/rotate-secret',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => reply.send(await accounts.rotateWebhookSecret(req.params.id)),
  );

  // Per-hub health snapshot — last webhook seen, last poll, 24h errors.
  // Drives the green/red strip at the top of the Setup tab so silent
  // outages (no webhook in 24h) are visible at a glance.
  app.get(
    '/health',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (_req, reply) => reply.send({ data: await accounts.listAccountHealth() }),
  );

  // ── Cities ───────────────────────────────────────────────────────────────

  app.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId/cities',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const payload = await cities.listCities({
        accountId: req.params.accountId,
        search: q.search,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      return reply.send(payload);
    },
  );

  // CSV upload — multipart/form-data, single field name "file" + optional
  // text field "mode" (merge|replace, default merge).
  app.post<{ Params: { accountId: string } }>(
    '/accounts/:accountId/cities/import-csv',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parts = req.parts();
      let csvText: string | null = null;
      let mode: 'merge' | 'replace' = 'merge';
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk as Buffer);
          csvText = Buffer.concat(chunks).toString('utf8');
        } else if (part.type === 'field' && part.fieldname === 'mode') {
          if (part.value === 'replace' || part.value === 'merge') mode = part.value;
        }
      }
      if (!csvText) {
        return reply.status(400).send({
          error: { code: 'NO_FILE', message: 'CSV file required (form field "file")' },
        });
      }
      const summary = await cities.importCitiesCsv(req.params.accountId, csvText, mode);
      return reply.send(summary);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/cities/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = UpdateCitySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const row = await cities.updateCity(req.params.id, parsed.data);
      return reply.send(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/cities/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      await cities.deleteCity(req.params.id);
      return reply.send({ ok: true });
    },
  );

  // ── Mappings ─────────────────────────────────────────────────────────────

  app.get(
    '/mappings',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const filter = (q.filter as 'all' | 'mapped' | 'unknown') ?? 'all';
      const rows = await mapping.listMappings({
        search: q.search,
        filter: ['all', 'mapped', 'unknown'].includes(filter) ? filter : 'all',
      });
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/mappings',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = CreateMappingSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const row = await mapping.createMapping({
        ...parsed.data,
        updatedById: req.user.sub,
      });
      return reply.status(201).send(row);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/mappings/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = UpdateMappingSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const row = await mapping.updateMapping(req.params.id, {
        ...parsed.data,
        updatedById: req.user.sub,
      });
      return reply.send(row);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/mappings/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      await mapping.deleteMapping(req.params.id);
      return reply.send({ ok: true });
    },
  );

  // ── Shipments ────────────────────────────────────────────────────────────

  // Pre-fetch the form payload — order summary + city validation +
  // existing-shipment status. The "Mark as Shipped" modal calls this on
  // open so it can render the warning banners before the user types.
  app.get<{ Params: { orderId: string } }>(
    '/shipments/:orderId/draft',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const accountId = q.accountId ?? (await shipments.getDefaultAccountId());
      if (!accountId) {
        return reply.status(412).send({
          error: {
            code: 'NO_ACTIVE_HUB',
            message: 'No active Coliix hub. Configure one on the Setup tab.',
          },
        });
      }
      const draft = await shipments.getOrderShipmentDraft(req.params.orderId, accountId);
      return reply.send({ accountId, ...draft });
    },
  );

  app.post<{ Params: { orderId: string } }>(
    '/shipments/:orderId',
    { preHandler: [verifyJWT, requirePermission('shipping:push')] },
    async (req, reply) => {
      const parsed = CreateShipmentSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }

      const accountId =
        parsed.data.accountId ?? (await shipments.getDefaultAccountId());
      if (!accountId) {
        return reply.status(412).send({
          error: {
            code: 'NO_ACTIVE_HUB',
            message: 'No active Coliix hub. Configure one on the Setup tab.',
          },
        });
      }
      if (parsed.data.accountId && !(await shipments.accountExists(parsed.data.accountId))) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Account not found' },
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        select: { id: true, name: true },
      });
      if (!user) {
        return reply.status(401).send({
          error: { code: 'UNAUTHORIZED', message: 'User not found' },
        });
      }

      try {
        const result = await shipments.createShipment({
          orderId: req.params.orderId,
          accountId,
          force: parsed.data.force,
          actor: user,
        });
        return reply.send(result);
      } catch (err) {
        if (shipments.isUniqueTrackingViolation(err)) {
          return reply.status(409).send({
            error: {
              code: 'TRACKING_TAKEN',
              message: 'Coliix returned a tracking code already linked to another order.',
            },
          });
        }
        // Domain errors (city_unknown, hub_inactive, …) come with
        // statusCode + code attached by the service. The shared error
        // handler in app/index.ts already translates those, so just
        // rethrow.
        throw err;
      }
    },
  );

  app.get<{ Params: { orderId: string } }>(
    '/shipments/:orderId',
    { preHandler: [verifyJWT, requirePermission('shipping:view')] },
    async (req, reply) => {
      const detail = await shipments.getShipmentDetail(req.params.orderId);
      if (!detail) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'No shipment for this order' },
        });
      }
      return reply.send(detail);
    },
  );

  // Debug — call Coliix track for a tracking code and return the raw
  // body. Used during integration setup to see exactly what Coliix sends
  // so the parser can be tuned. Hidden behind integrations:manage.
  app.get<{ Params: { tracking: string } }>(
    '/_debug/track/:tracking',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const accountId = await shipments.getDefaultAccountId();
      if (!accountId) {
        return reply.status(412).send({
          error: { code: 'NO_ACTIVE_HUB', message: 'No active hub' },
        });
      }
      const apiKey = await accounts.getDecryptedApiKey(accountId);
      const account = await accounts.getAccount(accountId);
      const { track } = await import('./coliix.client');
      try {
        const response = await track({
          baseUrl: account.apiBaseUrl,
          apiKey,
          tracking: req.params.tracking,
        });
        return reply.send({ ok: true, response });
      } catch (err) {
        return reply.send({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          kind: (err as { kind?: string })?.kind,
          body: (err as { body?: unknown })?.body,
        });
      }
    },
  );

  // ── Errors ───────────────────────────────────────────────────────────────

  app.get(
    '/errors',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const payload = await errors.listErrors({
        type: q.type as never,
        resolved: q.resolved === 'true' ? true : q.resolved === 'false' ? false : undefined,
        page: q.page ? Number(q.page) : undefined,
        pageSize: q.pageSize ? Number(q.pageSize) : undefined,
      });
      return reply.send(payload);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/errors/:id/resolve',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => reply.send(await errors.resolveError(req.params.id, req.user.sub)),
  );

  app.get(
    '/errors/unresolved-count',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (_req, reply) => reply.send({ count: await errors.unresolvedCount() }),
  );
}
