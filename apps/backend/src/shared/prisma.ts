import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Postgres has a hard cap on connections (Railway's managed pg = 100 total,
// shared across every process). Prisma's default `num_cpus * 2 + 1` plus any
// Promise.all fan-out can exhaust that cap and trigger P2037 "too many clients".
// Force a modest ceiling and a wait-timeout so queries queue instead of failing.
function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');
    return url.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = buildDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
