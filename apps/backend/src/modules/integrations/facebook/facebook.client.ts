/**
 * Meta Graph API client — OAuth + Marketing API + Business Manager API.
 *
 * App credentials (FB_APP_ID / FB_APP_SECRET) live in env vars; per-account
 * long-lived user tokens live in AdAccount.accessToken (AES-256-GCM
 * encrypted at rest via shared/encryption).
 *
 * Token lifecycle (per Meta's docs):
 *   1. OAuth dialog redirects with `code`
 *   2. Exchange code → short-lived token (~1h)
 *   3. Exchange short-lived → long-lived token (~60 days)
 *   4. Re-exchange long-lived for another long-lived before it expires
 *
 * The sync layer calls refreshTokenIfNeeded() before each request — same
 * pattern as the YouCan client.
 */

const GRAPH_API = 'https://graph.facebook.com';
const GRAPH_VERSION = process.env.FB_GRAPH_VERSION ?? 'v21.0';

export class FacebookApiError extends Error {
  code: string;
  statusCode: number;
  raw?: unknown;
  constructor(message: string, code: string, statusCode = 500, raw?: unknown) {
    super(message);
    this.name = 'FacebookApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.raw = raw;
  }
}

// ─── App credentials & auth URLs ────────────────────────────────────────────

export function getAppCredentials() {
  const clientId = process.env.FB_APP_ID;
  const clientSecret = process.env.FB_APP_SECRET;
  if (!clientId || !clientSecret) {
    throw new FacebookApiError(
      'Facebook app credentials missing — set FB_APP_ID and FB_APP_SECRET in .env',
      'MISSING_APP_CREDENTIALS',
    );
  }
  return { clientId, clientSecret };
}

export function getRedirectUri(): string {
  // Default to the backend domain since Meta does the round-trip there;
  // the backend then closes the popup with a postMessage so the frontend
  // never holds the auth code itself.
  return (
    process.env.FB_REDIRECT_URI ??
    `${process.env.BACKEND_URL ?? 'http://localhost:3001'}/api/v1/integrations/facebook/oauth/callback`
  );
}

// Scopes we ask for — the minimum to read campaigns/adsets/spend and
// (optionally) business invoices. `email` is included so the consent
// dialog shows a friendly account name; not used by us beyond display.
const OAUTH_SCOPES = ['ads_read', 'business_management', 'read_insights', 'email'];

export function buildAuthorizeUrl(state: string): string {
  const { clientId } = getAppCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(),
    state,
    scope: OAUTH_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

// ─── OAuth token exchange ───────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number; // seconds
}

async function fbFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
  init?: RequestInit,
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) qs.set(k, String(v));
  }
  const url = `${GRAPH_API}/${GRAPH_VERSION}${path}?${qs.toString()}`;
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: number; type?: string } })?.error;
    const isAuth = res.status === 401 || err?.type === 'OAuthException';
    throw new FacebookApiError(
      err?.message ?? `HTTP ${res.status}`,
      isAuth ? 'AUTH_FAILED' : 'API_ERROR',
      res.status,
      body,
    );
  }
  return body as T;
}

