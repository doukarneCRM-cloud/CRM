import { redis } from './redis';

// Per-session rate limits for outbound WhatsApp. Defaults are conservative;
// warmup ramps up over the first 7 days of a session's life.
const HOUR_KEY = (sessionId: string, hourBucket: number) => `wa:rate:${sessionId}:h:${hourBucket}`;
const DAY_KEY = (sessionId: string, dayBucket: string) => `wa:rate:${sessionId}:d:${dayBucket}`;

export interface RateLimitDecision {
  allowed: boolean;
  reason?: 'hourly' | 'daily';
  retryAfterMs?: number;
  hourlyLimit: number;
  hourlyUsed: number;
  dailyLimit: number;
  dailyUsed: number;
}

export interface RateLimitConfig {
  hourly: number; // max messages per rolling hour
  daily: number;
}

const DEFAULT_LIMITS: RateLimitConfig = { hourly: 200, daily: 800 };

// Warmup: sessions connected < 7 days get throttled. Day 1 = 30/hr, 2 = 60/hr,
// 3 = 100/hr, scaling up to full default by day 7.
function warmupLimits(createdAt: Date): RateLimitConfig {
  const ageHours = (Date.now() - createdAt.getTime()) / (3600 * 1000);
  if (ageHours < 24) return { hourly: 30, daily: 150 };
  if (ageHours < 48) return { hourly: 60, daily: 300 };
  if (ageHours < 72) return { hourly: 100, daily: 400 };
  if (ageHours < 168) return { hourly: 150, daily: 600 };
  return DEFAULT_LIMITS;
}

function hourBucket(now = new Date()): number {
  return Math.floor(now.getTime() / (3600 * 1000));
}

function dayBucket(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export async function checkRateLimit(
  sessionId: string,
  createdAt: Date,
): Promise<RateLimitDecision> {
  const limits = warmupLimits(createdAt);
  const hb = hourBucket();
  const db = dayBucket();
  const [rawH, rawD] = await redis.mget(HOUR_KEY(sessionId, hb), DAY_KEY(sessionId, db));
  const hourlyUsed = Number(rawH ?? 0);
  const dailyUsed = Number(rawD ?? 0);

  if (hourlyUsed >= limits.hourly) {
    const msToNextHour = (hb + 1) * 3600 * 1000 - Date.now();
    return {
      allowed: false,
      reason: 'hourly',
      retryAfterMs: Math.max(msToNextHour, 60_000),
      hourlyLimit: limits.hourly,
      hourlyUsed,
      dailyLimit: limits.daily,
      dailyUsed,
    };
  }
  if (dailyUsed >= limits.daily) {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return {
      allowed: false,
      reason: 'daily',
      retryAfterMs: tomorrow.getTime() - now.getTime(),
      hourlyLimit: limits.hourly,
      hourlyUsed,
      dailyLimit: limits.daily,
      dailyUsed,
    };
  }
  return {
    allowed: true,
    hourlyLimit: limits.hourly,
    hourlyUsed,
    dailyLimit: limits.daily,
    dailyUsed,
  };
}

export async function recordSend(sessionId: string): Promise<void> {
  const hb = hourBucket();
  const db = dayBucket();
  const pipe = redis.pipeline();
  pipe.incr(HOUR_KEY(sessionId, hb));
  pipe.expire(HOUR_KEY(sessionId, hb), 2 * 3600);
  pipe.incr(DAY_KEY(sessionId, db));
  pipe.expire(DAY_KEY(sessionId, db), 36 * 3600);
  await pipe.exec();
}

export async function getSessionUsage(sessionId: string, createdAt: Date) {
  const limits = warmupLimits(createdAt);
  const hb = hourBucket();
  const db = dayBucket();
  const [rawH, rawD] = await redis.mget(HOUR_KEY(sessionId, hb), DAY_KEY(sessionId, db));
  return {
    hourlyLimit: limits.hourly,
    hourlyUsed: Number(rawH ?? 0),
    dailyLimit: limits.daily,
    dailyUsed: Number(rawD ?? 0),
  };
}
