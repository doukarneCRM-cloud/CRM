import 'dotenv/config';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';

// Fail fast on missing ENCRYPTION_KEY in production rather than letting the
// first provider-save request crash with a generic 500. The shipping provider
// API key column stores AES-256-GCM blobs keyed by this env var.
if (process.env.NODE_ENV === 'production') {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    console.error(
      '[boot] ENCRYPTION_KEY is missing or malformed. ' +
        'Set it to a 64-char hex string (generate with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"). ' +
        'Shipping provider API keys cannot be saved without it.',
    );
    process.exit(1);
  }
}

import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { Prisma } from '@prisma/client';

import { prisma } from './shared/prisma';
import { redis } from './shared/redis';
import { verifyJWT } from './shared/middleware/verifyJWT';
import { initSocket, getOnlineUserIds } from './shared/socket';
import { authRoutes } from './modules/auth/auth.routes';
import { ordersRoutes } from './modules/orders/orders.routes';
import { customersRoutes } from './modules/customers/customers.routes';
import { productsRoutes } from './modules/products/products.routes';
import { teamRoutes } from './modules/team/team.routes';
import { integrationsRoutes } from './modules/integrations/integrations.routes';
import { startOrderPoller } from './modules/integrations/orderPoller';
import { listProvidersPublic } from './modules/integrations/providers.service';
import { startColiixTracker } from './modules/integrations/coliixTracker';
import { shippingCitiesRoutes } from './modules/shippingCities/shippingCities.routes';
import { atelieRoutes } from './modules/atelie/atelie.routes';
import { atelieStockRoutes } from './modules/atelieStock/atelieStock.routes';
import { fabricRoutes } from './modules/atelieStock/fabric.routes';
import { atelieTasksRoutes } from './modules/atelieTasks/atelieTasks.routes';
import { atelieTestsRoutes } from './modules/atelieTests/atelieTests.routes';
import { atelieProductionRoutes } from './modules/atelieProduction/atelieProduction.routes';
import { analyticsRoutes } from './modules/analytics/analytics.routes';
import { moneyRoutes } from './modules/money/money.routes';
import { returnsRoutes } from './modules/returns/returns.routes';
import { notificationsRoutes } from './modules/notifications/notifications.routes';
import { automationRoutes } from './modules/automation/automation.routes';
import { whatsappRoutes } from './modules/whatsapp/whatsapp.routes';
import { inboxRoutes } from './modules/whatsapp/inbox.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { ensureDefaultTemplates } from './modules/automation/automation.service';
import { ensureFallbackRules } from './modules/automation/rules.service';
import { ensureAdminPermissions } from './shared/ensureAdminPermissions';
import { startAttendanceCron } from './modules/atelie/weeklyAttendanceCron';
// Bull workers — side-effect imports register .process() handlers.
import './jobs/callbackAlert.job';
import './jobs/whatsappSend.job';
import { simulateAssign } from './utils/autoAssign';
import {
  computeKPIsWithComparison,
  computeAgentPerformance,
  computeAgentCommission,
  computeTopProducts,
  computeTopCities,
  computeOrderTrend,
  computeStatusBreakdown,
  computeAgentStatsByIds,
} from './utils/kpiCalculator';
import type { OrderFilterParams } from './utils/filterBuilder';

// ─── Fastify app ──────────────────────────────────────────────────────────────
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
  trustProxy: true,
});

// ─── Decorate ─────────────────────────────────────────────────────────────────
app.decorate('verifyJWT', verifyJWT);

declare module 'fastify' {
  interface FastifyInstance {
    verifyJWT: typeof verifyJWT;
  }
}

// ─── Plugins ──────────────────────────────────────────────────────────────────
app.register(cors, {
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  credentials: true,
});

app.register(rateLimit, {
  max: 200,
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  // Evolution can burst dozens of webhook events per second while a session
  // is negotiating — the global 200/min limit isn't meant to apply to them.
  allowList: (req) => req.url.startsWith('/api/v1/whatsapp/webhook'),
});

