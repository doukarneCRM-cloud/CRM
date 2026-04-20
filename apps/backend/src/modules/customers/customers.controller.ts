import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './customers.service';
import {
  CreateCustomerSchema,
  UpdateCustomerSchema,
  CustomerQuerySchema,
  HistoryQuerySchema,
} from './customers.schema';
import { validateBody, validateQuery } from '../../shared/validate';
import { replyError } from '../../shared/replyError';

// ─── GET /customers ───────────────────────────────────────────────────────────
export async function listCustomers(request: FastifyRequest, reply: FastifyReply) {
  const data = validateQuery(reply, CustomerQuerySchema, request.query);
  if (!data) return reply;
  const result = await svc.getCustomers(data);
  return reply.send(result);
}

// ─── GET /customers/:id ───────────────────────────────────────────────────────
export async function showCustomer(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const customer = await svc.getCustomerById(request.params.id);
    return reply.send(customer);
  } catch (err) {
    return replyError(reply, err);
  }
}

// ─── POST /customers ──────────────────────────────────────────────────────────
export async function createCustomer(request: FastifyRequest, reply: FastifyReply) {
  const data = validateBody(reply, CreateCustomerSchema, request.body);
  if (!data) return reply;
  try {
    const customer = await svc.createCustomer(data);
    return reply.status(201).send(customer);
  } catch (err) {
    return replyError(reply, err);
  }
}

// ─── PATCH /customers/:id ─────────────────────────────────────────────────────
export async function updateCustomer(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, UpdateCustomerSchema, request.body);
  if (!data) return reply;
  try {
    const customer = await svc.updateCustomer(request.params.id, data);
    return reply.send(customer);
  } catch (err) {
    return replyError(reply, err);
  }
}

// ─── GET /customers/:id/history ───────────────────────────────────────────────
export async function showCustomerHistory(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const query = validateQuery(reply, HistoryQuerySchema, request.query);
  if (!query) return reply;
  try {
    const result = await svc.getCustomerHistory(request.params.id, query);
    return reply.send(result);
  } catch (err) {
    return replyError(reply, err);
  }
}
