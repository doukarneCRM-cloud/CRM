/**
 * Webhook receiver — handles GET and POST `/coliix/webhook/:secret`.
 *
 * Designed to respond in <50ms so Coliix doesn't think the call failed
 * and start retrying. The work flow is:
 *
 *   1. Constant-time secret match → 404 if invalid (don't reveal which
 *      part is wrong).
 *   2. Parse code/state/datereported/note from query OR body (POST forms).
 *   3. Validate non-empty tracking + state → 400 if missing.
 *   4. Dedupe via Redis NX SET (24h TTL) — returns 200 silently on
 *      replay so Coliix marks the call as delivered.
 *   5. Enqueue Bull job → return 200 immediately. The ingest worker
 *      handles the slow DB writes + socket fan-out.
 *
 * Every failure path writes a ColiixIntegrationError row so the Errors
 * tab in the UI surfaces what went wrong instead of silently 4xxing.
 */

import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { redis } from '../../../shared/redis';
import { coliixIngestQueue } from '../../../shared/queue';
import * as accounts from './accounts.service';
import { logError } from './errors.service';

const DEDUPE_TTL_SECONDS = 86_400; // 24h

function maskSecret(s: string): string {
  if (s.length < 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-2)}`;
}

function pickField(source: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = source[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function dedupeHashFor(tracking: string, state: string, dateReported: string): string {
  return crypto.createHash('sha256').update(`${tracking}|${state}|${dateReported}`).digest('hex');
}

export function registerWebhookRoutes(app: FastifyInstance) {
  // Both GET and POST — Coliix's docs say GET, but some accounts forward
  // form-urlencoded POST. Same handler for both; merges query + body.
  const handler = async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { secret: string };
    const secret = params.secret;

    // ── 1. Secret check ──────────────────────────────────────────────
    const account = await accounts.findAccountBySecret(secret);
    if (!account) {
      app.log.warn(
        { secretMasked: maskSecret(secret), ip: req.ip, method: req.method },
        '[coliix-webhook] rejected — secret does not match any active account',
      );
      await logError({
        type: 'webhook_invalid_secret',
        message: 'Webhook called with an invalid or inactive secret',
        meta: { secretMasked: maskSecret(secret), ip: req.ip, method: req.method },
      });
      return reply.status(404).send({ error: 'Invalid webhook secret' });
    }

    // ── 2. Parse fields (query first; POST body wins) ───────────────
    const source: Record<string, unknown> = {
      ...((req.query as Record<string, unknown>) ?? {}),
      ...((req.body as Record<string, unknown>) ?? {}),
    };
    const tracking = pickField(source, ['code', 'tracking', 'tracking_code', 'trackingCode', 'ref']);
    const rawState = pickField(source, ['state', 'status', 'new_state']);
    const dateReportedRaw = pickField(source, ['datereported', 'date', 'event_date']);
    const note = pickField(source, ['note', 'driver_note', 'comment']) || null;

    // ── 3. Validation ────────────────────────────────────────────────
    if (!tracking || !rawState) {
      app.log.warn(
        {
          parsedTracking: tracking || null,
          parsedRawState: rawState || null,
          payloadKeys: Object.keys(source),
        },
        '[coliix-webhook] missing tracking or state',
      );
      await logError({
        type: 'webhook_invalid_payload',
        message: `Missing tracking or state — payload keys: ${Object.keys(source).join(', ') || '(empty)'}`,
        accountId: account.id,
        meta: { source, parsedTracking: tracking, parsedRawState: rawState },
      });
      return reply.status(400).send({
        error: 'Missing tracking or state',
        hint:
          'Send tracking + state in JSON body, query string, or form-urlencoded. ' +
          'Accepted aliases: code|tracking|tracking_code|trackingCode|ref AND state|status|new_state.',
        payloadKeys: Object.keys(source),
      });
    }

    // ── 4. Dedupe (Redis NX SET) ─────────────────────────────────────
    // Same tracking|state|date arriving twice → respond 200 silently.
    // dateReported is part of the key so two genuine state changes for
    // the same code at different timestamps both get processed.
    const dedupeHash = dedupeHashFor(tracking, rawState, dateReportedRaw || '');
    const novel = await redis
      .set(`coliix:dedupe:${dedupeHash}`, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX')
      .catch((err: unknown) => {
        // If Redis is unreachable, fail safe by enqueueing the event —
        // the DB unique constraint on (shipmentId, dedupeHash) is the
        // ultimate guard.
        app.log.warn({ err }, '[coliix-webhook] redis dedupe SET failed; falling through');
        return 'OK';
      });
    if (novel !== 'OK') {
      return reply.status(200).send({ received: true, duplicate: true });
    }

    // ── 5. Enqueue + respond ─────────────────────────────────────────
    await coliixIngestQueue.add({
      accountId: account.id,
      tracking,
      rawState,
      driverNote: note,
      eventDateIso: dateReportedRaw || null,
      dedupeHash,
      payload: source,
    });

    return reply.status(200).send({ received: true });
  };

  app.get('/webhook/:secret', handler);
  app.post('/webhook/:secret', handler);
}