export async function exchangeCodeForToken(code: string): Promise<{
  accessToken: string;
  expiresAt: Date | null;
}> {
  const { clientId, clientSecret } = getAppCredentials();
  const res = await fbFetch<TokenResponse>('/oauth/access_token', {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: getRedirectUri(),
    code,
  });
  // Short-lived → long-lived (~60 days) so we don't have to refresh hourly.
  const long = await exchangeForLongLivedToken(res.access_token);
  return long;
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<{
  accessToken: string;
  expiresAt: Date | null;
}> {
  const { clientId, clientSecret } = getAppCredentials();
  const res = await fbFetch<TokenResponse>('/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  });
  const expiresAt = res.expires_in ? new Date(Date.now() + res.expires_in * 1000) : null;
  return { accessToken: res.access_token, expiresAt };
}

// ─── Marketing API — read-only ──────────────────────────────────────────────

export interface FbAdAccount {
  id: string; // act_<id>
  account_id: string; // <id>
  name: string;
  currency: string;
  timezone_name: string;
  account_status: number; // 1 = active
  business?: { id: string; name: string };
}

export async function listMyAdAccounts(accessToken: string): Promise<FbAdAccount[]> {
  const res = await fbFetch<{ data: FbAdAccount[] }>('/me/adaccounts', {
    access_token: accessToken,
    fields: 'id,account_id,name,currency,timezone_name,account_status,business',
    limit: 100,
  });
  return res.data ?? [];
}

export interface FbInsight {
  spend: string; // Meta returns numeric strings for monetary fields
  date_start: string;
  date_stop: string;
  account_currency?: string;
}

/**
 * Daily spend for an ad account between [since, until] inclusive.
 * Meta's `time_range` requires YYYY-MM-DD and returns one row per day
 * when `time_increment` is 1.
 */
export async function fetchAccountInsights(
  accessToken: string,
  adAccountId: string,
  since: string,
  until: string,
): Promise<FbInsight[]> {
  const res = await fbFetch<{ data: FbInsight[] }>(`/${adAccountId}/insights`, {
    access_token: accessToken,
    fields: 'spend,date_start,date_stop,account_currency',
    time_range: JSON.stringify({ since, until }),
    time_increment: 1,
    level: 'account',
  });
  return res.data ?? [];
}

export interface FbCampaign {
  id: string;
  name: string;
  status: string; // ACTIVE | PAUSED | ARCHIVED | DELETED
}

export async function fetchCampaigns(
  accessToken: string,
  adAccountId: string,
): Promise<FbCampaign[]> {
  const res = await fbFetch<{ data: FbCampaign[] }>(`/${adAccountId}/campaigns`, {
    access_token: accessToken,
    fields: 'id,name,status',
    limit: 200,
  });
  return res.data ?? [];
}

export interface FbAdset {
  id: string;
  name: string;
  status: string;
  campaign_id: string;
}

export async function fetchAdsets(
  accessToken: string,
  adAccountId: string,
): Promise<FbAdset[]> {
  const res = await fbFetch<{ data: FbAdset[] }>(`/${adAccountId}/adsets`, {
    access_token: accessToken,
    fields: 'id,name,status,campaign_id',
    limit: 500,
  });
  return res.data ?? [];
}

// Per-campaign spend over the last 7 days — used to populate spendCached
// on AdCampaign rows so the table renders without a per-row API call.
export interface FbCampaignSpend {
  campaign_id: string;
  spend: string;
}

export async function fetchCampaignSpend7d(
  accessToken: string,
  adAccountId: string,
): Promise<FbCampaignSpend[]> {
  const res = await fbFetch<{ data: FbCampaignSpend[] }>(`/${adAccountId}/insights`, {
    access_token: accessToken,
    fields: 'campaign_id,spend',
    date_preset: 'last_7d',
    level: 'campaign',
    limit: 500,
  });
  return res.data ?? [];
}

export async function fetchAdsetSpend7d(
  accessToken: string,
  adAccountId: string,
): Promise<Array<{ adset_id: string; spend: string }>> {
  const res = await fbFetch<{ data: Array<{ adset_id: string; spend: string }> }>(
    `/${adAccountId}/insights`,
    {
      access_token: accessToken,
      fields: 'adset_id,spend',
      date_preset: 'last_7d',
      level: 'adset',
      limit: 1000,
    },
  );
  return res.data ?? [];
}

// ─── Business Manager — invoices ────────────────────────────────────────────
// Invoices live at the business level, not the ad account level. Requires
// `business_management` scope and the user must be an admin of the
// business in question.

export interface FbBusinessInvoice {
  id: string;
  billing_period: string; // "YYYY-MM"
  due_date?: string;
  payment_status: string; // "paid" | "due" | "overdue"
  amount_due?: { amount: string; currency: string };
  download_uri?: string;
}

export async function fetchBusinessInvoices(
  accessToken: string,
  businessId: string,
): Promise<FbBusinessInvoice[]> {
  const res = await fbFetch<{ data: FbBusinessInvoice[] }>(`/${businessId}/business_invoices`, {
    access_token: accessToken,
    fields: 'id,billing_period,due_date,payment_status,amount_due,download_uri',
    limit: 24,
  });
  return res.data ?? [];
}
