/**
 * Coliix V2 HTTP client.
 *
 * Same wire format as V1 (form-urlencoded POST to /aga/seller/api-parcels,
 * `token` in body, body-level `status` for success/failure), but the client
 * is account-scoped: a single backend can talk to multiple hubs (Agadir,
 * Casablanca, …) by passing a different `CarrierAccount` row each time.
 *
 * Errors are normalized to `ColiixV2Error` so the worker can inspect status
 * and message without parsing strings.
 */

import { decryptSecret } from '../../../shared/encryption';

const API_PATH = '/aga/seller/api-parcels';
const PER_CALL_TIMEOUT_MS = 8_000;

export interface CarrierAccountSecrets {
  apiBaseUrl: string;
  apiKey: string; // already-decrypted plaintext
}

export class ColiixV2Error extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = 'ColiixV2Error';
    this.status = status;
    this.payload = payload;
  }
}

export interface PushParcelInput {
  // Embedded in `note` so we can detect double-creates server-side without
  // depending on Coliix exposing an idempotency-key field.
  idempotencyKey: string;
  recipientName: string;
  recipientPhone: string;       // Moroccan format, 10 digits, leading 0
  city: string;                 // ville — must match CarrierCity row
  address: string;
  goodsLabel: string;           // marchandise
  goodsQty: number;
  cod: number;                  // total amount in MAD
  driverNote?: string | null;
}

export interface PushParcelResult {
  tracking: string;
  raw: unknown;
}

export interface TrackEvent {
  state: string;
  occurredAt?: string;          // ISO
  driverNote?: string;
  message?: string;
}

export interface TrackResult {
  tracking: string;
  currentState: string;
  events: TrackEvent[];
  raw: unknown;
}

export interface CityRow {
  ville: string;
  zone: string | null;
}

export interface CitiesResult {
  cities: CityRow[];
  raw: unknown;
}

// ─── Internal: form-urlencoded POST with body-status branching ───────────────

