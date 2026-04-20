import Redis from 'ioredis';

const globalForRedis = globalThis as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}

// ─── Auth rate-limit helpers ───────────────────────────────────────────────

const FAILED_LOGIN_PREFIX = 'auth:failed:';
const LOCKOUT_DURATION_SECS = 5 * 60; // 5 minutes
const MAX_FAILED_ATTEMPTS = 5;

export async function recordFailedLogin(ip: string): Promise<number> {
  const key = `${FAILED_LOGIN_PREFIX}${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOCKOUT_DURATION_SECS);
  }
  return count;
}

export async function getFailedLoginCount(ip: string): Promise<number> {
  const val = await redis.get(`${FAILED_LOGIN_PREFIX}${ip}`);
  return val ? parseInt(val, 10) : 0;
}

export async function getLoginLockoutTTL(ip: string): Promise<number> {
  return redis.ttl(`${FAILED_LOGIN_PREFIX}${ip}`);
}

export async function clearFailedLogins(ip: string): Promise<void> {
  await redis.del(`${FAILED_LOGIN_PREFIX}${ip}`);
}

export { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_SECS };

// ─── RBAC cache ────────────────────────────────────────────────────────────
// Cached snapshot of a user's role + active flag + permission keys. Checked
// on every authed request, so we keep TTL short (60s) and invalidate
// explicitly on user/role writes in the team service.

const RBAC_PREFIX = 'auth:rbac:';
const RBAC_TTL_SECS = 60;

export interface CachedRbac {
  isActive: boolean;
  roleId: string;
  roleName: string;
  name: string;
  email: string;
  permissions: string[];
}

export async function getCachedRbac(userId: string): Promise<CachedRbac | null> {
  const raw = await redis.get(`${RBAC_PREFIX}${userId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CachedRbac;
  } catch {
    return null;
  }
}

export async function setCachedRbac(userId: string, data: CachedRbac): Promise<void> {
  await redis.set(`${RBAC_PREFIX}${userId}`, JSON.stringify(data), 'EX', RBAC_TTL_SECS);
}

export async function invalidateRbacForUser(userId: string): Promise<void> {
  await redis.del(`${RBAC_PREFIX}${userId}`);
}

export async function invalidateRbacForUsers(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await redis.del(...userIds.map((id) => `${RBAC_PREFIX}${id}`));
}
