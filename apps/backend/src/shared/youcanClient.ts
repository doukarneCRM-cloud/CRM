/**
 * YouCan API client — handles OAuth, products, orders, and resthooks.
 *
 * Single app credentials from env vars (YOUCAN_CLIENT_ID / YOUCAN_CLIENT_SECRET).
 * Each Store row holds its own OAuth tokens obtained when the user connects.
 */

import { prisma } from './prisma';

const YOUCAN_API = 'https://api.youcan.shop';
const YOUCAN_AUTH = 'https://seller-area.youcan.shop/admin/oauth/authorize';

function getAppCredentials() {
  const clientId = process.env.YOUCAN_CLIENT_ID;
  const clientSecret = process.env.YOUCAN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new YoucanError(
      'YouCan app credentials missing — set YOUCAN_CLIENT_ID and YOUCAN_CLIENT_SECRET in .env',
      'MISSING_APP_CREDENTIALS',
    );
  }
  return { clientId, clientSecret };
}

function getRedirectUri() {
  return process.env.YOUCAN_REDIRECT_URI
    ?? `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/integrations/store/callback`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface YoucanPagination {
  total: number;
  count: number;
  per_page: number;
  current_page: number;
  total_pages: number;
  links: { next?: string };
}

export interface YoucanProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  has_variants: boolean;
  variants_count: number;
  inventory: number;
  track_inventory: boolean;
  thumbnail: string | null;
  images: Array<{
    id: string;
    url: string;
    variations?: { original?: string; sm?: string; md?: string; lg?: string };
  }>;
  variant_options: Array<{ name: string; type: number; values: string[] }>;
  variants?: YoucanVariant[];
  created_at: string;
  updated_at: string;
}

export interface YoucanVariant {
  id: string;
  product_id: string;
  variations: Record<string, string>;
  options?: string[];
  values?: string[];
  price: number;
  sku: string | null;
  inventory: number;
  image: string | null;
  weight: number | null;
}

export interface YoucanOrderLineItem {
  id: string;                // order-line-item id (NOT the variant id)
  price: number;
  quantity: number;
  created_at?: number;
  updated_at?: number;
  extra_fields?: unknown;
  variant?: {
    id: string;              // real variant id
    sku: string | null;
    variations?: Record<string, string>;
    options?: string[];
    values?: string[];
    price?: number;
    image?: string | null;
    product?: {
      id: string;            // real product id
      name: string;
      slug?: string;
      thumbnail?: string | null;
      images?: Array<{ url: string }>;
      price?: number;
    };
  };
}

export interface YoucanOrder {
  id: string;
  ref: string;
  status: string;
  total: number;
  vat: number;
  notes: string | null;
  extra_fields: Record<string, unknown> | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  customer?: {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    country: string | null;
    // `region` is YouCan's checkout field that merchants typically label as
    // the street/address line (not a province). Free-text from the form.
    region: string | null;
    city: string | null;
    location: string | null;
    zip_code?: string | null;
  };
  // YouCan order line items are nested: each entry is a line-item wrapper whose
  // `variant` field holds the real variant object, which in turn has a `product`
  // field with the full product info. Docs:
  // https://developer.youcan.shop/store-admin/orders/get
  variants?: Array<YoucanOrderLineItem>;
  shipping?: {
    zone_id: string | null;
    status: string | null;
    price: number;
    tracking_number: string | null;
    address?: {
      first_line: string | null;
      second_line: string | null;
      city: string | null;
      region: string | null;
      country_code: string | null;
      zip_code: string | null;
    };
  };
  payment?: {
    gateway: string | null;
    status: string | null;
    amount: number;
  };
}

interface YoucanTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
}

// ─── Helper: get store or throw ─────────────────────────────────────────────

async function getStore(storeId: string) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw new YoucanError('Store not found', 'STORE_NOT_FOUND');
  if (!store.accessToken) throw new YoucanError('Store not connected — complete OAuth first', 'NOT_CONNECTED');
  return store;
}

// ─── Authenticated fetch with auto-refresh ──────────────────────────────────

