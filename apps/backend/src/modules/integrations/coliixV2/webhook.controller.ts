/**
 * Coliix V2 webhook entrypoint. Designed for <50 ms p99: parse → audit →
 * dedupe → enqueue → respond. The actual mapping + DB diff is async (see
 * ingest.worker.ts).
 *
 * Auth model:
 *   - Path segment: /webhook/{accountId}/{webhookSecret}
 *   - Constant-time secret compare
 *   - Optional Redis NX dedupe (24 h TTL) by sha256(code|state|datereported)
 *
 * Field aliases match V1 — Coliix's docs vary in the wild.
 */

import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../../../shared/prisma';
import { redis } from '../../../shared/redis';
import { coliixV2IngestQueue } from '../../../shared/queue';

const DEDUPE_TTL_SECONDS = 24 * 60 * 60;

function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function buildDedupeKey(accountId: string, tracking: string, state: string, dateIso: string | null): string {
  const hash = crypto
    .createHash('sha256')
    .update(`${accountId}|${tracking}|${state}|${dateIso ?? ''}`)
    .digest('hex');
  return `coliixv2:dedupe:${hash}`;
}

export async function coliixV2WebhookHandler(req: FastifyRequest, reply: FastifyReply) {
  const params = req.params as { accountId: string; secret: string };
  const source = {
    ...((req.query as Record<string, unknown> | undefined) ?? {}),
    ...((req.body as Record<string, unknown> | undefined) ?? {}),
  } as Record<string, unknown>;

  const tracking = String(
    source.code ??
      source.tracking ??
      source.tracking_code ??
      source.trackingCode ??
      source.ref ??
      '',
  ).trim();
  const rawState = String(source.state ?? source.status ?? source.new_state ?? '').trim();
  const driverNote =
    typeof source.note === 'string'
      ? source.note
      : typeof source.driver_note === 'string'
        ? source.driver_note
        : typeof source.comment === 'string'
          ? source.comment
          : null;
  const eventDateStr =
    typeof source.datereported === 'string'
      ? source.datereported
      : typeof source.date === 'string'
        ? source.date
        : typeof source.event_date === 'string'
          ? source.event_date
          : null;
  const eventDate = eventDateStr ? new Date(eventDateStr) : null;
  const eventDateIso = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate.toISOString() : null;

  // Audit-log every hit BEFORE branching, mirroring V1. Reuses the existing
  // WebhookEventLog table with provider="coliix_v2" so V1/V2 share the
  // observability surface.
  const recordEvent = (ok: boolean, statusCode: number, secretMatched: boolean, reason: string | null) => {
    void prisma.webhookEventLog
      .create({
        data: {
          provider: 'coliix_v2',
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
      .catch(() => {
        // Silent — never let an audit write fail the webhook itself.
      });
  };

  // Account lookup
  const account = await prisma.carrierAccount.findUnique({
    where: { id: params.accountId },
    select: { id: true, webhookSecret: true, isActive: true },
  });
  if (!account) {
    recordEvent(false, 404, false, 'Unknown carrier account');
    return reply.status(404).send({ error: 'Unknown carrier account' });
  }
  if (!constantTimeEq(account.webhookSecret, params.secret ?? '')) {
    recordEvent(false, 404, false, 'Invalid webhook secret');
    return reply.status(404).send({ error: 'Invalid webhook secret' });
  }
  if (!account.isActive) {
    recordEvent(true, 200, true, 'Account disabled — accepted but not ingested');
    return reply.status(200).send({ ignored: true, reason: 'account_disabled' });
  }

  if (!tracking || !rawState) {
    recordEvent(
      false,
      400,
      true,
      `Missing tracking or state — payload keys: ${Object.keys(source).join(', ') || '(empty)'}`,
    );
    return reply.status(400).send({
      error: 'Missing tracking or state',
      hint: 'Send tracking + state. Accepted aliases: code|tracking|tracking_code|trackingCode|ref AND state|status|new_state.',
      payloadKeys: Object.keys(source),
    });
  }

  // Replay guard. If Redis is unreachable we DO NOT reject — the DB unique
  // constraint on (shipmentId, dedupeHash) is the second line of defence.
  try {
    const key = buildDedupeKey(account.id, tracking, rawState, eventDateIso);
    const setRes = await redis.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
    if (setRes === null) {
      recordEvent(true, 200, true, 'Replay swallowed by dedupe key');
      return reply.status(200).send({ deduped: true });
    }
  } catch (err) {
    // Redis hiccup — log and fall through, DB constraint will catch real dupes.
    req.log.warn({ err }, '[coliix-v2:webhook] redis dedupe failed; falling through');
  }

  // Enqueue the heavy work. We respond immediately.
  coliixV2IngestQueue
    .add(
      {
        accountId: account.id,
        tracking,
        rawState,
        driverNote,
        eventDateIso,
        payload: source,
      },
      { attempts: 5, backoff: { type: 'exponential', delay: 5_000 } },
    )
    .catch((err) => {
      req.log.error({ err }, '[coliix-v2:webhook] enqueue failed');
    });

  recordEvent(true, 200, true, 'Enqueued');
  return reply.status(200).send({ received: true });
}
