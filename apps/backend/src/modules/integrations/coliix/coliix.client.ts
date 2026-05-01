/**
 * Coliix HTTP client — POST form-urlencoded to the single seller endpoint.
 *
 * The user's Coliix portal exposes ONE endpoint (`/aga/seller/api-parcels`)
 * with an `action` discriminator. We currently use:
 *   - `action=track`  → fetch the latest state for a tracking code
 *
 * Coliix doesn't expose a "create parcel" API to this account; the agent
 * creates the label inside Coliix's portal and pastes the tracking code
 * back into our CRM. So this client is read-only today.
 *
 * If/when Coliix adds another action (e.g. cancel, history), drop a new
 * function here using the same `postForm` helper — no other code changes.
 */

const TRACK_ENDPOINT_PATH = '/aga/seller/api-parcels';
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Coliix's response envelope, observed from a real account:
 *
 *   success → { "status": true,  "msg": "OK",                "data": { ... } }
 *   error   → { "status": false, "msg": "Colis introuvable" }
 *   error   → { "status": false, "msg": "Token invalide"     }
 *
 * The shape is consistent — only `status` flips. Older docs sometimes
 * showed `status: 200` (a number) so we treat both `true` and `200` as
 * the success signal, and both `false` and any non-200 number as an
 * error. The `msg` field discriminates between a domain error
 * ("not found") and an auth error ("token invalid").
 */
export interface ColiixApiResponse<T = unknown> {
  status: boolean | number;
  msg: string;
  data?: T;
  // Some accounts flatten state / history to the root instead of nesting
  // under data; callers should accept both shapes.
  [k: string]: unknown;
}

function isOkStatus(status: unknown): boolean {
  return status === true || status === 200;
}

export class ColiixApiError extends Error {
  constructor(
    public readonly kind: 'credential' | 'timeout' | 'http' | 'unknown',
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ColiixApiError';
  }
}

