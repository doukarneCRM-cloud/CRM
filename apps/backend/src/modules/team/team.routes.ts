import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as ctrl from './team.controller';

type WithId = { Params: { id: string } };
type WithAgentId = { Params: { agentId: string } };

export async function teamRoutes(app: FastifyInstance) {
  // ── Users ────────────────────────────────────────────────────────────────
  app.get('/users', { preHandler: [verifyJWT, requirePermission('team:view')] }, ctrl.listUsers);

  app.post('/users', { preHandler: [verifyJWT, requirePermission('team:create')] }, ctrl.createUser);

  app.patch<WithId>(
    '/users/:id',
    { preHandler: [verifyJWT, requirePermission('team:edit')] },
    ctrl.updateUser,
  );

  // ── Roles ────────────────────────────────────────────────────────────────
  app.get('/roles', { preHandler: [verifyJWT, requirePermission('team:view')] }, ctrl.listRoles);

  app.get(
    '/permissions',
    { preHandler: [verifyJWT, requirePermission('team:view')] },
    ctrl.listPermissions,
  );

  app.post(
    '/roles',
    { preHandler: [verifyJWT, requirePermission('team:manage_roles')] },
    ctrl.createRole,
  );

  app.patch<WithId>(
    '/roles/:id',
    { preHandler: [verifyJWT, requirePermission('team:manage_roles')] },
    ctrl.updateRole,
  );

  // ── Commission ───────────────────────────────────────────────────────────
  app.get(
    '/commission-rules',
    { preHandler: [verifyJWT, requirePermission('team:view')] },
    ctrl.listCommission,
  );

  app.put<WithAgentId>(
    '/commission-rules/:agentId',
    { preHandler: [verifyJWT, requirePermission('team:manage_roles')] },
    ctrl.upsertCommission,
  );

  app.post<WithAgentId>(
    '/commission-rules/:agentId/payout',
    { preHandler: [verifyJWT, requirePermission('team:manage_roles')] },
    ctrl.payoutCommission,
  );

  // ── Assignment rule ──────────────────────────────────────────────────────
  app.get(
    '/assignment-rules',
    { preHandler: [verifyJWT, requirePermission('team:view')] },
    ctrl.getAssignmentRule,
  );

  app.patch(
    '/assignment-rules',
    { preHandler: [verifyJWT, requirePermission('team:manage_roles')] },
    ctrl.updateAssignmentRule,
  );
}
