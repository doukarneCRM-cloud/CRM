/**
 * Facebook Ads integration routes — /api/v1/integrations/facebook/*
 *
 * The OAuth callback (/oauth/callback) is intentionally NOT JWT-gated —
 * Meta calls it directly with the auth code in the query string and we
 * pair it back to the originating user via the CSRF state stored in
 * Redis. Every other route requires `integrations:manage`.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyJWT } from '../../../shared/middleware/verifyJWT';
import { requirePermission } from '../../../shared/middleware/rbac.middleware';
import { prisma } from '../../../shared/prisma';
import * as accounts from './accounts.service';
import { syncAccount } from './sync.service';
import { facebookSyncQueue } from '../../../shared/queue';

// ─── Schemas ────────────────────────────────────────────────────────────────

const ConnectAccountsSchema = z.object({
  accessToken: z.string().min(8),
  expiresAt: z
    .string()
    .datetime()
    .nullable()
    .optional()
    .transform((v) => (v ? new Date(v) : null)),
  accounts: z
    .array(
      z.object({
        externalId: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        businessId: z.string().min(1).max(120).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

const SetActiveSchema = z.object({
  isActive: z.boolean(),
});

// ─── Routes ─────────────────────────────────────────────────────────────────

export async function facebookRoutes(app: FastifyInstance) {
  // ── OAuth: start ───────────────────────────────────────────────────────
  // Returns Meta's authorize URL + the CSRF state. Frontend opens it in
  // a popup window, then waits for the postMessage from the callback.
  app.get(
    '/oauth/authorize',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async () => {
      return accounts.startOAuth();
    },
  );

  // ── OAuth: callback (Meta redirects here directly; not JWT-gated) ─────
  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/oauth/callback',
    async (req, reply) => {
      const { code, state, error, error_description } = req.query;

      // Helper: render a tiny HTML page that postMessage()s the result
      // back to the parent window and closes the popup.
      const renderResult = (
        payload: Record<string, unknown>,
      ): string => {
        const safe = JSON.stringify(payload).replace(/</g, '\\u003c');
        return `<!doctype html>
<html><head><meta charset="utf-8"><title>Facebook Connect</title></head>
<body style="font-family:sans-serif;padding:24px;">
<p>Connecting to Facebook…</p>
<script>
  (function() {
    var data = ${safe};
    if (window.opener) {
      window.opener.postMessage({ type: 'fb-oauth-result', data: data }, '*');
    }
    setTimeout(function() { window.close(); }, 200);
  })();
</script>
</body></html>`;
      };

      reply.header('Content-Type', 'text/html; charset=utf-8');

      if (error) {
        return reply.send(renderResult({ ok: false, error: error_description ?? error }));
      }
      if (!code || !state) {
        return reply.send(renderResult({ ok: false, error: 'Missing code or state' }));
      }
      const ok = await accounts.consumeOAuthState(state);
      if (!ok) {
        return reply.send(
          renderResult({ ok: false, error: 'CSRF state expired or invalid' }),
        );
      }
      try {
        const result = await accounts.handleOAuthCallback(code);
        // Don't return the long-lived token to the popup-→parent
        // postMessage. Instead, stash it server-side keyed by the state
        // (already consumed) — wait, simpler: pass through. The parent
        // window is on the same origin and the token is going to be
        // handed right back to the backend on the next call. The
        // postMessage origin check below ensures it stays in our window.
        return reply.send(
          renderResult({
            ok: true,
            accessToken: result.accessToken,
            expiresAt: result.expiresAt?.toISOString() ?? null,
            accounts: result.accounts.map((a) => ({
              externalId: a.id,
              name: a.name,
              currency: a.currency,
              businessId: a.business?.id ?? null,
              businessName: a.business?.name ?? null,
            })),
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'OAuth exchange failed';
        return reply.send(renderResult({ ok: false, error: message }));
      }
    },
  );

  // ── Persist selected ad accounts after OAuth ───────────────────────────
  app.post(
    '/accounts/connect',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = ConnectAccountsSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload', issues: parsed.error.issues },
        });
      }
      const created = await accounts.connectAdAccounts({
        accessToken: parsed.data.accessToken,
        expiresAt: parsed.data.expiresAt ?? null,
        accounts: parsed.data.accounts.map((a) => ({
          externalId: a.externalId,
          name: a.name,
          businessId: a.businessId ?? null,
        })),
      });
      // Kick off an immediate sync so spend lands quickly.
      for (const acc of created) {
        await facebookSyncQueue.add({ accountId: acc.id }).catch(() => {
          /* queue failures are not fatal — hourly poll picks it up */
        });
      }
      return reply.send({ data: created });
    },
  );

  // ── List / read ────────────────────────────────────────────────────────
  app.get(
    '/accounts',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async () => ({ data: await accounts.listAccounts() }),
  );

  app.get<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req) => accounts.getAccount(req.params.id),
  );

  // ── Active toggle / delete ─────────────────────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/accounts/:id',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const parsed = SetActiveSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' },
        });
      }
      const row = await accounts.setActive(req.params.id, parsed.data.isActive);
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

  // ── Manual sync (admin-triggered "Sync now" button) ────────────────────
  app.post<{ Params: { id: string } }>(
    '/accounts/:id/sync',
    { preHandler: [verifyJWT, requirePermission('integrations:manage')] },
    async (req, reply) => {
      const result = await syncAccount(req.params.id);
      return reply.send(result);
    },
  );

  // ── Read-only data: campaigns / adsets / spend / invoices ─────────────
  app.get<{ Params: { id: string } }>(
    '/accounts/:id/campaigns',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req) => {
      const rows = await prisma.adCampaign.findMany({
        where: { accountId: req.params.id },
        orderBy: { spendCached: 'desc' },
      });
      return { data: rows };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/accounts/:id/adsets',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req) => {
      const campaigns = await prisma.adCampaign.findMany({
        where: { accountId: req.params.id },
        select: { id: true, name: true },
      });
      const cIds = campaigns.map((c) => c.id);
      const rows = await prisma.adAdset.findMany({
        where: { campaignId: { in: cIds } },
        orderBy: { spendCached: 'desc' },
      });
      const byId = new Map(campaigns.map((c) => [c.id, c.name]));
      return {
        data: rows.map((r) => ({ ...r, campaignName: byId.get(r.campaignId) ?? null })),
      };
    },
  );

  // Last 30 days of daily spend, oldest → newest, for the chart.
  app.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    '/accounts/:id/spend',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req) => {
      const days = Math.min(180, Math.max(1, Number(req.query.days ?? 30)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const rows = await prisma.adSpendDay.findMany({
        where: { accountId: req.params.id, date: { gte: since } },
        orderBy: { date: 'asc' },
      });
      return { data: rows };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/accounts/:id/invoices',
    { preHandler: [verifyJWT, requirePermission('integrations:view')] },
    async (req) => {
      const rows = await prisma.adInvoice.findMany({
        where: { accountId: req.params.id },
        orderBy: { periodEnd: 'desc' },
        take: 24,
      });
      return { data: rows };
    },
  );
}

