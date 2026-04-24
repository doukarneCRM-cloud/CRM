import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// Required in every environment. In production the process crashes if the var
// is missing (fail fast, no silent fallback). In development we generate a
// random per-process secret so local runs work without config — tokens become
// invalid on restart, which is the desired behaviour for dev anyway.
function requireSecret(envKey: string): string {
  const value = process.env[envKey];
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${envKey} must be set to a strong secret (>=32 chars) in production`,
    );
  }
  const generated = crypto.randomBytes(32).toString('hex');
  // eslint-disable-next-line no-console
  console.warn(
    `[jwt] ${envKey} not set — generated an ephemeral dev secret. ` +
      `All existing tokens will be invalidated on every restart. ` +
      `Set ${envKey} in .env to persist sessions across restarts.`,
  );
  return generated;
}

const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET');
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';

export interface JwtPayload {
  sub: string;       // user id
  email: string;
  roleId: string;
  roleName: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function signRefreshToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, ACCESS_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, REFRESH_SECRET) as JwtPayload;
}
