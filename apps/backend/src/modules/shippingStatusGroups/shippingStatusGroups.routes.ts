import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as svc from './shippingStatusGroups.service';
import {
  CreateGroupSchema,
  UpdateGroupSchema,
  ReorderGroupsSchema,
} from './shippingStatusGroups.schema';

export async function shippingStatusGroupsRoutes(app: FastifyInstance) {
  // Anyone who can see orders can read groups — they affect how the Call
  // Center pill row renders for every operator. Mutation routes below are
  // gated by the dedicated `shipping_groups:manage` permission so a non-admin
  // can't reshape the shared bucket layout.
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('orders:view')] },
    async (_req, reply) => {
      const groups = await svc.listGroups();
      return reply.send({ data: groups });
    },
  );

  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('shipping_groups:manage')] },
    async (req, reply) => {
      const input = CreateGroupSchema.parse(req.body);
      const group = await svc.createGroup(input, req.user.sub);
      return reply.status(201).send(group);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('shipping_groups:manage')] },
    async (req, reply) => {
      const input = UpdateGroupSchema.parse(req.body);
      const group = await svc.updateGroup(req.params.id, input);
      return reply.send(group);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('shipping_groups:manage')] },
    async (req, reply) => {
      await svc.deleteGroup(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.put(
    '/reorder',
    { preHandler: [verifyJWT, requirePermission('shipping_groups:manage')] },
    async (req, reply) => {
      const input = ReorderGroupsSchema.parse(req.body);
      const groups = await svc.reorderGroups(input);
      return reply.send({ data: groups });
    },
  );
}
