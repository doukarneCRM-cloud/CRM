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

  // Coliix reports success/failure via body.status, not HTTP.
  const bodyStatus =
    payload && typeof payload === 'object' && 'status' in payload
      ? Number((payload as { status: unknown }).status)
      : null;
  const bodyMsg = extractMsg(payload);

  if (bodyStatus !== null && bodyStatus !== 200) {
    throw new ColiixError(bodyMsg || `Coliix error (status ${bodyStatus})`, bodyStatus, payload);
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

function extractCurrentState(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Unknown';
  const p = payload as Record<string, unknown>;
  const s = p.state ?? p.status_label ?? p.status ?? (p.data as Record<string, unknown> | undefined)?.state;
  return typeof s === 'string' && s.trim() ? s.trim() : 'Unknown';
}

function extractEvents(payload: unknown): ColiixTrackEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const rawEvents = (p.events ?? p.history ?? (p.data as Record<string, unknown> | undefined)?.events) as unknown;
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents.map((e) => {
    const r = e as Record<string, unknown>;
    return {
      state: typeof r.state === 'string' ? r.state : typeof r.status === 'string' ? r.status : 'Unknown',
      date: typeof r.date === 'string' ? r.date : undefined,
      message: typeof r.message === 'string' ? r.message : undefined,
      driverNote:
        typeof r.driver_note === 'string'
          ? r.driver_note
          : typeof r.driverNote === 'string'
          ? r.driverNote
          : undefined,
    };
  });
}
