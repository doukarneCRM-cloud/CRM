import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import { resetCRM, getResetCode } from './admin.service';

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
  app.post<{ Body: { confirmationCode?: string } }>(
    '/reset-crm',
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

      const summary = await resetCRM(confirmationCode);
      return reply.send({ ok: true, summary });
    },
  );
}
