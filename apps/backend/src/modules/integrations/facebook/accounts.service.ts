/**
 * Facebook ad accounts — CRUD + OAuth code exchange + per-account "list
 * accessible accounts after consent" helper.
 *
 * The OAuth flow:
 *   1. Frontend calls GET /api/v1/integrations/facebook/oauth/authorize
 *      → backend generates a CSRF state, stores it in Redis (5 min TTL),
 *        returns Meta's dialog URL.
 *   2. User authorizes → Meta redirects to /facebook/oauth/callback?code=…
 *   3. Backend verifies state, exchanges code → long-lived token (60d),
 *        fetches the user's accessible ad accounts, and renders a tiny
 *        HTML page that postMessage()s the result to the parent window
 *        and closes the popup.
 *   4. Frontend selects which ad account(s) to enable; backend persists
 *        them as AdAccount rows with isConnected=true + the encrypted
 *        token shared across them.
 *
 * Token refresh: long-lived tokens last ~60 days. refreshTokenIfNeeded()
 * re-exchanges the current token for a fresh long-lived one when expiry
 * is within 7 days. Failure marks lastError and isConnected=false so the
 * Setup tab can prompt the operator to re-link.
 */

import { prisma } from '../../../shared/prisma';
import { encryptSecret, decryptSecret } from '../../../shared/encryption';
import { redis } from '../../../shared/redis';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  listMyAdAccounts,
  type FbAdAccount,
  FacebookApiError,
} from './facebook.client';
import crypto from 'node:crypto';

const STATE_TTL_SECONDS = 5 * 60;
// Refresh long-lived tokens this many days before they expire so a
// transient network hiccup doesn't strand a connected account.
const REFRESH_THRESHOLD_DAYS = 7;

// ─── Public types ───────────────────────────────────────────────────────────

export interface AdAccountPublic {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  businessId: string | null;
  isActive: boolean;
  isConnected: boolean;
  hasToken: boolean;
  tokenExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublic(row: {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  businessId: string | null;
  accessToken: string | null;
  isActive: boolean;
  isConnected: boolean;
  tokenExpiresAt: Date | null;
  lastSyncAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): AdAccountPublic {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.externalId,
    name: row.name,
    businessId: row.businessId,
    isActive: row.isActive,
    isConnected: row.isConnected,
    hasToken: !!row.accessToken,
    tokenExpiresAt: row.tokenExpiresAt,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── OAuth: start ───────────────────────────────────────────────────────────

export async function startOAuth(): Promise<{ url: string; state: string }> {
  const state = crypto.randomBytes(24).toString('hex');
  await redis.set(`fb:oauth:state:${state}`, '1', 'EX', STATE_TTL_SECONDS);
  return { url: buildAuthorizeUrl(state), state };
}

export async function consumeOAuthState(state: string): Promise<boolean> {
  const key = `fb:oauth:state:${state}`;
  const found = await redis.get(key);
  if (!found) return false;
  await redis.del(key);
  return true;
}

// ─── OAuth: callback ────────────────────────────────────────────────────────
//
// Returns the long-lived token + the list of ad accounts the user can
// reach. The caller (route) renders an HTML page that postMessage()s
// this list back to the parent window so the user picks which accounts
// to enable.

export async function handleOAuthCallback(code: string): Promise<{
  accessToken: string;
  expiresAt: Date | null;
  accounts: FbAdAccount[];
}> {
  const { accessToken, expiresAt } = await exchangeCodeForToken(code);
  const accounts = await listMyAdAccounts(accessToken);
  return { accessToken, expiresAt, accounts };
}

// ─── Persist selected ad accounts ───────────────────────────────────────────

export interface ConnectAdAccountsInput {
  accessToken: string; // long-lived
  expiresAt: Date | null;
  accounts: Array<{
    externalId: string; // act_<id>
    name: string;
    businessId?: string | null;
  }>;
}

export async function connectAdAccounts(input: ConnectAdAccountsInput): Promise<AdAccountPublic[]> {
  const encrypted = encryptSecret(input.accessToken);
  const created: AdAccountPublic[] = [];
  for (const a of input.accounts) {
    const row = await prisma.adAccount.upsert({
      where: { provider_externalId: { provider: 'facebook', externalId: a.externalId } },
      create: {
        provider: 'facebook',
        externalId: a.externalId,
        name: a.name,
        businessId: a.businessId ?? null,
        accessToken: encrypted,
        tokenExpiresAt: input.expiresAt,
        isActive: true,
        isConnected: true,
        lastError: null,
      },
      update: {
        name: a.name,
        businessId: a.businessId ?? undefined,
        accessToken: encrypted,
        tokenExpiresAt: input.expiresAt,
        isConnected: true,
        lastError: null,
      },
    });
    created.push(toPublic(row));
  }
  return created;
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function listAccounts(): Promise<AdAccountPublic[]> {
  const rows = await prisma.adAccount.findMany({
    where: { provider: 'facebook' },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toPublic);
}

export async function getAccount(id: string): Promise<AdAccountPublic> {
  const row = await prisma.adAccount.findUnique({ where: { id } });
  if (!row) {
    throw Object.assign(new Error('Ad account not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  return toPublic(row);
}

export async function setActive(id: string, isActive: boolean): Promise<AdAccountPublic> {
  const row = await prisma.adAccount.update({
    where: { id },
    data: { isActive },
  });
  return toPublic(row);
}

export async function deleteAccount(id: string): Promise<void> {
  await prisma.adAccount.delete({ where: { id } });
}

// ─── Token access (server-side only) ────────────────────────────────────────

/**
 * Returns a valid long-lived access token for the given account, refreshing
 * it if it's within REFRESH_THRESHOLD_DAYS of expiry. Throws if the account
 * has no token (never connected) or refresh fails.
 */
export async function getValidAccessToken(accountId: string): Promise<string> {
  const row = await prisma.adAccount.findUnique({
    where: { id: accountId },
    select: { id: true, accessToken: true, tokenExpiresAt: true, isConnected: true },
  });
  if (!row) throw new FacebookApiError('Ad account not found', 'NOT_FOUND', 404);
  if (!row.accessToken) throw new FacebookApiError('Ad account not connected', 'NOT_CONNECTED', 412);

  const now = Date.now();
  const expiresInMs = row.tokenExpiresAt ? row.tokenExpiresAt.getTime() - now : Infinity;
  const needsRefresh = expiresInMs < REFRESH_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  let token = decryptSecret(row.accessToken);
  if (needsRefresh) {
    try {
      const fresh = await exchangeForLongLivedToken(token);
      token = fresh.accessToken;
      await prisma.adAccount.update({
        where: { id: accountId },
        data: {
          accessToken: encryptSecret(token),
          tokenExpiresAt: fresh.expiresAt,
          lastError: null,
        },
      });
    } catch (err) {
      // If refresh fails (token already expired, scope revoked, app
      // disabled), mark the account as needing re-link so the UI can
      // surface a "Reconnect" button without breaking the polling loop.
      const message = err instanceof Error ? err.message : String(err);
      await prisma.adAccount.update({
        where: { id: accountId },
        data: { isConnected: false, lastError: `Token refresh failed: ${message}` },
      });
      throw err;
    }
  }
  return token;
}
