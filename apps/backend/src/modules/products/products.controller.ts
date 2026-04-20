import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from './products.service';
import { validateBody, validateQuery } from '../../shared/validate';
import { replyError } from '../../shared/replyError';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ProductQuerySchema,
  UpdateStockSchema,
} from './products.schema';

export async function listProducts(request: FastifyRequest, reply: FastifyReply) {
  const data = validateQuery(reply, ProductQuerySchema, request.query);
  if (!data) return reply;
  return reply.send(await svc.listProducts(data));
}

export async function showProduct(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    return reply.send(await svc.getProductById(request.params.id));
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function createProduct(request: FastifyRequest, reply: FastifyReply) {
  const data = validateBody(reply, CreateProductSchema, request.body);
  if (!data) return reply;
  try {
    const product = await svc.createProduct(data);
    return reply.status(201).send(product);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function updateProduct(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, UpdateProductSchema, request.body);
  if (!data) return reply;
  try {
    const product = await svc.updateProduct(request.params.id, data);
    return reply.send(product);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function deactivateProduct(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  try {
    const product = await svc.deactivateProduct(request.params.id);
    return reply.send(product);
  } catch (err) {
    return replyError(reply, err);
  }
}

export async function updateVariantStock(
  request: FastifyRequest<{ Params: { id: string; vid: string } }>,
  reply: FastifyReply,
) {
  const data = validateBody(reply, UpdateStockSchema, request.body);
  if (!data) return reply;
  try {
    const variant = await svc.updateVariantStock(request.params.id, request.params.vid, data);
    return reply.send(variant);
  } catch (err) {
    return replyError(reply, err);
  }
}
