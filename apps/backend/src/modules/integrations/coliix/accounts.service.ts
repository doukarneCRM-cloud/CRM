/**
 * Carrier accounts (Coliix) — CRUD + the "test connection" helper used by
 * the Setup tab.
 *
 * Single-hub today (Agadir) but the schema models multi-hub from day 1
 * so adding a second hub is a UI concern, not a schema migration.
 *
 * The API key is AES-256-GCM encrypted at rest via shared/encryption.
 * The webhook secret is a random hex segment; safe to store plain because
 * the only way to defeat it is to brute-force a 28-hex-char string.
 */

import crypto from 'node:crypto';
import { prisma } from '../../../shared/prisma';
import { encryptSecret, decryptSecret, maskSecret } from '../../../shared/encryption';
import { testCredentials } from './coliix.client';

const COLIIX_CARRIER_CODE = 'coliix';
const COLIIX_CARRIER_LABEL = 'Coliix';

function freshWebhookSecret(): string {
  return crypto.randomBytes(28).toString('hex');
}

async function getOrCreateCarrier() {
  const existing = await prisma.carrier.findUnique({ where: { code: COLIIX_CARRIER_CODE } });
  if (existing) return existing;
  return prisma.carrier.create({
    data: { code: COLIIX_CARRIER_CODE, label: COLIIX_CARRIER_LABEL },
  });
}

