// Boot-time environment validation. Called from index.ts before any route is
// registered so missing production config fails fast with a clear message,
// instead of crashing deep inside Prisma / Redis / the first request that
// happens to touch the unset variable.

interface RequiredVar {
  key: string;
  description: string;
  validate?: (value: string) => string | null;
}

// Vars that MUST be present in production. The validator returns an error
// string or null for pass. Dev setups are intentionally lenient — most of
// these have in-code fallbacks that only work in development.
const PRODUCTION_REQUIRED: RequiredVar[] = [
  { key: 'DATABASE_URL', description: 'Postgres connection string' },
  { key: 'REDIS_URL', description: 'Redis connection string (queues + cache)' },
  {
    key: 'JWT_ACCESS_SECRET',
    description: 'Access token signing secret',
    validate: (v) => (v.length < 32 ? 'must be at least 32 chars' : null),
  },
  {
    key: 'JWT_REFRESH_SECRET',
    description: 'Refresh token signing secret',
    validate: (v) => (v.length < 32 ? 'must be at least 32 chars' : null),
  },
  {
    key: 'ENCRYPTION_KEY',
    description: 'AES-256-GCM key for provider credentials (64-char hex)',
    validate: (v) =>
      /^[0-9a-fA-F]{64}$/.test(v) ? null : 'must be a 64-char hex string',
  },
  { key: 'FRONTEND_URL', description: 'Public frontend origin for CORS' },
];

// Optional but strongly recommended in production. Boot still succeeds; we
// print a warning so the operator knows the feature is off.
const PRODUCTION_RECOMMENDED: RequiredVar[] = [
  {
    key: 'EVOLUTION_WEBHOOK_SECRET',
    description:
      'Shared secret for Evolution webhook auth. Without it the webhook endpoint is open to the internet.',
  },
  { key: 'R2_ENDPOINT', description: 'Cloudflare R2 endpoint for uploads' },
  { key: 'R2_BUCKET', description: 'R2 bucket name' },
  { key: 'R2_ACCESS_KEY_ID', description: 'R2 access key' },
  { key: 'R2_SECRET_ACCESS_KEY', description: 'R2 secret' },
  { key: 'R2_PUBLIC_URL', description: 'R2 public base URL' },
];

export function validateEnv(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  for (const v of PRODUCTION_REQUIRED) {
    const value = process.env[v.key];
    if (!value) {
      missing.push(`  - ${v.key}: ${v.description}`);
      continue;
    }
    if (v.validate) {
      const err = v.validate(value);
      if (err) missing.push(`  - ${v.key}: ${err} (${v.description})`);
    }
  }

  if (missing.length > 0) {
    // eslint-disable-next-line no-console
    console.error(
      `[boot] Refusing to start — ${missing.length} required env var(s) missing or invalid:\n` +
        missing.join('\n'),
    );
    process.exit(1);
  }

  const warnings: string[] = [];
  for (const v of PRODUCTION_RECOMMENDED) {
    if (!process.env[v.key]) {
      warnings.push(`  - ${v.key}: ${v.description}`);
    }
  }
  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(
      `[boot] ${warnings.length} recommended env var(s) not set:\n` +
        warnings.join('\n'),
    );
  }
}
