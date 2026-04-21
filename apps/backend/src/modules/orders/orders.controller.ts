import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './orders.service';
import { validateBody, validateQuery } from '../../shared/validate';
import { replyError } from '../../shared/replyError';
import { getUserPermissions } from '../../shared/middleware/rbac.middleware';
import { prisma } from '../../shared/prisma';
import {
  CreateOrderSchema,
  UpdateOrderSchema,
  UpdateStatusSchema,
  AssignOrderSchema,
  BulkActionSchema,
  OrderQuerySchema,
  MergeOrdersSchema,
} from './orders.schema';

/**
 * Returns the agentId the request must be scoped to — or null when the user
 * has full `orders:view` and can see everything.
 *
 * Agents granted only `call_center:view` may list/show their own orders; they
 * must not be able to peek at other agents' queues even by crafting a query
 * param or GET /orders/:id with someone else's id.
 */
async function getCallCenterScope(request: FastifyRequest): Promise<string | null> {
  const userId = request.user?.sub;
  if (!userId) return null;
  const perms = await getUserPermissions(userId);
  if (perms.has('orders:view')) return null;
  if (perms.has('call_center:view')) return userId;
  return null;
}

export async function listOrders(request: FastifyRequest, reply: FastifyReply) {
  const data = validateQuery(reply, OrderQuerySchema, request.query);
  if (!data) return reply;
  const scope = await getCallCenterScope(request);
  if (scope) data.agentIds = scope;
  return reply.send(await svc.getOrders(data));
}

export async function showOrder(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const scope = await getCallCenterScope(request);
    if (scope) {
      const own = await prisma.order.findFirst({
        where: { id: request.params.id, agentId: scope },
        select: { id: true },
      });
      if (!own) {
        return reply.status(403).send({
          error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Order is not assigned to you', statusCode: 403 },
        });
      }
    }
    return reply.send(await svc.getOrderById(request.params.id));
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function showOrderLogs(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const scope = await getCallCenterScope(request);
    if (scope) {
      const own = await prisma.order.findFirst({
        where: { id: request.params.id, agentId: scope },
        select: { id: true },
      });
      if (!own) {
        return reply.status(403).send({
          error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Order is not assigned to you', statusCode: 403 },
        });
      }
    }
    const logs = await svc.getOrderLogs(request.params.id);
    return reply.send({ data: logs });
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function createOrder(request: FastifyRequest, reply: FastifyReply) {
  const data = validateBody(reply, CreateOrderSchema, request.body);
  if (!data) return reply;
  try {
    const order = await svc.createOrder(data, request.user);
    return reply.status(201).send(order);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function updateOrder(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, UpdateOrderSchema, request.body);
  if (!data) return reply;
  try {
    const scope = await getCallCenterScope(request);
    if (scope) {
      const own = await prisma.order.findFirst({
        where: { id: request.params.id, agentId: scope },
        select: { id: true },
      });
      if (!own) {
        return reply.status(403).send({
          error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Order is not assigned to you', statusCode: 403 },
        });
      }
    }
    const order = await svc.updateOrder(request.params.id, data, request.user);
    return reply.send(order);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function deleteOrder(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    await svc.archiveOrder(request.params.id, request.user);
    return reply.status(204).send();
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function updateStatus(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, UpdateStatusSchema, request.body);
  if (!data) return reply;
  try {
    const scope = await getCallCenterScope(request);
    if (scope) {
      const own = await prisma.order.findFirst({
        where: { id: request.params.id, agentId: scope },
        select: { id: true },
      });
      if (!own) {
        return reply.status(403).send({
          error: { code: 'INSUFFICIENT_PERMISSIONS', message: 'Order is not assigned to you', statusCode: 403 },
        });
      }
    }
    const order = await svc.updateOrderStatus(request.params.id, data, request.user);
    return reply.send(order);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function assignOrder(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, AssignOrderSchema, request.body);
  if (!data) return reply;
  try {
    await svc.assignOrder(request.params.id, data, request.user);
    return reply.status(204).send();
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function ordersSummary(request: FastifyRequest, reply: FastifyReply) {
  const data = validateQuery(reply, OrderQuerySchema, request.query);
  if (!data) return reply;
  const scope = await getCallCenterScope(request);
  if (scope) data.agentIds = scope;
  return reply.send(await svc.getOrdersSummary(data));
}

export async function listDuplicates(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send(await svc.getDuplicatePendingOrders());
}

export async function mergeOrders(request: FastifyRequest, reply: FastifyReply) {
  const data = validateBody(reply, MergeOrdersSchema, request.body);
  if (!data) return reply;
  try {
    const order = await svc.mergeOrders(data, request.user);
    return reply.send(order);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function bulkAction(request: FastifyRequest, reply: FastifyReply) {
  const data = validateBody(reply, BulkActionSchema, request.body);
  if (!data) return reply;
  try {
    const result = await svc.bulkAction(data, request.user);
    return reply.send(result);
  } catch (err) {
    return replyError(reply, err);
  }
}
