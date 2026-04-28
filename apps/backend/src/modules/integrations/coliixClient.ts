/**
 * Thin HTTP client for the Coliix shipping API.
 *
 * Coliix exposes a single form-urlencoded endpoint that multiplexes actions via
 * an `action` body field ("add" to create, "track" to look up status). The API
 * key is passed as `token` in the body (not a header). HTTP is always 200 on
 * their side — success/failure is signalled by a `status` field in the JSON
 * payload (200 = ok, 204 = error, `msg` holds the reason).
 *
 * All errors are normalized to `ColiixError` so the caller can surface the
 * provider's message in the UI without leaking raw stack traces.
 */

import { getDecryptedApiKey, getOrCreateProvider } from './providers.service';

const API_PATH = '/aga/seller/api-parcels';

export class ColiixError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ColiixError';
    this.status = status;
    this.payload = payload;
  }
}

export interface ColiixParcelInput {
  name: string;
  phone: string;                  // 06XXXXXXXX (Moroccan display form)
  address: string;
  city: string;
  price: number;                  // total COD amount (MAD)
  quantity: number;
  merchandise: string;            // product summary (Coliix field: `marchandise`)
  note?: string;                  // delivery instructions
}

export interface ColiixCreateResult {
  tracking: string;
  raw: unknown;
}

export interface ColiixTrackEvent {
  state: string;                  // e.g. "En cours", "Livre", "Refuse"
  date?: string;
  message?: string;
  driverNote?: string;
}

export interface ColiixTrackResult {
  tracking: string;
  currentState: string;
  events: ColiixTrackEvent[];
  raw: unknown;
}

// Per-call cap. Without this a single slow Coliix response stalls the whole
// sequential refresh sweep (refreshAllInFlight loops orders one by one), and
// the user-facing Sync button times out client-side before any results come
// back. 8 seconds is generous for Coliix's typical ~300–800ms responses.
const PER_CALL_TIMEOUT_MS = 8_000;

async function postForm(params: Record<string, string | number>): Promise<unknown> {
  const provider = await getOrCreateProvider('coliix');
  const apiKey = await getDecryptedApiKey('coliix');

  const body = new URLSearchParams();
  body.set('token', apiKey);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${provider.apiBaseUrl}${API_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ColiixError(`Coliix request timed out after ${PER_CALL_TIMEOUT_MS}ms`, 0, null);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON body — keep null
  }

  if (!res.ok) {
    throw new ColiixError(`Coliix HTTP ${res.status}`, res.status, payload);
  }

  // Coliix reports success/failure via body.status, not HTTP. The API is
  // inconsistent across actions:
  //   - `add` (create parcel)      → status: 200 (number) on success
  //   - `track` (lookup)           → status: true (boolean) on success
  //   - failures                   → status: 204 (number), msg: string
  // Treat both `200`/`"200"` and `true` as success, anything else as error.
  const rawStatus =
    payload && typeof payload === 'object' && 'status' in payload
      ? (payload as { status: unknown }).status
      : null;
  const isSuccess = rawStatus === true || rawStatus === 200 || rawStatus === '200';
  const bodyMsg = extractMsg(payload);

  if (rawStatus !== null && !isSuccess) {
    const numericForLog =
      typeof rawStatus === 'number' ? rawStatus :
      typeof rawStatus === 'string' ? Number(rawStatus) || 0 :
      rawStatus === false ? 0 : 0;
    throw new ColiixError(
      bodyMsg || `Coliix error (status ${String(rawStatus)})`,
      numericForLog,
      payload,
    );
  }

  return payload;
}

// Coliix's error responses sometimes return `msg` as an array of validation
// objects (e.g. `[{ field: "tracking", message: "..." }, ...]`) rather than a
// string. The naive `String(msg)` collapses that to "[object Object],..." and
// destroys the actual error text — which is exactly what made every Sync row
// show "[object Object]" with no indication of why the call failed.
function extractMsg(payload: unknown): string {
  if (!payload || typeof payload !== 'object' || !('msg' in payload)) return '';
  const msg = (payload as { msg: unknown }).msg;
  if (msg == null) return '';
  if (typeof msg === 'string') return msg;
  if (Array.isArray(msg)) {
    return msg
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          // Pick the most common message-bearing fields, fall back to JSON so
          // nothing is silently lost.
          return String(o.message ?? o.msg ?? o.error ?? o.detail ?? JSON.stringify(item));
        }
        return String(item);
      })
      .join('; ');
  }
  if (typeof msg === 'object') {
    const o = msg as Record<string, unknown>;
    return String(o.message ?? o.msg ?? o.error ?? o.detail ?? JSON.stringify(msg));
  }
  return String(msg);
}

/** Create a new parcel. Returns the tracking code assigned by Coliix. */
export async function createParcel(input: ColiixParcelInput): Promise<ColiixCreateResult> {
  const payload = await postForm({
    action: 'add',
    name: input.name,
    phone: input.phone,
    marchandise: input.merchandise,
    marchandise_qty: input.quantity,
    ville: input.city,
    adresse: input.address,
    note: input.note?.trim() ?? '',
    stock: 0, // we don't sync Coliix's stock feature — prices are CRBT (COD) only
    price: input.price,
  });

  const tracking = extractTracking(payload);
  if (!tracking) {
    throw new ColiixError('Coliix accepted the parcel but returned no tracking code', 200, payload);
  }
  return { tracking, raw: payload };
}

