/**
 * Dashboard routes — one endpoint per card so the frontend can refetch
 * surgically on the right socket events without re-loading the entire
 * dashboard payload.
 *
 * Every endpoint accepts the canonical OrderFilterParams query string the
 * rest of the CRM uses (agentIds, cities, productIds, confirmationStatuses,
 * shippingStatuses, sources, dateFrom, dateTo). When omitted, results are
 * computed all-time.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import type { OrderFilterParams } from '../../utils/filterBuilder';
import {
  computeOrdersCard,
  computeRatesCard,
  computeMergedCard,
  computeRevenueCard,
  computeUnpaidCommissionCard,
  computeAwaitingReturnsCard,
  computeTrend,
  computeConfirmationDonut,
  computeAgentPipeline,
  computeProductPipeline,
} from './dashboard.service';

function pickFilters(req: FastifyRequest): OrderFilterParams {
  const q = req.query as Record<string, string | undefined>;
  return {
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
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get(
    '/orders',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeOrdersCard(pickFilters(req))),
  );

  app.get(
    '/rates',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeRatesCard(pickFilters(req))),
  );

  app.get(
    '/merged',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeMergedCard(pickFilters(req))),
  );

  app.get(
    '/revenue',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeRevenueCard(pickFilters(req))),
  );

  app.get(
    '/commission-unpaid',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeUnpaidCommissionCard(pickFilters(req))),
  );

  app.get(
    '/returns-awaiting',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send(await computeAwaitingReturnsCard(pickFilters(req))),
  );

  app.get(
    '/trend',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const days = Math.min(60, Math.max(7, Number(q.days ?? 14)));
      reply.send({ days, points: await computeTrend(days, pickFilters(req)) });
    },
  );

  app.get(
    '/donut',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      reply.send(await computeConfirmationDonut(pickFilters(req), q.donutAgentId ?? null));
    },
  );

  app.get(
    '/pipeline-agents',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => reply.send({ data: await computeAgentPipeline(pickFilters(req)) }),
  );

  app.get(
    '/pipeline-products',
    { preHandler: [verifyJWT, requirePermission('dashboard:view')] },
    async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const limit = Math.min(50, Math.max(5, Number(q.limit ?? 20)));
      reply.send({ data: await computeProductPipeline(limit, pickFilters(req)) });
    },
  );
}
