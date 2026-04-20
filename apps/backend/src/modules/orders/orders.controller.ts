import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './orders.service';
import { validateBody, validateQuery } from '../../shared/validate';
import { replyError } from '../../shared/replyError';
import {
  CreateOrderSchema,
  UpdateOrderSchema,
  UpdateStatusSchema,
  AssignOrderSchema,
  BulkActionSchema,
  OrderQuerySchema,
  MergeOrdersSchema,
} from './orders.schema';

export async function listOrders(request: FastifyRequest, reply: FastifyReply) {
  const data = validateQuery(reply, OrderQuerySchema, request.query);
  if (!data) return reply;
  return reply.send(await svc.getOrders(data));
}

export async function showOrder(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
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