// Multipart (file uploads) — 50 MB per file to cover WhatsApp voice notes,
// videos, and documents. Per-route handlers enforce stricter limits when
// needed (product images still reject >8 MB in their mime-filter path).
app.register(multipart, {
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

// Serve uploaded files statically under /uploads/*
const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
app.register(fastifyStatic, {
  root: UPLOADS_ROOT,
  prefix: '/uploads/',
  decorateReply: false,
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.setErrorHandler((error: FastifyError, _request, reply) => {
  app.log.error(error);

  // Evolution (WhatsApp gateway) errors — surface the underlying message
  // and status so the UI shows a diagnosable error instead of a generic 500.
  if (error.name === 'EvolutionError') {
    const ev = error as FastifyError & { status?: number; body?: unknown };
    const status = ev.status ?? 502;
    return reply.status(status).send({
      error: {
        code: 'WHATSAPP_GATEWAY_ERROR',
        message: `WhatsApp gateway: ${error.message}`,
        statusCode: status,
      },
    });
  }

  // WhatsApp gateway not configured (missing EVOLUTION_API_URL etc.)
  if (error.message?.includes('EVOLUTION_API_URL is not configured')) {
    return reply.status(503).send({
      error: {
        code: 'WHATSAPP_NOT_CONFIGURED',
        message:
          'WhatsApp gateway is not configured. Set EVOLUTION_API_URL and EVOLUTION_API_KEY.',
        statusCode: 503,
      },
    });
  }

  // Domain errors thrown with a literal { statusCode, code, message } shape
  // by service layers (e.g. inbox/automation). Without this they fall through
  // to the 500 branch and get masked in production.
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    'code' in error &&
    typeof (error as { statusCode: unknown }).statusCode === 'number'
  ) {
    const e = error as { statusCode: number; code: string; message: string };
    return reply
      .status(e.statusCode)
      .send({ error: { code: e.code, message: e.message, statusCode: e.statusCode } });
  }

  // Prisma known errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return reply.status(409).send({
        error: {
          code: 'DUPLICATE_ENTRY',
          message: 'A record with this value already exists.',
          statusCode: 409,
        },
      });
    }
    if (error.code === 'P2025') {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Record not found.', statusCode: 404 },
      });
    }
    return reply.status(400).send({
      error: { code: 'DB_ERROR', message: error.message, statusCode: 400 },
    });
  }

  // Validation errors (Zod / Fastify schema)
  if (error.statusCode === 400) {
    return reply.status(400).send({
      error: { code: 'VALIDATION_ERROR', message: error.message, statusCode: 400 },
    });
  }

  // Rate limit
  if (error.statusCode === 429) {
    return reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests.', statusCode: 429 },
    });
  }

  // Default: 500
  return reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred.'
          : error.message,
      statusCode: 500,
    },
  });
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  env: process.env.NODE_ENV ?? 'development',
}));

// Auth routes
app.register(authRoutes, { prefix: '/api/v1/auth' });

// Orders routes
app.register(ordersRoutes, { prefix: '/api/v1/orders' });

// Customers routes
app.register(customersRoutes, { prefix: '/api/v1/customers' });

// Products routes
app.register(productsRoutes, { prefix: '/api/v1/products' });

// Team routes (users, roles, assignment rules, commission)
app.register(teamRoutes, { prefix: '/api/v1' });

// Integrations (YouCan stores, imports, webhooks)
app.register(integrationsRoutes, { prefix: '/api/v1/integrations' });

// Assignment rule simulator — "what if 5 orders arrived now?"
app.get('/api/v1/assignment-rules/simulate', { preHandler: [verifyJWT] }, async (request, reply) => {
  const q = request.query as { count?: string };
  const count = Math.max(1, Math.min(50, Number(q.count ?? 5)));
  const sequence = await simulateAssign(count);
  return reply.send({ count, sequence });
});

// Online users — returns names so the presence strip can render them without
// waiting for a live `user:online` socket event.
app.get('/api/v1/users/online', { preHandler: [verifyJWT] }, async (_request, reply) => {
  const ids = getOnlineUserIds();
  if (ids.length === 0) {
    return reply.send({ onlineUserIds: [], users: [], count: 0 });
  }
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      avatarUrl: true,
      role: { select: { name: true, label: true } },
    },
  });
  const users = rows.map((u) => ({
    userId: u.id,
    name: u.name,
    avatarUrl: u.avatarUrl,
    roleName: u.role?.name ?? null,
  }));
  return reply.send({
    onlineUserIds: ids,
    users,
    count: ids.length,
  });
});

