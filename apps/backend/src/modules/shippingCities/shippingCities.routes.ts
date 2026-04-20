import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './shippingCities.service';
import {
  CreateCitySchema,
  UpdateCitySchema,
  CsvImportSchema,
} from './shippingCities.schema';

export async function shippingCitiesRoutes(app: FastifyInstance) {
  // Any authenticated user can read active cities — they're needed for the
  // order form's city validation. Admin-only mutations below.
  app.get('/', { preHandler: [verifyJWT] }, async (req, reply) => {
    const q = req.query as { activeOnly?: string };
    const activeOnly = q.activeOnly !== 'false';
    const cities = await svc.listCities({ activeOnly });
    return reply.send({ data: cities });
  });

  app.post('/', { preHandler: [verifyJWT, requirePermission('settings:edit')] }, async (req, reply) => {
    const input = CreateCitySchema.parse(req.body);
    const city = await svc.createCity(input);
    return reply.status(201).send(city);
  });

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('settings:edit')] },
    async (req, reply) => {
      const { id } = req.params;
      const input = UpdateCitySchema.parse(req.body);
      const city = await svc.updateCity(id, input);
      return reply.send(city);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('settings:edit')] },
    async (req, reply) => {
      await svc.deleteCity(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.post('/import', { preHandler: [verifyJWT, requirePermission('settings:edit')] }, async (req, reply) => {
    const input = CsvImportSchema.parse(req.body);
    const result = await svc.importCities(input);
    return reply.send(result);
  });
}