async function postForm<T>(
  baseUrl: string,
  body: Record<string, string>,
): Promise<ColiixApiResponse<T>> {
  const url = baseUrl.replace(/\/$/, '') + TRACK_ENDPOINT_PATH;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ColiixApiError('http', `Coliix HTTP ${res.status}`, res.status);
    }
    // Read body as text first so we can surface what Coliix actually
    // sent when it's not the documented JSON envelope. Helps debug
    // accounts where Coliix returns HTML, plain text, or a different
    // schema (different action name etc.).
    const rawText = await res.text();
    let payload: ColiixApiResponse<T> | null = null;
    try {
      payload = rawText ? (JSON.parse(rawText) as ColiixApiResponse<T>) : null;
    } catch {
      payload = null;
    }
    // We accept the response if it has either a `status` or a `msg` —
    // that's enough to distinguish Coliix's documented envelope from
    // an HTML page or a totally empty body.
    const hasEnvelope =
      payload &&
      (typeof payload.status === 'boolean' ||
        typeof payload.status === 'number' ||
        typeof payload.msg === 'string');

    if (!hasEnvelope) {
      const preview = rawText.slice(0, 300).replace(/\s+/g, ' ').trim();
      // HTML body usually means we hit a login / 404 page instead of the
      // API endpoint — the URL is wrong or the account is suspended.
      // Reclassify as `credential` so the operator gets a clearer hint.
      if (/^\s*<(!doctype|html|body)/i.test(rawText)) {
        throw new ColiixApiError(
          'credential',
          'Coliix returned an HTML page — the URL may be wrong or the account is suspended.',
          res.status,
          rawText,
        );
      }
      throw new ColiixApiError(
        'unknown',
        `Malformed Coliix response: ${preview || '(empty body)'}`,
        res.status,
        rawText,
      );
    }

    // Auth failure: status is falsy AND the message looks credential-y.
    // A "Colis introuvable" / "Tracking not found" with status:false is
    // NOT an auth failure — it's a legitimate domain response that
    // means our credentials reached Coliix and were accepted.
    const status = (payload as ColiixApiResponse<T>).status;
    const msg = typeof (payload as ColiixApiResponse<T>).msg === 'string'
      ? ((payload as ColiixApiResponse<T>).msg as string)
      : '';
    if (
      !isOkStatus(status) &&
      /token|cl[ée]|compte|d[ée]sactiv|unauth|forbidden|invalid|expired|not\s*allowed/i.test(msg)
    ) {
      throw new ColiixApiError('credential', msg, typeof status === 'number' ? status : 0, payload);
    }
    return payload as ColiixApiResponse<T>;
  } catch (err) {
    if (err instanceof ColiixApiError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new ColiixApiError('timeout', `Coliix timeout after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw new ColiixApiError(
      'unknown',
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Track a parcel. Returns the latest state Coliix has on file.
 *
 * Coliix's track action returns at minimum a `state` (raw wording) and
 * usually a `history` array of timestamped state changes. The shape can
 * vary between accounts; callers should treat unknown fields as optional.
 */
export interface TrackResult {
  state?: string;
  msg?: string;
  history?: Array<{
    state?: string;
    date?: string;       // sometimes "datereported"
    datereported?: string;
    note?: string;
  }>;
  // Any extra fields Coliix sends — we don't strip unknowns so the
  // raw payload is available downstream for forensics.
  [k: string]: unknown;
}

export async function track(params: {
  baseUrl: string;
  apiKey: string;
  tracking: string;
}): Promise<ColiixApiResponse<TrackResult>> {
  return postForm<TrackResult>(params.baseUrl, {
    action: 'track',
    token: params.apiKey,
    tracking: params.tracking,
  });
}

/**
 * Create a parcel ("add" action). Coliix's seller portal calls this same
 * endpoint when an admin clicks "Add parcel" inside their dashboard.
 *
 * Returns whatever Coliix sends back; the caller picks the tracking
 * code out (`data.tracking` is the documented field, but accounts have
 * been observed to flatten it to `data.code` or `tracking` at the
 * root, so we accept several aliases).
 *
 * Field-name strategy: standard names (full_name, phone, city, etc.)
 * collected from Coliix's portal HTML form names. If your account uses
 * different names, map them here in one place — the rest of the code
 * stays untouched.
 */
export interface AddParcelInput {
  baseUrl: string;
  apiKey: string;
  fullName: string;
  phone: string;
  city: string;
  address: string;
  comment: string | null;
  cod: number;
  goodsLabel: string;
  goodsQty: number;
  // Optional — used by some accounts that distinguish multiple hubs.
  hubLabel?: string;
}

export interface AddParcelData {
  // Aliases observed across accounts. The shipments service picks the
  // first non-empty one.
  tracking?: string;
  trackingCode?: string;
  code?: string;
  ref?: string;
  reference?: string;
  // Some accounts return a label PDF URL.
  labelUrl?: string;
  label_url?: string;
  [k: string]: unknown;
}

export async function addParcel(
  input: AddParcelInput,
): Promise<ColiixApiResponse<AddParcelData>> {
  // Field names match what Coliix's seller portal sends. Confirmed
  // via live API probe — their error response named the missing
  // fields verbatim. Mix of English (name, phone) and French
  // (adresse, ville, marchandise) — keep in sync with the portal.
  // Coliix telegraphs missing fields verbatim in error responses
  // ("name : , phone : , adresse : ") — those three are confirmed.
  // For the rest we pass common aliases together; Coliix ignores
  // unrecognised keys.
  const body: Record<string, string> = {
    action: 'add',
    token: input.apiKey,
    // Confirmed required.
    name: input.fullName,
    phone: input.phone,
    ville: input.city,
    adresse: input.address,
    // Money — try every common alias since Coliix didn't tell us which.
    montant: String(input.cod),
    cod: String(input.cod),
    prix: String(input.cod),
    price: String(input.cod),
    // Goods.
    marchandise: input.goodsLabel,
    produit: input.goodsLabel,
    goods: input.goodsLabel,
    // Quantity.
    quantite: String(input.goodsQty),
    qte: String(input.goodsQty),
    qty: String(input.goodsQty),
    quantity: String(input.goodsQty),
    // Comment.
    commentaire: input.comment ?? '',
    comment: input.comment ?? '',
    note: input.comment ?? '',
  };
  if (input.hubLabel) {
    body.depart = input.hubLabel;
    body.hub = input.hubLabel;
  }
  return postForm<AddParcelData>(input.baseUrl, body);
}

/**
 * Pull the tracking code out of an addParcel response. Returns null if
 * none of the known aliases produced a usable string — the caller treats
 * that as a Coliix-side failure.
 */
export function extractTracking(payload: ColiixApiResponse<AddParcelData>): string | null {
  const data = payload.data ?? {};
  for (const key of ['tracking', 'trackingCode', 'code', 'ref', 'reference'] as const) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  // Coliix sometimes flattens the data fields to the root of the response.
  const root = payload as Record<string, unknown>;
  for (const key of ['tracking', 'trackingCode', 'code', 'ref', 'reference']) {
    const v = root[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Test the API key with a deliberately-bogus tracking code.
 *
 * Reachability is the strongest signal we can collect without burning a
 * real tracking code: if the request reached Coliix and didn't get back
 * a credential-shaped error, the key works. Anything else (malformed
 * body, HTTP 4xx/5xx, timeout) is reported back to the admin verbatim
 * so they know what to fix.
 *
 * The "Malformed Coliix response" case is treated as an `unreachable`
 * outcome rather than a credential failure — Coliix did respond but
 * not in the documented shape, which usually means the URL is right
 * but the API behind it has a different schema for this token. We
 * surface a snippet of the raw body so the admin can spot it.
 */
export interface TestResult {
  ok: boolean;
  reason?: string;
  // Set on "malformed" outcomes — admin can see what Coliix actually
  // returned and decide whether the key works (e.g. an HTML success
  // page from a misrouted endpoint vs a real auth failure).
  rawSample?: string;
}

export async function testCredentials(params: {
  baseUrl: string;
  apiKey: string;
}): Promise<TestResult> {
  try {
    await track({ ...params, tracking: 'CRM-PING-0000' });
    return { ok: true };
  } catch (err) {
    if (err instanceof ColiixApiError) {
      if (err.kind === 'credential') return { ok: false, reason: err.message };
      if (err.kind === 'timeout') return { ok: false, reason: 'Timeout' };
      if (err.kind === 'http') {
        return { ok: false, reason: `HTTP ${err.status} — check the Base URL` };
      }
      if (err.kind === 'unknown') {
        // Coliix replied but the body wasn't the documented envelope.
        // That's not necessarily a credential failure — surface the
        // body sample so the admin can inspect.
        const rawSample =
          typeof err.body === 'string' ? err.body.slice(0, 300) : undefined;
        return { ok: false, reason: err.message, rawSample };
      }
    }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
