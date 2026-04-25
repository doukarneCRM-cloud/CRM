import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  CreateUserSchema, UpdateUserSchema, UserQuerySchema,
  CreateRoleSchema, UpdateRoleSchema,
  UpsertCommissionSchema,
  UpdateAssignmentRuleSchema,
} from './team.schema';
import * as svc from './team.service';

// ── Users ────────────────────────────────────────────────────────────────────

export async function listUsers(request: FastifyRequest, reply: FastifyReply) {
  const query = UserQuerySchema.parse(request.query);
  const data = await svc.listUsers(query);
  return reply.send({ data });
}

export async function createUser(request: FastifyRequest, reply: FastifyReply) {
  const input = CreateUserSchema.parse(request.body);
  const user = await svc.createUser(input);
  return reply.status(201).send(user);
}

export async function updateUser(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input = UpdateUserSchema.parse(request.body);
  const user = await svc.updateUser(request.params.id, input);
  return reply.send(user);
}

// ── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(_request: FastifyRequest, reply: FastifyReply) {
  const data = await svc.listRoles();
  return reply.send({ data });
}

export async function listPermissions(_request: FastifyRequest, reply: FastifyReply) {
  const data = await svc.listPermissions();
  return reply.send({ data });
}

export async function createRole(request: FastifyRequest, reply: FastifyReply) {
  const input = CreateRoleSchema.parse(request.body);
  const role = await svc.createRole(input);
  return reply.status(201).send(role);
}

export async function updateRole(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) {
  const input = UpdateRoleSchema.parse(request.body);
  const role = await svc.updateRole(request.params.id, input);
  return reply.send(role);
}

// ── Commission ───────────────────────────────────────────────────────────────

export async function listCommission(_request: FastifyRequest, reply: FastifyReply) {
  const data = await svc.listCommissionRules();
  return reply.send({ data });
}

export async function upsertCommission(
  request: FastifyRequest<{ Params: { agentId: string } }>,
  reply: FastifyReply,
) {
  const input = UpsertCommissionSchema.parse(request.body);
  const rule = await svc.upsertCommissionRule(request.params.agentId, input);
  return reply.send(rule);
}

export async function payoutCommission(
  request: FastifyRequest<{ Params: { agentId: string } }>,
  reply: FastifyReply,
) {
  const result = await svc.payoutAgentCommission(request.params.agentId);
  return reply.send(result);
}

// ── Assignment rule ──────────────────────────────────────────────────────────

export async function getAssignmentRule(_request: FastifyRequest, reply: FastifyReply) {
  const rule = await svc.getAssignmentRule();
  return reply.send(rule);
}

export async function updateAssignmentRule(request: FastifyRequest, reply: FastifyReply) {
  const input = UpdateAssignmentRuleSchema.parse(request.body);
  const rule = await svc.updateAssignmentRule(input);
  return reply.send(rule);
}

export async function listAssignmentCandidates(_request: FastifyRequest, reply: FastifyReply) {
  const data = await svc.listAssignmentCandidates();
  return reply.send({ data });
}