// Active agents (users with confirmation:view permission) — for assign picker
app.get('/api/v1/users/agents', { preHandler: [verifyJWT] }, async (_request, reply) => {
  const usersWithPerm = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { permissions: { some: { permission: { key: 'confirmation:view' } } } },
    },
    select: { id: true, name: true, email: true, role: { select: { name: true, label: true } } },
    orderBy: { name: 'asc' },
  });
  return reply.send({ data: usersWithPerm });
});

// Commission for current user — supports ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?all=true
app.get('/api/v1/users/me/commission', { preHandler: [verifyJWT] }, async (request, reply) => {
  const userId = request.user.sub;
  const q = request.query as Record<string, string | undefined>;

  const now = new Date();
  const isAllTime = q.all === 'true';
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = isAllTime ? null : q.from ? new Date(q.from) : startOfDay;
  const to = isAllTime
    ? null
    : q.to ? new Date(q.to) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Single source of truth — same helper powers the Team admin card.
  const c = await computeAgentCommission(userId, { from, to });

  return reply.send({
    deliveredCount: c.deliveredCount,
    paidCount: c.paidCount,
    pendingCount: c.pendingCount,
    onConfirmRate: c.onConfirmRate,
    onDeliverRate: c.onDeliverRate,
    paidTotal: c.paidTotal,
    pendingTotal: c.pendingTotal,
    unpaid: c.pendingTotal,
    total: c.total,
    allTime: isAllTime,
    period: from && to ? { from: from.toISOString(), to: to.toISOString() } : null,
  });
});

// Pipeline breakdown for current agent — delegates to the canonical helpers so
// the same numbers appear on this card, the Team admin card, and the Dashboard.
app.get('/api/v1/users/me/pipeline', { preHandler: [verifyJWT] }, async (request, reply) => {
  const userId = request.user.sub;

  const [breakdown, statsMap] = await Promise.all([
    computeStatusBreakdown({ agentIds: [userId] }),
    computeAgentStatsByIds([userId]),
  ]);

  const stats = statsMap.get(userId);
  return reply.send({
    todayCount: stats?.todayAssigned ?? 0,
    confirmation: breakdown.confirmation,
    shipping: breakdown.shipping,
  });
});

// ── KPI Dashboard — all metrics for the dashboard page in one response ───────
// Cached in Redis keyed by filter hash (30s TTL). Invalidated implicitly via TTL
// — order event socket emits trigger the frontend to re-request, and the fresh
// fetch bypasses cache within the same second thanks to short TTL alignment.
app.get('/api/v1/kpi/dashboard', { preHandler: [verifyJWT] }, async (request, reply) => {
  const q = request.query as Record<string, string | undefined>;
  const filters: OrderFilterParams = {
    agentIds: q.agentIds,
    productIds: q.productIds,
    cities: q.cities,
    confirmationStatuses: q.confirmationStatuses,
    shippingStatuses: q.shippingStatuses,
    sources: q.sources,
    dateFrom: q.dateFrom,
    dateTo: q.dateTo,
    search: q.search,
    isArchived: q.isArchived,
  };

  // Optional explicit "compare to" window for the KPI cards only. The rest of
  // the dashboard (trend, breakdowns) stays on the primary date range.
  const compare =
    q.compareFrom && q.compareTo ? { from: q.compareFrom, to: q.compareTo } : null;

  const cacheKey = `kpi:dashboard:${JSON.stringify({ ...filters, compare })}`;
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    return reply.send(JSON.parse(cached));
  }

  const [kpis, agents, topProducts, topCities, trend, breakdown] = await Promise.all([
    computeKPIsWithComparison(filters, compare),
    computeAgentPerformance(filters),
    computeTopProducts(filters, 5),
    computeTopCities(filters, 5),
    computeOrderTrend(filters),
    computeStatusBreakdown(filters),
  ]);

  const payload = { kpis, agents, topProducts, topCities, trend, breakdown };
  await redis.set(cacheKey, JSON.stringify(payload), 'EX', 30).catch(() => {});

  return reply.send(payload);
});

