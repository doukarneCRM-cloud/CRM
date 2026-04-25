import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import { resetCRM, resetOrdersAndCustomers, getResetCode } from './admin.service';

export async function adminRoutes(app: FastifyInstance) {
  // Returns the current confirmation code to authorized users so the UI can
  // show users what to type without the string being baked into the bundle.
  // Same permission gate as the destructive endpoint — anyone who can reset
  // can see the code.
  app.get(
    '/reset-code',
    { preHandler: [verifyJWT, requirePermission('settings:reset_crm')] },
    async (_request, reply) => {
      return reply.send({ code: getResetCode() });
    },
  );

  // Destructive — nukes every business-data table while preserving auth,
  // roles, and the current user. Gated by both the `settings:reset_crm`
  // permission and a typed confirmation code validated server-side.
  //
  // Pass `wipeOtherUsers: true` to also delete every user account except
  // the actor — useful for "go-live from scratch" prep where the admin
  // wants to start with a clean roster and re-create agents from zero.
  app.post<{
    Body: { confirmationCode?: string; wipeOtherUsers?: boolean };
  }>(
    '/reset-crm',
    { preHandler: [verifyJWT, requirePermission('settings:reset_crm')] },
    async (request, reply) => {
      const { confirmationCode, wipeOtherUsers } = request.body ?? {};
      if (typeof confirmationCode !== 'string' || confirmationCode.length === 0) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_BODY',
            message: 'confirmationCode is required',
            statusCode: 400,
          },
        });
      }

      const summary = await resetCRM(confirmationCode, {
        keepUserId: wipeOtherUsers ? request.user.sub : undefined,
      });
      return reply.send({ ok: true, summary });
    },
  );

  // Targeted wipe — clears only orders, customers, and the rows that
  // reference them. Same `settings:reset_crm` permission and same typed
  // confirmation code as the full reset. Used when an integration
  // auto-imported data the admin didn't expect.
  app.post<{ Body: { confirmationCode?: string } }>(
    '/reset-orders-customers',
    { preHandler: [verifyJWT, requirePermission('settings:reset_crm')] },
    async (request, reply) => {
      const { confirmationCode } = request.body ?? {};
      if (typeof confirmationCode !== 'string' || confirmationCode.length === 0) {
        return reply.status(400).send({
          error: {
            code: 'INVALID_BODY',
            message: 'confirmationCode is required',
            statusCode: 400,
          },
        });
      }

      const summary = await resetOrdersAndCustomers(confirmationCode);
      return reply.send({ ok: true, summary });
    },
  );
}