async function youcanFetch(
  storeId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let store = await getStore(storeId);

  // Refresh token if expired (with 5-minute buffer)
  if (store.tokenExpiresAt && store.tokenExpiresAt.getTime() < Date.now() + 5 * 60_000) {
    store = await refreshAccessToken(storeId);
  }

  const headers = {
    Authorization: `Bearer ${store.accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init?.headers ?? {}),
  };

  const res = await fetch(`${YOUCAN_API}${path}`, { ...init, headers });

  if (res.status === 401) {
    store = await refreshAccessToken(storeId);
    const retry = await fetch(`${YOUCAN_API}${path}`, {
      ...init,
      headers: { ...headers, Authorization: `Bearer ${store.accessToken}` },
    });
    if (!retry.ok) throw await parseYoucanError(retry);
    return retry;
  }

  if (!res.ok) throw await parseYoucanError(res);
  return res;
}

// ─── Token refresh ──────────────────────────────────────────────────────────

async function refreshAccessToken(storeId: string) {
  const store = await prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  if (!store.refreshToken) {
    throw new YoucanError('Missing refresh token — reconnect the store', 'MISSING_CREDENTIALS');
  }

  const { clientId, clientSecret } = getAppCredentials();

  const res = await fetch(`${YOUCAN_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: store.refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await parseYoucanError(res);
    await prisma.store.update({
      where: { id: storeId },
      data: { isConnected: false, lastError: `Token refresh failed: ${err.message}` },
    });
    throw err;
  }

  const tokens = (await res.json()) as YoucanTokenResponse;
  return prisma.store.update({
    where: { id: storeId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      isConnected: true,
      lastError: null,
    },
  });
}

// ─── Error handling ─────────────────────────────────────────────────────────

export class YoucanError extends Error {
  code: string;
  status?: number;
  fields?: Record<string, string[]>;

  constructor(message: string, code: string, status?: number, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'YoucanError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

async function parseYoucanError(res: Response): Promise<YoucanError> {
  try {
    const body = (await res.json()) as Record<string, any>;
    return new YoucanError(
      body.detail ?? body.message ?? `YouCan API error ${res.status}`,
      String(body.status ?? 'API_ERROR'),
      res.status,
      body.meta?.fields,
    );
  } catch {
    return new YoucanError(`YouCan API error ${res.status}`, 'API_ERROR', res.status);
  }
}

// ─── OAuth flow ─────────────────────────────────────────────────────────────

export function buildAuthUrl(state: string): string {
  const { clientId } = getAppCredentials();
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    'scope[]': '*',
  });
  return `${YOUCAN_AUTH}?${params.toString()}`;
}

export async function exchangeCode(storeId: string, code: string): Promise<void> {
  const { clientId, clientSecret } = getAppCredentials();
  const redirectUri = getRedirectUri();

  const res = await fetch(`${YOUCAN_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!res.ok) throw await parseYoucanError(res);

  const tokens = (await res.json()) as YoucanTokenResponse;
  await prisma.store.update({
    where: { id: storeId },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      isConnected: true,
      lastError: null,
    },
  });
}

// ─── Products ───────────────────────────────────────────────────────────────

function extractList(body: any): any[] {
  // Accept any of: { data: [...] }, { products: [...] }, { orders: [...] }, or a bare array.
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.products)) return body.products;
  if (Array.isArray(body?.orders)) return body.orders;
  if (Array.isArray(body?.items)) return body.items;
  return [];
}

function extractPagination(body: any): YoucanPagination {
  const p = body?.meta?.pagination ?? body?.pagination ?? {};
  return {
    total: Number(p.total ?? 0),
    count: Number(p.count ?? 0),
    per_page: Number(p.per_page ?? 0),
    current_page: Number(p.current_page ?? 1),
    total_pages: Number(p.total_pages ?? 1),
    links: p.links ?? {},
  };
}

function extractSingle(body: any): any {
  return body?.data ?? body?.product ?? body?.order ?? body ?? null;
}

export async function fetchProducts(
  storeId: string,
  page = 1,
  limit = 50,
): Promise<{ data: YoucanProduct[]; pagination: YoucanPagination }> {
  const res = await youcanFetch(storeId, `/products?page=${page}&limit=${limit}&include=variants,images`);
  const body = await res.json();
  return { data: extractList(body) as YoucanProduct[], pagination: extractPagination(body) };
}

export async function fetchProduct(storeId: string, productId: string): Promise<YoucanProduct> {
  const res = await youcanFetch(storeId, `/products/${productId}?include=variants,images`);
  const body = await res.json();
  return extractSingle(body) as YoucanProduct;
}

// ─── Orders ─────────────────────────────────────────────────────────────────

export async function fetchOrders(
  storeId: string,
  page = 1,
  limit = 50,
): Promise<{ data: YoucanOrder[]; pagination: YoucanPagination }> {
  // `variants` already includes the nested variant+product tree per the YouCan docs
  // (https://developer.youcan.shop/store-admin/orders/listing). `items`/`products`
  // aren't documented include values — keeping the include list to the official set.
  const res = await youcanFetch(
    storeId,
    `/orders?page=${page}&limit=${limit}&include=customer,variants,shipping,payment&sort_field=created_at&sort_order=desc`,
  );
  const body = await res.json();
  return { data: extractList(body) as YoucanOrder[], pagination: extractPagination(body) };
}

export async function fetchOrder(storeId: string, orderId: string): Promise<YoucanOrder> {
  const res = await youcanFetch(storeId, `/orders/${orderId}?include=customer,variants,shipping,payment`);
  const body = await res.json();
  return extractSingle(body) as YoucanOrder;
}

// ─── Checkout field config ──────────────────────────────────────────────────
// https://developer.youcan.shop/store-admin/settings/checkout/fields/listing
// Returns the fields the merchant has enabled on the store's checkout form —
// both built-in (first_name, phone, city, ...) and custom fields. Each entry:
//   { custom, name, display_name, placeholder, type, options, required, enabled }
export interface YoucanCheckoutFieldConfig {
  custom: boolean;
  name: string;
  display_name?: string | null;
  placeholder?: string | null;
  type?: string | null;
  options?: unknown;
  required?: boolean;
  enabled?: boolean;
}

export async function fetchCheckoutFieldsConfig(
  storeId: string,
): Promise<YoucanCheckoutFieldConfig[]> {
  const res = await youcanFetch(storeId, `/settings/checkout/fields/`);
  const body = await res.json();
  const list = extractList(body);
  return Array.isArray(list) ? (list as YoucanCheckoutFieldConfig[]) : [];
}

// ─── Webhooks (resthooks) ───────────────────────────────────────────────────

export async function subscribeWebhook(storeId: string, event: string, targetUrl: string): Promise<string> {
  const res = await youcanFetch(storeId, '/resthooks/subscribe', {
    method: 'POST',
    body: JSON.stringify({ event, target_url: targetUrl }),
  });
  const body = (await res.json()) as Record<string, any>;
  const id = body.data?.id ?? body.id ?? '';
  // YouCan should always echo the subscription id on success. If it doesn't,
  // treat the call as failed — otherwise we'd persist `webhookId = ''` on the
  // store row, which the UI's real-time badge would mis-read as "registered"
  // and the admin would never know to re-link. Failing loudly keeps the
  // OAuth-callback log explicit and routes the store onto the polling
  // fallback until the issue is fixed.
  if (!id) {
    throw new YoucanError(
      'Webhook subscription returned no id — instant delivery not active',
      'WEBHOOK_SUBSCRIBE_FAILED',
    );
  }
  return id;
}

export async function unsubscribeWebhook(storeId: string, webhookId: string): Promise<void> {
  await youcanFetch(storeId, '/resthooks/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ id: webhookId }),
  });
}

export async function listWebhooks(
  storeId: string,
): Promise<Array<{ id: string; event: string; target_url: string }>> {
  const res = await youcanFetch(storeId, '/resthooks/list');
  const body = (await res.json()) as { data: Array<{ id: string; event: string; target_url: string }> };
  return body.data ?? [];
}