/** Look up current state + event history for a tracking code. */
export async function trackParcel(tracking: string): Promise<ColiixTrackResult> {
  const payload = await postForm({ action: 'track', tracking });
  return {
    tracking,
    currentState: extractCurrentState(payload),
    events: extractEvents(payload),
    raw: payload,
  };
}

// ── Payload shape helpers ────────────────────────────────────────────────────
// Coliix's exact response fields aren't fully documented, so we probe common
// shapes rather than hard-binding to one. The fallbacks keep us functional even
// if Coliix tweaks their response format.

function extractTracking(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidates = [
    p.tracking,
    p.tracking_code,
    p.trackingCode,
    (p.data as Record<string, unknown> | undefined)?.tracking,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

// Coliix's track response stuffs the events history into `msg` (an array
// of objects with `status` + `time`), not into `events` / `history`. Detect
// this shape first; fall back to the legacy field names for safety.
function rawEventsArray(p: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(p.msg)) return p.msg;
  if (Array.isArray(p.events)) return p.events;
  if (Array.isArray(p.history)) return p.history;
  const data = p.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.events)) return data.events;
  return null;
}

// Pluck the parcel-state name from one event object. Coliix uses `status`
// for the parcel state name (e.g. "Nouveau Colis", "Attente De Ramassage")
// and `etat` for the payment state ("Non Payé"). For terminal events
// like "Livré" their dashboard shows the state next to the payment row,
// and we've seen the state arrive under a few different field names
// across endpoints / payment states. Walk the common candidates so a
// missing `status` doesn't make us fall through and emit "Unknown" for
// an order that genuinely just got delivered.
const STATE_FIELD_CANDIDATES = [
  'status',
  'state',
  'colorstatus',
  'etat_colis',
  'parcel_status',
  'state_label',
  'status_label',
] as const;
function eventStateName(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const r = e as Record<string, unknown>;
  for (const field of STATE_FIELD_CANDIDATES) {
    const v = r[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

// Coliix's `time` field arrives as "YYYY-MM-DD HH:MM :SS" — note the space
// before the seconds colon, which `new Date()` rejects. Strip the offending
// space so we can parse it. Returns null on any other malformed input.
function parseColiixTime(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.replace(/\s+:/g, ':').trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractCurrentState(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Unknown';
  const p = payload as Record<string, unknown>;

  // Coliix track returns the events array in `msg`. The latest event is the
  // current state. Sort by `time` descending so we don't depend on Coliix's
  // ordering (which we've observed as oldest-first, but contracts are not
  // guaranteed). Fall back to last-in-array when times are missing.
  const events = rawEventsArray(p);
  if (events && events.length > 0) {
    const sorted = [...events].sort((a, b) => {
      const ta = parseColiixTime((a as Record<string, unknown>)?.time)?.getTime() ?? 0;
      const tb = parseColiixTime((b as Record<string, unknown>)?.time)?.getTime() ?? 0;
      return tb - ta;
    });
    // Walk the sorted array so a single event with a missing state field
    // (we've observed this happen for terminal "Livré" events on some
    // accounts) doesn't make us bail to the legacy fallback and return
    // "Unknown". The original code returned only on sorted[0]; if that
    // one event lacked a parseable state, every later, well-formed event
    // was ignored.
    for (const evt of sorted) {
      const state = eventStateName(evt);
      if (state) return state;
    }
  }

  // Legacy/alternate top-level shapes — keep these so other Coliix endpoints
  // (or future API drift) don't break us.
  const s =
    p.state ??
    p.status_label ??
    (typeof p.status === 'string' ? p.status : null) ??
    (p.data as Record<string, unknown> | undefined)?.state;
  return typeof s === 'string' && s.trim() ? s.trim() : 'Unknown';
}

function extractEvents(payload: unknown): ColiixTrackEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const raw = rawEventsArray(p);
  if (!raw) return [];
  const events = raw.map((e) => {
    const r = e as Record<string, unknown>;
    const parsed = parseColiixTime(r.time ?? r.date);
    return {
      state: eventStateName(r) ?? 'Unknown',
      date: parsed ? parsed.toISOString() : undefined,
      message: typeof r.message === 'string' ? r.message : undefined,
      driverNote:
        typeof r.driver_note === 'string'
          ? r.driver_note
          : typeof r.driverNote === 'string'
          ? r.driverNote
          : undefined,
    };
  });
  // Sort newest-first so callers (trackers, diagnostic table) can read
  // events[0] as "the latest event" without re-sorting. Coliix's actual
  // order is undocumented; sorting here is the contract.
  events.sort((a, b) => {
    const ta = a.date ? new Date(a.date).getTime() : 0;
    const tb = b.date ? new Date(b.date).getTime() : 0;
    return tb - ta;
  });
  return events;
}