async function postForm(
  account: { apiBaseUrl: string; apiKey: string },
  params: Record<string, string | number>,
): Promise<unknown> {
  const body = new URLSearchParams();
  body.set('token', account.apiKey);
  for (const [k, v] of Object.entries(params)) {
    body.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${account.apiBaseUrl}${API_PATH}`, {
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
      throw new ColiixV2Error(`Coliix request timed out after ${PER_CALL_TIMEOUT_MS}ms`, 0, null);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // non-JSON body — keep null
  }

  if (!res.ok) {
    throw new ColiixV2Error(`Coliix HTTP ${res.status}`, res.status, payload);
  }

  // Coliix multiplexes success/failure on body.status. `add` returns 200 (num),
  // `track` returns true (bool). 204 is the canonical failure code.
  const rawStatus =
    payload && typeof payload === 'object' && 'status' in payload
      ? (payload as { status: unknown }).status
      : null;
  const isSuccess = rawStatus === true || rawStatus === 200 || rawStatus === '200';

  if (rawStatus !== null && !isSuccess) {
    const numericForLog =
      typeof rawStatus === 'number'
        ? rawStatus
        : typeof rawStatus === 'string'
          ? Number(rawStatus) || 0
          : 0;
    throw new ColiixV2Error(
      extractMsg(payload) || `Coliix error (status ${String(rawStatus)})`,
      numericForLog,
      payload,
    );
  }

  return payload;
}

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

// ─── Public — push, track, cities ────────────────────────────────────────────

/**
 * Hand-decrypts the account's API key once per call. Workers fetch the
 * account row, pass it here. We read `apiKey` from a CarrierAccount row
 * (encrypted blob) and decrypt at the seam. Plaintext never logs.
 */
export function decryptAccount(row: { apiBaseUrl: string; apiKey: string }): CarrierAccountSecrets {
  return { apiBaseUrl: row.apiBaseUrl, apiKey: decryptSecret(row.apiKey) };
}

/** Create a parcel; returns the tracking code Coliix assigned. */
export async function pushParcel(
  account: CarrierAccountSecrets,
  input: PushParcelInput,
): Promise<PushParcelResult> {
  // Embed the idempotency key as a tag so duplicate pushes are diagnosable
  // even if Coliix doesn't expose them in their dashboard. Format:
  // "[id:<idem>] <user-note>" — single-line, easy to grep.
  const idemTag = `[id:${input.idempotencyKey}]`;
  const fullNote = input.driverNote
    ? `${idemTag} ${input.driverNote}`.slice(0, 240)
    : idemTag;

  const payload = await postForm(account, {
    action: 'add',
    name: input.recipientName,
    phone: input.recipientPhone,
    marchandise: input.goodsLabel,
    marchandise_qty: input.goodsQty,
    ville: input.city,
    adresse: input.address,
    note: fullNote,
    stock: 0,
    price: input.cod,
  });

  const tracking = extractTracking(payload);
  if (!tracking) {
    throw new ColiixV2Error('Coliix accepted the parcel but returned no tracking code', 200, payload);
  }
  return { tracking, raw: payload };
}

export async function trackParcel(
  account: CarrierAccountSecrets,
  tracking: string,
): Promise<TrackResult> {
  const payload = await postForm(account, { action: 'track', tracking });
  return {
    tracking,
    currentState: extractCurrentState(payload),
    events: extractEvents(payload),
    raw: payload,
  };
}

/**
 * Fetches the carrier's city/zone list. The exact action name isn't
 * documented on the public side; we try the common variants in order and
 * return whichever returns a usable list. Falls through to throw with the
 * best-known error so admins see something diagnosable.
 */
export async function fetchCities(account: CarrierAccountSecrets): Promise<CitiesResult> {
  const candidates: Array<Record<string, string>> = [
    { action: 'cities' },
    { action: 'list_cities' },
    { action: 'villes' },
    { action: 'getCities' },
  ];
  let lastErr: unknown = null;
  for (const params of candidates) {
    try {
      const payload = await postForm(account, params);
      const cities = parseCities(payload);
      if (cities.length > 0) return { cities, raw: payload };
    } catch (err) {
      lastErr = err;
    }
  }
  if (lastErr instanceof Error) throw lastErr;
  throw new ColiixV2Error('Could not fetch cities list — Coliix returned no usable rows', 0, null);
}

/** Cheap auth probe — track a sentinel code. Coliix returns body.status=204
 *  with a token-related message on bad creds; an unknown-tracking error
 *  proves the token works. */
export async function ping(account: CarrierAccountSecrets): Promise<{ ok: boolean; message: string }> {
  try {
    await postForm(account, { action: 'track', tracking: 'CRM-V2-PING-0000' });
    return { ok: true, message: 'Connection OK' };
  } catch (err) {
    if (err instanceof ColiixV2Error) {
      const looksLikeAuth =
        /token|cl(é|e)|compte|d(é|e)sactiv|unauth|forbidden|invalid/i.test(err.message);
      if (looksLikeAuth) return { ok: false, message: err.message };
      // Tracking-not-found means the token works.
      return { ok: true, message: 'Connection OK' };
    }
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Payload shape helpers (lifted from V1, kept resilient) ──────────────────

function extractTracking(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [
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

function rawEventsArray(p: Record<string, unknown>): unknown[] | null {
  if (Array.isArray(p.msg)) return p.msg;
  if (Array.isArray(p.events)) return p.events;
  if (Array.isArray(p.history)) return p.history;
  const data = p.data as Record<string, unknown> | undefined;
  if (data && Array.isArray(data.events)) return data.events;
  return null;
}

const STATE_FIELDS = ['status', 'state', 'colorstatus', 'etat_colis', 'parcel_status', 'state_label', 'status_label'] as const;

function eventStateName(e: unknown): string | null {
  if (!e || typeof e !== 'object') return null;
  const r = e as Record<string, unknown>;
  for (const f of STATE_FIELDS) {
    const v = r[f];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function parseColiixTime(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const cleaned = v.replace(/\s+:/g, ':').trim();
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractCurrentState(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Unknown';
  const p = payload as Record<string, unknown>;
  const events = rawEventsArray(p);
  if (events && events.length > 0) {
    const sorted = [...events].sort((a, b) => {
      const ta = parseColiixTime((a as Record<string, unknown>)?.time)?.getTime() ?? 0;
      const tb = parseColiixTime((b as Record<string, unknown>)?.time)?.getTime() ?? 0;
      return tb - ta;
    });
    for (const evt of sorted) {
      const s = eventStateName(evt);
      if (s) return s;
    }
  }
  const s =
    p.state ??
    p.status_label ??
    (typeof p.status === 'string' ? p.status : null) ??
    (p.data as Record<string, unknown> | undefined)?.state;
  return typeof s === 'string' && s.trim() ? s.trim() : 'Unknown';
}

function extractEvents(payload: unknown): TrackEvent[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const raw = rawEventsArray(p);
  if (!raw) return [];
  const events: TrackEvent[] = raw.map((e) => {
    const r = e as Record<string, unknown>;
    const parsed = parseColiixTime(r.time ?? r.date);
    return {
      state: eventStateName(r) ?? 'Unknown',
      occurredAt: parsed ? parsed.toISOString() : undefined,
      message: typeof r.message === 'string' ? r.message : undefined,
      driverNote:
        typeof r.driver_note === 'string'
          ? r.driver_note
          : typeof r.driverNote === 'string'
            ? r.driverNote
            : undefined,
    };
  });
  events.sort((a, b) => {
    const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
    const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
    return tb - ta;
  });
  return events;
}

function parseCities(payload: unknown): CityRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const p = payload as Record<string, unknown>;
  const candidates: unknown[] = [p.cities, p.villes, p.data, p.msg];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c
        .map((item) => {
          if (typeof item === 'string') return { ville: item.trim(), zone: null };
          if (item && typeof item === 'object') {
            const r = item as Record<string, unknown>;
            const ville =
              (typeof r.ville === 'string' && r.ville.trim()) ||
              (typeof r.city === 'string' && r.city.trim()) ||
              (typeof r.name === 'string' && r.name.trim()) ||
              '';
            const zone =
              (typeof r.zone === 'string' && r.zone.trim()) ||
              (typeof r.region === 'string' && r.region.trim()) ||
              null;
            if (ville) return { ville, zone };
          }
          return null;
        })
        .filter((x): x is CityRow => x !== null);
    }
  }
  return [];
}
