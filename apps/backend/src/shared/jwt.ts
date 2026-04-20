import jwt from 'jsonwebtoken';

function requireSecret(envKey: string, devFallback: string): string {
  const value = process.env[envKey];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${envKey} must be set in production`);
  }
  return devFallback;
}

const ACCESS_SECRET = requireSecret('JWT_ACCESS_SECRET', 'dev_access_secret_change_in_production');
const REFRESH_SECRET = requireSecret('JWT_REFRESH_SECRET', 'dev_refresh_secret_change_in_production');
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
