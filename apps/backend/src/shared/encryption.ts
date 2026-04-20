/**
 * AES-256-GCM encryption for at-rest secrets (shipping provider API keys).
 *
 * Format: "v1:ivHex:authTagHex:cipherHex"  — version prefix lets us rotate the
 * algorithm later without breaking previously-stored rows. The master key lives
 * in ENCRYPTION_KEY as a 64-char hex string (32 bytes). A dev fallback is used
 * when unset so local boots don't crash; it logs a warning and MUST NOT be used
 * in production.
 */

import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // recommended for GCM
const VERSION = 'v1';

let warned = false;

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_KEY must be a 64-char hex string in production');
  }
  if (!warned) {
    console.warn(
      '[encryption] ENCRYPTION_KEY missing or invalid (need 64 hex chars). ' +
        'Using insecure dev fallback — DO NOT USE IN PRODUCTION.',
    );
    warned = true;
  }
  return crypto.createHash('sha256').update('anaqatoki-dev-encryption-fallback').digest();
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Invalid encrypted blob format');
  }
  const [, ivHex, tagHex, cipherHex] = parts;
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, 'hex')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

/** Returns a masked preview (e.g. "••••cf") so the UI can confirm a key is set. */
export function maskSecret(plaintext: string): string {
  if (!plaintext) return '';
  const tail = plaintext.slice(-4);
  return `••••${tail}`;
}
