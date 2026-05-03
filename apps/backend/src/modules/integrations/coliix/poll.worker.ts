/**
 * Coliix polling fallback — 60s repeating tick.
 *
 * Webhooks are the primary path. This worker exists so a single dropped
 * webhook (network blip, Coliix outage, the operator missed pasting our
 * webhook URL into Coliix on day 1) doesn't strand a parcel forever. It
 * picks up shipments whose `nextPollAt` is in the past + non-terminal
 * state, calls Coliix's track API for each, and feeds the response into
 * the same `ingestEvent` pipeline the webhook handler uses — so the
 * shipment update path is identical and well-tested.
 *
 * Cadence is adaptive: `events.service.nextPollFor()` writes a fresh
 * `nextPollAt` per state on every ingest. A shipment in `out_for_delivery`
 * polls every 10 minutes; a `picked_up` parcel every 30 minutes; a
 * `reported` parcel every 4 hours. Terminal states clear `nextPollAt`
 * outright so this worker skips them.
 */

import crypto from 'node:crypto';
import { coliixPollQueue, type ColiixPollTickJobData } from '../../../shared/queue';
import { prisma } from '../../../shared/prisma';
import { ingestEvent } from './events.service';
import { track, ColiixApiError, type TrackResult } from './coliix.client';
import { getDecryptedApiKey } from './accounts.service';
import { logError } from './errors.service';

const POLL_BATCH_SIZE = 50;
// Tick every 30s. Combined with pushed-state cadence of 60s and an
// initial nextPollAt of 30s after shipment creation, the worst-case
// delay between push and "Nouveau Colis" appearing in the timeline
// drops from ~6 min to ~30-60s — small enough that the operator can
// create the label in Coliix UI without us missing the intermediate
// state. Webhooks remain the instant path; this is fallback only.
const POLL_TICK_INTERVAL_MS = 30_000;
// Cooldown after a per-shipment failure so we don't hammer Coliix when
// their API is throwing. Reset to the adaptive cadence as soon as we
// successfully ingest an event for that shipment again.
const POLL_BACKOFF_MS = 5 * 60_000;

function dedupeHashFor(tracking: string, state: string, dateReported: string): string {
  return crypto.createHash('sha256').update(`${tracking}|${state}|${dateReported}`).digest('hex');
}

// Pull (state, datereported, note) from whatever shape Coliix returned.
//
// Live probe shows Coliix returns:
//   { status: true, msg: [ {status, etat, time, code, ...}, ... ], tracking }
//
// `msg` is a chronological history array (yes, the field is named "msg"
// not "history"). Each entry's `status` field is the human wording (with
// trailing whitespace, hence the trim). `time` is "YYYY-MM-DD HH:MM :SS"
// with a stray space before the seconds — we normalise it.
//
// Older accounts reportedly use the documented `history` + `state` shape
// — we still accept those so the parser doesn't break if Coliix updates
// their API later.
interface ParsedTrack {
  state: string;
  datereported: string | null;
  note: string | null;
}

interface ColiixHistoryEntry {
  status?: string;
  state?: string;
  etat?: string;
  time?: string;
  date?: string;
  datereported?: string;
  note?: string;
  comment?: string;
  driverNote?: string;
}

// Coliix's "time" field has the form "2026-04-30 21:41 :30" — extra
// space before seconds. Convert to a JS-parseable ISO-like string.
function normaliseColiixTime(s: string): string {
  return s.replace(/\s+:/, ':');
}

// Unused now — parseAllTrackEntries iterates every entry. Kept commented
// out as a reference: Coliix delivers chronological order (oldest → newest)
// so list[list.length - 1] would be the latest if a single-entry path ever
// becomes useful again.
// @ts-expect-error - retained for documentation, not in current code path.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _pickLatest_unused(list: ColiixHistoryEntry[]): ColiixHistoryEntry | null {
  if (list.length === 0) return null;
  let latest = list[list.length - 1];
  let latestT = -Infinity;
  for (const entry of list) {
    const t = entry.time ?? entry.date ?? entry.datereported;
    if (typeof t !== 'string') continue;
    const parsed = Date.parse(normaliseColiixTime(t));
    if (Number.isFinite(parsed) && parsed > latestT) {
      latest = entry;
      latestT = parsed;
    }
  }
  return latest;
}

function entryToParsed(entry: ColiixHistoryEntry): ParsedTrack | null {
  // Pick the wording field — Coliix's primary one is `status`; older
  // shape used `state`.
  const wording =
    (typeof entry.status === 'string' && entry.status.trim()) ||
    (typeof entry.state === 'string' && entry.state.trim());
  if (!wording) return null;
  const rawTime = entry.time ?? entry.date ?? entry.datereported;
  return {
    state: wording,
    datereported: typeof rawTime === 'string' ? normaliseColiixTime(rawTime) : null,
    note:
      (typeof entry.note === 'string' && entry.note) ||
      (typeof entry.comment === 'string' && entry.comment) ||
      (typeof entry.driverNote === 'string' && entry.driverNote) ||
      null,
  };
}