// Shipping cities (CRUD + CSV import). Lists active cities by default so the
// legacy `/shipping-cities` callers keep working unchanged.
app.register(shippingCitiesRoutes, { prefix: '/api/v1/shipping-cities' });

// Atelie — Employees, Attendance, Salary (Phase 14.A)
app.register(atelieRoutes, { prefix: '/api/v1/atelie' });

// Atelie — Raw material stock & movements (Phase 14.B)
app.register(atelieStockRoutes, { prefix: '/api/v1/atelie/materials' });

// Atelie — Fabric types & rolls (Phase 14.D). Separate from flat materials
// because each physical roll is distinct (width/length/price/date vary).
app.register(fabricRoutes, { prefix: '/api/v1/atelie/fabric' });

// Atelie — Team tasks Kanban (Phase 14.C). No permission gate — every logged-in
// user can create/see their own tasks and collaborate on shared ones.
app.register(atelieTasksRoutes, { prefix: '/api/v1/atelie/tasks' });

// Atelie — Product tests (prototypes) & Production runs (Phase 14.E).
app.register(atelieTestsRoutes, { prefix: '/api/v1/atelie/tests' });
app.register(atelieProductionRoutes, { prefix: '/api/v1/atelie/runs' });

// Analytics — KPIs/charts/reports for delivery, confirmation, profit.
app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

// Money — expenses, commission payments, delivery invoice reconciliation.
app.register(moneyRoutes, { prefix: '/api/v1/money' });

// Returns — physical verification of bounced-back orders.
app.register(returnsRoutes, { prefix: '/api/v1/returns' });

// Notifications — per-user bell feed (assignment, confirmed, etc).
app.register(notificationsRoutes, { prefix: '/api/v1/notifications' });

// Automation — WhatsApp message templates, logs, and system-sender selector.
app.register(automationRoutes, { prefix: '/api/v1/automation' });

// WhatsApp — Evolution session lifecycle + gateway webhook ingestion.
app.register(whatsappRoutes, { prefix: '/api/v1/whatsapp' });
app.register(inboxRoutes, { prefix: '/api/v1/whatsapp/inbox' });

// Admin — destructive ops (full CRM reset). Behind RBAC + typed code gate.
app.register(adminRoutes, { prefix: '/api/v1/admin' });

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001);

async function start() {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });

    // Attach Socket.IO to Fastify's HTTP server AFTER listen()
    initSocket(app);

    // Near-instant order sync — polls every 15s for new YouCan orders on every
    // connected store and broadcasts them to clients via socket.
    startOrderPoller();

    // Seed known shipping providers (Coliix, …) so the Integrations page has
    // rows to render from the first boot. No-op if rows already exist.
    listProvidersPublic().catch((err) => {
      app.log.warn({ err }, 'Failed to seed shipping providers');
    });

    // Fallback tracker — webhooks are the primary (instant) path; this sweeps
    // in-flight orders every 5 min in case a webhook is dropped.
    startColiixTracker();

    // Seed the current week's attendance rows for every active employee on
    // boot + hourly (covers Monday rollover without a separate scheduler).
    startAttendanceCron();

    // Automation — seed a disabled MessageTemplate row for every trigger so
    // the UI has something to render on first boot. Then ensure every
    // template has at least one catch-all rule (the dispatcher now fires
    // through AutomationRule rows instead of templates directly).
    ensureDefaultTemplates()
      .then(() => ensureFallbackRules())
      .catch((err) => {
        app.log.warn({ err }, 'Failed to seed automation templates / rules');
      });

    // Keep the admin role synced with the canonical permission list on every
    // boot. Covers new perm keys added post-launch (the seed script doesn't
    // auto-run on Railway deploys) and busts the RBAC cache for admin users.
    ensureAdminPermissions().catch((err) => {
      app.log.warn({ err }, 'Failed to sync admin permissions');
    });

    console.log(`🚀 Backend on http://localhost:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
