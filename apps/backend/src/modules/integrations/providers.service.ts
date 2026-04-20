/**
 * Shipping provider registry (Coliix, etc.).
 *
 * One row per integration, seeded lazily on first access. API keys are stored
 * AES-256-GCM encrypted; call `getDecryptedApiKey` when handing them to HTTP
 * clients. Webhook secrets are plain random hex — exposed in the webhook URL
 * path, not in headers, so no need to hash them.
 */

import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';
import { encryptSecret, decryptSecret, maskSecret } from '../../shared/encryption';

const DEFAULTS: Record<string, { apiBaseUrl: string }> = {
  coliix: { apiBaseUrl: 'https://my.coliix.com' },
};

function freshWebhookSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

/**
 * Public-safe shape returned to the UI — the API key is never revealed, only a
 * masked hint. Callers that need the plaintext key use `getDecryptedApiKey`.
 */
export interface ProviderPublic {
  id: string;
  name: string;
  apiBaseUrl: string;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMask: string | null;
  webhookSecret: string;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toPublic(row: {
  id: string;
  name: string;
  apiBaseUrl: string;
  apiKey: string | null;
  webhookSecret: string;
  isActive: boolean;
  lastCheckedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProviderPublic {
  let apiKeyMask: string | null = null;
  if (row.apiKey) {
    try {
      apiKeyMask = maskSecret(decryptSecret(row.apiKey));
    } catch {
      apiKeyMask = '••••????'; // corrupted blob — surface in UI so admin can re-enter
    }
  }
  return {
    id: row.id,
    name: row.name,
    apiBaseUrl: row.apiBaseUrl,
    isActive: row.isActive,
    hasApiKey: Boolean(row.apiKey),
    apiKeyMask,
    webhookSecret: row.webhookSecret,
    lastCheckedAt: row.lastCheckedAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getOrCreateProvider(name: string) {
  const existing = await prisma.shippingProvider.findUnique({ where: { name } });
  if (existing) return existing;

  const defaults = DEFAULTS[name];
  if (!defaults) {
    throw new Error(`Unknown shipping provider: ${name}`);
  }
  return prisma.shippingProvider.create({
    data: {
      name,
      apiBaseUrl: defaults.apiBaseUrl,
      webhookSecret: freshWebhookSecret(),
      isActive: false,
    },
  });
}

export async function getProviderPublic(name: string): Promise<ProviderPublic> {
  const row = await getOrCreateProvider(name);
  return toPublic(row);
}

export async function listProvidersPublic(): Promise<ProviderPublic[]> {
  // Ensure the known defaults exist so the UI always has rows to render.
  await Promise.all(Object.keys(DEFAULTS).map((n) => getOrCreateProvider(n)));
  const rows = await prisma.shippingProvider.findMany({ orderBy: { name: 'asc' } });
  return rows.map(toPublic);
}

export async function updateProvider(
  name: string,
  input: { apiBaseUrl?: string; apiKey?: string | null; isActive?: boolean },
): Promise<ProviderPublic> {
  const row = await getOrCreateProvider(name);

  const data: Record<string, unknown> = {};
  if (input.apiBaseUrl !== undefined) data.apiBaseUrl = input.apiBaseUrl;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.apiKey !== undefined) {
    data.apiKey = input.apiKey === null ? null : encryptSecret(input.apiKey);
  }

  const updated = await prisma.shippingProvider.update({
    where: { id: row.id },
    data,
  });
  return toPublic(updated);
}

export async function rotateWebhookSecret(name: string): Promise<ProviderPublic> {
  const row = await getOrCreateProvider(name);
  const updated = await prisma.shippingProvider.update({
    where: { id: row.id },
    data: { webhookSecret: freshWebhookSecret() },
  });
  return toPublic(updated);
}

/** Returns the decrypted API key, or throws if the provider has no key set. */
export async function getDecryptedApiKey(name: string): Promise<string> {
  const row = await getOrCreateProvider(name);
  if (!row.apiKey) {
    throw new Error(`Provider "${name}" has no API key configured`);
  }
  return decryptSecret(row.apiKey);
}

/**
 * Ping the provider's API with the stored key. Records the outcome in
 * lastCheckedAt / lastError so the UI can show the result.
 *
 * For Coliix we POST action=track with a bogus tracking. The server always
 * returns HTTP 200 and signals auth failures via body.status=204 with a msg
 * like "Le compte est désactivé" or a token error. Any non-200 body status
 * whose msg mentions token/clé/compte is treated as a credential failure;
 * other non-200 statuses (e.g. "tracking not found") mean the key works.
 */
export async function testConnection(
  name: string,
): Promise<{ ok: boolean; message: string }> {
  const row = await getOrCreateProvider(name);
  if (!row.apiKey) {
    const msg = 'No API key configured';
    await prisma.shippingProvider.update({
      where: { id: row.id },
      data: { lastCheckedAt: new Date(), lastError: msg },
    });
    return { ok: false, message: msg };
  }

  try {
    const apiKey = decryptSecret(row.apiKey);
    if (name === 'coliix') {
      const res = await fetch(`${row.apiBaseUrl}/aga/seller/api-parcels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({ action: 'track', token: apiKey, tracking: 'CRM-PING-0000' }),
      });
      if (!res.ok) {
        const msg = `Provider returned HTTP ${res.status}`;
        await prisma.shippingProvider.update({
          where: { id: row.id },
          data: { lastCheckedAt: new Date(), lastError: msg },
        });
        return { ok: false, message: msg };
      }
      const payload = (await res.json().catch(() => null)) as
        | { status?: number; msg?: string }
        | null;
      const bodyStatus = typeof payload?.status === 'number' ? payload.status : null;
      const bodyMsg = typeof payload?.msg === 'string' ? payload.msg : '';
      const looksLikeAuthError =
        bodyStatus !== null &&
        bodyStatus !== 200 &&
        /token|cl(é|e)|compte|d(é|e)sactiv|unauth|forbidden|invalid/i.test(bodyMsg);
      if (looksLikeAuthError) {
        const msg = bodyMsg || 'Credential rejected';
        await prisma.shippingProvider.update({
          where: { id: row.id },
          data: { lastCheckedAt: new Date(), lastError: msg },
        });
        return { ok: false, message: msg };
      }
    }

    await prisma.shippingProvider.update({
      where: { id: row.id },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
    return { ok: true, message: 'Connection OK' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.shippingProvider.update({
      where: { id: row.id },
      data: { lastCheckedAt: new Date(), lastError: msg },
    });
    return { ok: false, message: msg };
  }
}