export interface CarrierAccountPublic {
  id: string;
  hubLabel: string;
  apiBaseUrl: string;
  apiKeyMask: string | null;
  hasApiKey: boolean;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublic(row: {
  id: string;
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CarrierAccountPublic {
  let apiKeyMask: string | null = null;
  let hasApiKey = false;
  if (row.apiKey) {
    hasApiKey = true;
    try {
      apiKeyMask = maskSecret(decryptSecret(row.apiKey));
    } catch {
      // Corrupted blob (encryption key rotated without re-saving); surface
      // so the admin can re-enter the key.
      apiKeyMask = '••••????';
    }
  }
  return {
    id: row.id,
    hubLabel: row.hubLabel,
    apiBaseUrl: row.apiBaseUrl,
    apiKeyMask,
    hasApiKey,
    webhookSecret: row.webhookSecret,
    isActive: row.isActive,
    lastHealthAt: row.lastHealthAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAccounts(): Promise<CarrierAccountPublic[]> {
  const carrier = await getOrCreateCarrier();
  const rows = await prisma.carrierAccount.findMany({
    where: { carrierId: carrier.id },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toPublic);
}

export async function getAccount(id: string): Promise<CarrierAccountPublic> {
  const row = await prisma.carrierAccount.findUnique({ where: { id } });
  if (!row) {
    throw Object.assign(new Error('Account not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  return toPublic(row);
}

/**
 * Find an account by its webhook secret in constant time.
 *
 * Used by the webhook controller — we never trust the path segment
 * verbatim. Bring all secrets, compare each to the candidate via
 * `timingSafeEqual` so an attacker can't time-side-channel the lookup.
 */
export async function findAccountBySecret(candidate: string): Promise<{ id: string } | null> {
  if (!candidate || candidate.length < 16) return null;
  const carrier = await prisma.carrier.findUnique({ where: { code: COLIIX_CARRIER_CODE } });
  if (!carrier) return null;
  const rows = await prisma.carrierAccount.findMany({
    where: { carrierId: carrier.id, isActive: true },
    select: { id: true, webhookSecret: true },
  });
  const candidateBuf = Buffer.from(candidate);
  for (const r of rows) {
    const stored = Buffer.from(r.webhookSecret);
    if (stored.length !== candidateBuf.length) continue;
    if (crypto.timingSafeEqual(stored, candidateBuf)) {
      return { id: r.id };
    }
  }
  return null;
}

export interface CreateAccountInput {
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string;
}

export async function createAccount(input: CreateAccountInput): Promise<CarrierAccountPublic> {
  const carrier = await getOrCreateCarrier();
  const row = await prisma.carrierAccount.create({
    data: {
      carrierId: carrier.id,
      hubLabel: input.hubLabel.trim(),
      apiBaseUrl: input.apiBaseUrl.replace(/\/$/, ''),
      apiKey: encryptSecret(input.apiKey),
      webhookSecret: freshWebhookSecret(),
      isActive: false,
    },
  });
  return toPublic(row);
}

export interface UpdateAccountInput {
  hubLabel?: string;
  apiBaseUrl?: string;
  apiKey?: string | null; // null = leave existing; string = replace
  isActive?: boolean;
}

export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<CarrierAccountPublic> {
  const data: Record<string, unknown> = {};
  if (input.hubLabel !== undefined) data.hubLabel = input.hubLabel.trim();
  if (input.apiBaseUrl !== undefined) data.apiBaseUrl = input.apiBaseUrl.replace(/\/$/, '');
  if (input.apiKey !== undefined && input.apiKey !== null) {
    data.apiKey = encryptSecret(input.apiKey);
  }
  if (input.isActive !== undefined) data.isActive = input.isActive;
  const row = await prisma.carrierAccount.update({ where: { id }, data });
  return toPublic(row);
}

export async function rotateWebhookSecret(id: string): Promise<CarrierAccountPublic> {
  const row = await prisma.carrierAccount.update({
    where: { id },
    data: { webhookSecret: freshWebhookSecret() },
  });
  return toPublic(row);
}

export async function deleteAccount(id: string): Promise<void> {
  await prisma.carrierAccount.delete({ where: { id } });
}

/**
 * Hit the Coliix track endpoint with a bogus tracking code and record
 * the outcome. The Setup tab uses this to surface a green/red status.
 *
 * On success: lastHealthAt = now, lastError = null.
 * On failure: lastHealthAt = now, lastError = reason. rawSample (if
 * any) is passed back to the UI so the admin can inspect what Coliix
 * actually returned without digging through server logs.
 */
export async function testAccount(
  id: string,
): Promise<{ ok: boolean; reason?: string; rawSample?: string }> {
  const row = await prisma.carrierAccount.findUnique({ where: { id } });
  if (!row) {
    throw Object.assign(new Error('Account not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  const result = await testCredentials({
    baseUrl: row.apiBaseUrl,
    apiKey: decryptSecret(row.apiKey),
  });
  await prisma.carrierAccount.update({
    where: { id },
    data: {
      lastHealthAt: new Date(),
      lastError: result.ok ? null : (result.reason ?? null),
    },
  });
  return result;
}

/**
 * Decrypted plaintext API key — only call from server-side code that
 * needs to actually hit the Coliix API (poll worker, etc.).
 */
export async function getDecryptedApiKey(id: string): Promise<string> {
  const row = await prisma.carrierAccount.findUnique({ where: { id } });
  if (!row) {
    throw Object.assign(new Error('Account not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  return decryptSecret(row.apiKey);
}

// ─── Health snapshot (Setup tab strip) ──────────────────────────────────────
// One row per active hub with the metrics an operator looks for to spot
// silent failures: last successful webhook, last poll attempt, error
// count in the rolling 24h window. The Setup tab renders this above the
// account list so green/red is visible without drilling down.

export interface AccountHealth {
  accountId: string;
  hubLabel: string;
  isActive: boolean;
  // null = no successful event ever recorded for this account.
  lastWebhookAt: Date | null;
  lastPollAt: Date | null;
  errorCount24h: number;
  // Carried through so the strip can read both flags without a second
  // request.
  lastHealthAt: Date | null;
  lastError: string | null;
}

export async function listAccountHealth(): Promise<AccountHealth[]> {
  const rows = await prisma.carrierAccount.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      hubLabel: true,
      isActive: true,
      lastHealthAt: true,
      lastError: true,
    },
  });
  if (rows.length === 0) return [];

  const since24h = new Date(Date.now() - 24 * 60 * 60_000);

  // Run the per-account aggregations in parallel. Each query is cheap
  // (indexed on accountId / source) but scaling to many hubs we'd
  // collapse them into a single CTE — single-hub setups are fine here.
  const results = await Promise.all(
    rows.map(async (row) => {
      const [lastWebhook, lastPoll, errorCount24h] = await Promise.all([
        // Latest webhook event tied to this account via Shipment FK.
        prisma.shipmentEvent.findFirst({
          where: {
            source: 'webhook',
            shipment: { accountId: row.id },
          },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
        prisma.shipmentEvent.findFirst({
          where: {
            source: 'poll',
            shipment: { accountId: row.id },
          },
          orderBy: { receivedAt: 'desc' },
          select: { receivedAt: true },
        }),
        prisma.coliixIntegrationError.count({
          where: {
            accountId: row.id,
            createdAt: { gte: since24h },
          },
        }),
      ]);
      return {
        accountId: row.id,
        hubLabel: row.hubLabel,
        isActive: row.isActive,
        lastWebhookAt: lastWebhook?.receivedAt ?? null,
        lastPollAt: lastPoll?.receivedAt ?? null,
        errorCount24h,
        lastHealthAt: row.lastHealthAt,
        lastError: row.lastError,
      };
    }),
  );
  return results;
}
