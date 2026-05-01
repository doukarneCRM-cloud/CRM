import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import type { OrderFilterParams } from '../../utils/filterBuilder';
import {
  computeDeliveryTab,
  computeConfirmationTab,
  computeProfitTab,
} from './analytics.service';

function pickFilters(query: Record<string, string | undefined>): OrderFilterParams {
  return {
    agentIds: query.agentIds,
    productIds: query.productIds,
    cities: query.cities,
    confirmationStatuses: query.confirmationStatuses,
    shippingStatuses: query.shippingStatuses,
    sources: query.sources,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    search: query.search,
    isArchived: query.isArchived,
  };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.get(
    '/delivery',
    { preHandler: [verifyJWT, requirePermission('analytics:view')] },
    async (request, reply) => {
      const filters = pickFilters(request.query as Record<string, string | undefined>);
      const payload = await computeDeliveryTab(filters);
      return reply.send(payload);
    },
  );

  app.get(
    '/confirmation',
    { preHandler: [verifyJWT, requirePermission('analytics:view')] },
    async (request, reply) => {
      const filters = pickFilters(request.query as Record<string, string | undefined>);
      const payload = await computeConfirmationTab(filters);
      return reply.send(payload);
    },
  );

  app.get(
    '/profit',
    { preHandler: [verifyJWT, requirePermission('analytics:view')] },
    async (request, reply) => {
      const filters = pickFilters(request.query as Record<string, string | undefined>);
      const payload = await computeProfitTab(filters);
      return reply.send(payload);
    },
  );
}