// Parse EVERY history entry Coliix returned, in chronological order, so
// the polling worker can ingest each one — not just the latest. Gives a
// complete timeline even when several states elapse between two polls.
function parseAllTrackEntries(
  body: TrackResult | undefined | null,
  envelope?: Record<string, unknown>,
): ParsedTrack[] {
  const out: ParsedTrack[] = [];
  const collect = (list: ColiixHistoryEntry[]) => {
    for (const entry of list) {
      const p = entryToParsed(entry);
      if (p) out.push(p);
    }
  };
  const msgFromEnvelope = envelope && Array.isArray(envelope.msg) ? envelope.msg : null;
  if (msgFromEnvelope) collect(msgFromEnvelope as ColiixHistoryEntry[]);
  if (out.length === 0 && body) {
    const history = Array.isArray(body.history) ? (body.history as ColiixHistoryEntry[]) : null;
    if (history) collect(history);
  }
  return out;
}

// Old single-entry parser removed — parseAllTrackEntries above replaces it.
// Both webhook + poll paths now ingest every history entry returned and
// rely on the dedupe hash to avoid double-inserting events we already saw.

function errorTypeFor(err: unknown): 'api_credential_invalid' | 'api_timeout' | 'api_unknown' {
  if (err instanceof ColiixApiError) {
    if (err.kind === 'credential') return 'api_credential_invalid';
    if (err.kind === 'timeout') return 'api_timeout';
  }
  return 'api_unknown';
}

// ─── Worker ─────────────────────────────────────────────────────────────────

coliixPollQueue.process(1, async (_job) => {
  const due = await prisma.shipment.findMany({
    where: {
      nextPollAt: { lte: new Date() },
      state: { notIn: ['delivered', 'returned', 'pending'] },
    },
    take: POLL_BATCH_SIZE,
    select: {
      id: true,
      trackingCode: true,
      accountId: true,
      account: { select: { apiBaseUrl: true } },
    },
  });

  if (due.length === 0) {
    return { polled: 0, errors: 0 };
  }

  // Group by accountId so we decrypt the API key once per hub. Per-call
  // decrypts add up — 50 shipments × 50µs each is negligible, but the
  // grouping also lets us short-circuit a whole hub if its credentials
  // are bad.
  const byAccount = new Map<string, typeof due>();
  for (const s of due) {
    if (!byAccount.has(s.accountId)) byAccount.set(s.accountId, []);
    byAccount.get(s.accountId)!.push(s);
  }

  let polled = 0;
  let errors = 0;

  for (const [accountId, shipments] of byAccount) {
    let apiKey: string;
    try {
      apiKey = await getDecryptedApiKey(accountId);
    } catch (err) {
      // Account may have been deleted between scheduling and running —
      // drop the shipments' nextPollAt to null so we stop polling them.
      await prisma.shipment.updateMany({
        where: { id: { in: shipments.map((s) => s.id) } },
        data: { nextPollAt: null },
      });
      errors += shipments.length;
      continue;
    }

    for (const s of shipments) {
      try {
        const response = await track({
          baseUrl: s.account.apiBaseUrl,
          apiKey,
          tracking: s.trackingCode,
        });
        // Ingest EVERY history entry Coliix returned, not just the latest.
        // The dedupe hash on each (tracking|state|date) makes re-ingest a
        // no-op for entries we've already saved, so this is idempotent.
        // Without this loop, two state transitions between polls would
        // skip the intermediate one — e.g. picked_up → out_for_delivery
        // would never appear because only out_for_delivery is the latest.
        const all = parseAllTrackEntries(
          response.data as TrackResult | undefined,
          response as unknown as Record<string, unknown>,
        );
        if (all.length === 0) {
          await prisma.shipment.update({
            where: { id: s.id },
            data: {
              lastPolledAt: new Date(),
              nextPollAt: new Date(Date.now() + POLL_BACKOFF_MS),
            },
          });
          continue;
        }

        for (const parsed of all) {
          await ingestEvent({
            source: 'poll',
            tracking: s.trackingCode,
            rawState: parsed.state,
            driverNote: parsed.note,
            eventDate: parsed.datereported ? new Date(parsed.datereported) : null,
            dedupeHash: dedupeHashFor(s.trackingCode, parsed.state, parsed.datereported ?? ''),
            payload: response.data ?? {},
          });
        }
        polled++;
      } catch (err) {
        errors++;
        await logError({
          type: errorTypeFor(err),
          message: err instanceof Error ? err.message : String(err),
          shipmentId: s.id,
          accountId,
          meta: { tracking: s.trackingCode },
        });
        // Push the next poll out so we don't hammer a misbehaving account.
        await prisma.shipment.update({
          where: { id: s.id },
          data: {
            lastPolledAt: new Date(),
            nextPollAt: new Date(Date.now() + POLL_BACKOFF_MS),
          },
        });
      }
    }
  }

  return { polled, errors, due: due.length };
});

coliixPollQueue.on('failed', (job, err) => {
  console.error(`[coliix:poll] tick ${job.id} failed`, err);
});

// ─── Bootstrap ──────────────────────────────────────────────────────────────
// Called from index.ts after the HTTP server starts. Replaces any previous
// repeatable job so a hot reload doesn't end up with N parallel pollers.

export async function startColiixPoller(): Promise<void> {
  const repeatable = await coliixPollQueue.getRepeatableJobs();
  for (const j of repeatable) {
    await coliixPollQueue.removeRepeatableByKey(j.key);
  }
  await coliixPollQueue.add({} as ColiixPollTickJobData, {
    repeat: { every: POLL_TICK_INTERVAL_MS },
    // Keep only the latest tick so the metadata table doesn't grow.
    removeOnComplete: 1,
    removeOnFail: 5,
  });
}
