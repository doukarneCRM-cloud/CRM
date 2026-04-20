import type { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../prisma';
import { getCachedRbac, setCachedRbac, type CachedRbac } from '../redis';

async function loadRbac(userId: string): Promise<CachedRbac | null> {
  const cached = await getCachedRbac(userId);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user) return null;

  const snapshot: CachedRbac = {
    isActive: user.isActive,
    roleId: user.roleId,
    roleName: user.role.name,
    name: user.name,
    email: user.email,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };
  await setCachedRbac(userId, snapshot);
  return snapshot;
}

function unauthorized(reply: FastifyReply) {
  return reply.status(401).send({
    error: { code: 'UNAUTHORIZED', message: 'Not authenticated', statusCode: 401 },
  });
}

function inactive(reply: FastifyReply) {
  return reply.status(403).send({
    error: { code: 'FORBIDDEN', message: 'Account inactive', statusCode: 403 },
  });
}

function forbidden(reply: FastifyReply, message: string) {
  return reply.status(403).send({
    error: { code: 'INSUFFICIENT_PERMISSIONS', message, statusCode: 403 },
  });
}

export function requirePermission(permissionKey: string) {
  return async function checkPermission(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.sub;
    if (!userId) return unauthorized(reply);

    const rbac = await loadRbac(userId);
    if (!rbac || !rbac.isActive) return inactive(reply);

    if (!rbac.permissions.includes(permissionKey)) {
      return forbidden(reply, `Permission required: ${permissionKey}`);
    }
  };
}

export function requireAnyPermission(...permissionKeys: string[]) {
  return async function checkAnyPermission(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.sub;
    if (!userId) return unauthorized(reply);

    const rbac = await loadRbac(userId);
    if (!rbac || !rbac.isActive) return inactive(reply);

    const hasAny = permissionKeys.some((p) => rbac.permissions.includes(p));
    if (!hasAny) {
      return forbidden(reply, `One of these permissions required: ${permissionKeys.join(', ')}`);
    }
  };
}
