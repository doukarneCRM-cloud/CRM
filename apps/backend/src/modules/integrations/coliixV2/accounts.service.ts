/**
 * CarrierAccount CRUD + helpers. One row per (carrier × hub).
 *
 * API key is stored AES-256-GCM encrypted (reuse V1's encryption helpers);
 * only `getDecryptedAccount()` ever returns plaintext.
 */

import crypto from 'node:crypto';
import { prisma } from '../../../shared/prisma';
import { encryptSecret, decryptSecret, maskSecret } from '../../../shared/encryption';

const COLIIX_V2_CODE = 'coliix_v2';
const COLIIX_V2_DEFAULT_BASE = 'https://my.coliix.com';

function freshSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

export interface CarrierAccountPublic {
  id: string;
  carrierCode: string;
  hubLabel: string;
  storeId: string | null;
  apiBaseUrl: string;
  apiKeyMask: string | null;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CarrierAccountWithSecrets {
  id: string;
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string; // encrypted blob
  webhookSecret: string;
  isActive: boolean;
}

function toPublic(row: {
  id: string;
  hubLabel: string;
  storeId: string | null;
  apiBaseUrl: string;
  apiKey: string;
  webhookSecret: string;
  isActive: boolean;
  lastHealthAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  carrier: { code: string };
}): CarrierAccountPublic {
  let apiKeyMask: string | null = null;
  try {
    apiKeyMask = maskSecret(decryptSecret(row.apiKey));
  } catch {
    apiKeyMask = '••••????';
  }
  return {
    id: row.id,
    carrierCode: row.carrier.code,
    hubLabel: row.hubLabel,
    storeId: row.storeId,
    apiBaseUrl: row.apiBaseUrl,
    apiKeyMask,
    webhookSecret: row.webhookSecret,
    isActive: row.isActive,
    lastHealthAt: row.lastHealthAt?.toISOString() ?? null,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function getColiixCarrier() {
  // Carrier seeded by migration; this is just a defensive lookup.
  const c = await prisma.carrier.findUnique({ where: { code: COLIIX_V2_CODE } });
  if (!c) throw new Error('Coliix V2 carrier row missing — re-run migrations');
  return c;
}

export async function listAccounts(): Promise<CarrierAccountPublic[]> {
  const rows = await prisma.carrierAccount.findMany({
    where: { carrier: { code: COLIIX_V2_CODE } },
    include: { carrier: { select: { code: true } } },
    orderBy: [{ hubLabel: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toPublic);
}

export async function getAccount(id: string) {
  const row = await prisma.carrierAccount.findUnique({
    where: { id },
    include: { carrier: { select: { code: true } } },
  });
  if (!row) throw Object.assign(new Error('Carrier account not found'), {
    statusCode: 404,
    code: 'NOT_FOUND',
  });
  return row;
}

export async function getAccountPublic(id: string): Promise<CarrierAccountPublic> {
  return toPublic(await getAccount(id));
}

export async function createAccount(input: {
  hubLabel: string;
  apiBaseUrl?: string;
  apiKey: string;
  storeId?: string | null;
}): Promise<CarrierAccountPublic> {
  const carrier = await getColiixCarrier();
  const created = await prisma.carrierAccount.create({
    data: {
      carrierId: carrier.id,
      hubLabel: input.hubLabel.trim(),
      storeId: input.storeId ?? null,
      apiBaseUrl: (input.apiBaseUrl ?? COLIIX_V2_DEFAULT_BASE).trim(),
      apiKey: encryptSecret(input.apiKey.trim()),
      webhookSecret: freshSecret(),
      isActive: false,
    },
    include: { carrier: { select: { code: true } } },
  });
  return toPublic(created);
}

export async function updateAccount(
  id: string,
  input: {
    hubLabel?: string;
    apiBaseUrl?: string;
    apiKey?: string;
    storeId?: string | null;
    isActive?: boolean;
  },
): Promise<CarrierAccountPublic> {
  await getAccount(id);
  const data: Record<string, unknown> = {};
  if (input.hubLabel !== undefined) data.hubLabel = input.hubLabel.trim();
  if (input.apiBaseUrl !== undefined) data.apiBaseUrl = input.apiBaseUrl.trim();
  if (input.apiKey !== undefined && input.apiKey.trim()) {
    data.apiKey = encryptSecret(input.apiKey.trim());
  }
  if (input.storeId !== undefined) data.storeId = input.storeId;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  const updated = await prisma.carrierAccount.update({
    where: { id },
    data,
    include: { carrier: { select: { code: true } } },
  });
  return toPublic(updated);
}

export async function rotateWebhookSecret(id: string): Promise<CarrierAccountPublic> {
  await getAccount(id);
  const updated = await prisma.carrierAccount.update({
    where: { id },
    data: { webhookSecret: freshSecret() },
    include: { carrier: { select: { code: true } } },
  });
  return toPublic(updated);
}

export async function recordHealth(
  id: string,
  outcome: { ok: boolean; message?: string | null },
): Promise<void> {
  await prisma.carrierAccount.update({
    where: { id },
    data: {
      lastHealthAt: new Date(),
      lastError: outcome.ok ? null : outcome.message ?? 'Unknown error',
    },
  });
}

/** Returns the row plus the decrypted API key in a single object — used by
 *  workers / one-off ops. The plaintext key never leaves this layer. */
export async function getDecryptedAccount(id: string) {
  const row = await getAccount(id);
  return {
    id: row.id,
    hubLabel: row.hubLabel,
    apiBaseUrl: row.apiBaseUrl,
    apiKey: decryptSecret(row.apiKey),
    webhookSecret: row.webhookSecret,
    isActive: row.isActive,
  };
}

/** Find an active account scoped to a store — falls back to the unscoped
 *  (storeId=null) account so ops can run a single global key per carrier. */
export async function pickAccountForStore(storeId: string | null): Promise<{
  id: string;
  hubLabel: string;
  apiBaseUrl: string;
  apiKey: string; // encrypted
} | null> {
  const row = await prisma.carrierAccount.findFirst({
    where: {
      carrier: { code: COLIIX_V2_CODE },
      isActive: true,
      OR: [{ storeId }, { storeId: null }],
    },
    orderBy: [{ storeId: 'desc' }, { createdAt: 'asc' }], // store-scoped first
    select: { id: true, hubLabel: true, apiBaseUrl: true, apiKey: true },
  });
  return row;
}
