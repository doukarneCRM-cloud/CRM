import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  ToggleDaySchema,
  PaySalarySchema,
  UpdateSalaryExtrasSchema,
} from './atelie.schema';
import * as employees from './employees.service';
import * as attendance from './attendance.service';
import * as salary from './salary.service';

export async function atelieRoutes(app: FastifyInstance) {
  // ── Employees ────────────────────────────────────────────────────────────
  app.get(
    '/employees',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { activeOnly?: string };
      const activeOnly = q.activeOnly !== 'false';
      const rows = await employees.listEmployees({ activeOnly });
      return reply.send({ data: rows });
    },
  );

  app.post(
    '/employees',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = CreateEmployeeSchema.parse(req.body);
      const created = await employees.createEmployee(input);
      return reply.status(201).send(created);
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/employees/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = UpdateEmployeeSchema.parse(req.body);
      const updated = await employees.updateEmployee(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/employees/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      await employees.deactivateEmployee(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/employees/:id/kpis',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const kpis = await employees.getEmployeeKpis(req.params.id);
      return reply.send(kpis);
    },
  );

  // ── Attendance ───────────────────────────────────────────────────────────
  app.get(
    '/attendance',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { weekStart?: string };
      const weekStart = q.weekStart ?? new Date().toISOString();
      const grid = await attendance.getWeeklyGrid(weekStart);
      return reply.send({ weekStart, data: grid });
    },
  );

  app.post(
    '/attendance/toggle',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = ToggleDaySchema.parse(req.body);
      const result = await attendance.toggleAttendanceDay(input, req.user.sub);
      return reply.send(result);
    },
  );

  // ── Salary ───────────────────────────────────────────────────────────────
  app.get(
    '/salary',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { weekStart?: string };
      const weekStart = q.weekStart ?? new Date().toISOString();
      const rows = await salary.listWeekSalaries(weekStart);
      return reply.send({ weekStart, data: rows });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/salary/:id/pay',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = PaySalarySchema.parse(req.body);
      const updated = await salary.paySalary(req.params.id, input, req.user.sub);
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/salary/:id/unpay',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const updated = await salary.unpaySalary(req.params.id);
      return reply.send(updated);
    },
  );

  // Pay-envelope extras: commission, supplement hours, freeform note. The
  // (+) button on each row opens a modal that posts here. Editable any
  // time, regardless of paid state — the label printer reads these too.
  app.patch<{ Params: { id: string } }>(
    '/salary/:id/extras',
    { preHandler: [verifyJWT, requirePermission('atelie:manage')] },
    async (req, reply) => {
      const input = UpdateSalaryExtrasSchema.parse(req.body);
      const updated = await salary.updateSalaryExtras(req.params.id, input);
      return reply.send(updated);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/salary/history/:id',
    { preHandler: [verifyJWT, requirePermission('atelie:view')] },
    async (req, reply) => {
      const q = req.query as { limit?: string };
      const limit = q.limit ? Math.max(1, Math.min(52, Number(q.limit))) : 12;
      const rows = await salary.getEmployeeSalaryHistory(req.params.id, limit);
      return reply.send({ data: rows });
    },
  );
}
