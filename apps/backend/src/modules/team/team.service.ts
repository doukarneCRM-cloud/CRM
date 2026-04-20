import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { getOnlineUserIds } from '../../shared/socket';
import { invalidateRbacForUser, invalidateRbacForUsers } from '../../shared/redis';
import {
  computeAgentStatsByIds,
  computeAgentCommissionByIds,
} from '../../utils/kpiCalculator';
import type {
  CreateUserInput,
  UpdateUserInput,
  UserQueryInput,
  CreateRoleInput,
  UpdateRoleInput,
  UpsertCommissionInput,
  UpdateAssignmentRuleInput,
} from './team.schema';

// ─────────────────────────────────────────────────────────────────────────────
//  Users
// ─────────────────────────────────────────────────────────────────────────────

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  avatarUrl: true,
  isActive: true,
  isOnline: true,
  lastSeenAt: true,
  createdAt: true,
  role: { select: { id: true, name: true, label: true } },
} as const;

interface CommissionTotals {
  earned: number;
  paid: number;
  unpaid: number;
}

interface PerfPoint {
  date: string; // YYYY-MM-DD
  orders: number;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Produce a 7-day performance strip (oldest → today). Missing days get 0.
 */
function build7DayStrip(
  agentId: string,
  rows: { agentId: string | null; createdAt: Date }[],
): PerfPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.agentId !== agentId) continue;
    const k = ymd(r.createdAt);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const out: PerfPoint[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = ymd(d);
    out.push({ date: k, orders: counts.get(k) ?? 0 });
  }
  return out;
}

/**
 * List team members with aggregated "today" stats, commission totals, and a
 * 7-day order-volume strip for the agent card sparkline.
 */
export async function listUsers(query: UserQueryInput) {
  const where: Prisma.UserWhereInput = {};
  if (query.search) {
    const q = query.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (query.roleId) where.roleId = query.roleId;
  if (query.isActive !== undefined) where.isActive = query.isActive;

  const users = await prisma.user.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    select: USER_SELECT,
  });

  const userIds = users.map((u) => u.id);

  // ── Date boundaries ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 6);

  // Stats AND commission now come from the same canonical helpers used by the
  // dashboard / reports / call-center. No more bespoke math in this module.
  const [statsByAgent, commissionByAgent, recentOrders] = await Promise.all([
    computeAgentStatsByIds(userIds),
    computeAgentCommissionByIds(userIds),
    prisma.order.findMany({
      where: { agentId: { in: userIds }, assignedAt: { gte: sevenDaysAgo } },
      select: { agentId: true, assignedAt: true },
    }),
  ]);

  const onlineIds = new Set(getOnlineUserIds());

  // 7-day strip keys off assignedAt (when the order landed with this agent),
  // matching the "agent's own workload" semantic used on the cards.
  const recentAssigned = recentOrders
    .filter((r): r is { agentId: string; assignedAt: Date } => r.assignedAt !== null)
    .map((r) => ({ agentId: r.agentId, createdAt: r.assignedAt }));

  return users.map((u) => {
    const s = statsByAgent.get(u.id) ?? {
      totalOrders: 0,
      confirmed: 0,
      delivered: 0,
      confirmationRate: 0,
      deliveryRate: 0,
      todayAssigned: 0,
    };
    const comm = commissionByAgent.get(u.id);
    const c: CommissionTotals = comm
      ? { earned: comm.total, paid: comm.paidTotal, unpaid: comm.pendingTotal }
      : { earned: 0, paid: 0, unpaid: 0 };
    return {
      ...u,
      isOnline: onlineIds.has(u.id),
      stats: {
        totalOrders: s.totalOrders,
        confirmed: s.confirmed,
        delivered: s.delivered,
        confirmationRate: s.confirmationRate,
        deliveryRate: s.deliveryRate,
        todayAssigned: s.todayAssigned,
      },
      commission: c,
      performance7d: build7DayStrip(u.id, recentAssigned),
    };
  });
}

export async function createUser(input: CreateUserInput) {
  // Role exists?
  const role = await prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } });
  if (!role) throw { statusCode: 400, code: 'INVALID_ROLE', message: 'Role not found' };

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw { statusCode: 409, code: 'DUPLICATE_EMAIL', message: 'A user with this email already exists' };
  }

  const passwordHash = await bcrypt.hash(input.password, 12);
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      avatarUrl: input.avatarUrl ?? null,
      roleId: input.roleId,
      passwordHash,
      isActive: true,
    },
    select: USER_SELECT,
  });
}

export async function updateUser(id: string, input: UpdateUserInput) {
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'User not found' };

  if (input.email) {
    const clash = await prisma.user.findFirst({
      where: { email: input.email, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      throw { statusCode: 409, code: 'DUPLICATE_EMAIL', message: 'This email is taken' };
    }
  }
  if (input.roleId) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId }, select: { id: true } });
    if (!role) throw { statusCode: 400, code: 'INVALID_ROLE', message: 'Role not found' };
  }

  const data: Prisma.UserUpdateInput = {
    name: input.name,
    email: input.email,
    phone: input.phone,
    avatarUrl: input.avatarUrl,
    isActive: input.isActive,
  };
  if (input.roleId) data.role = { connect: { id: input.roleId } };
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 12);

  const updated = await prisma.user.update({ where: { id }, data, select: USER_SELECT });

  // Role, password, or active-flag change → RBAC cache must drop
  if (input.roleId || input.password || input.isActive !== undefined) {
    await invalidateRbacForUser(id);
  }

  // Deactivation: unassign all pending orders from this agent
  if (input.isActive === false) {
    await prisma.order.updateMany({
      where: { agentId: id, isArchived: false, confirmationStatus: 'pending' },
      data: { agentId: null, assignedAt: null },
    });
  }

  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Roles
// ─────────────────────────────────────────────────────────────────────────────

export async function listRoles() {
  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
    include: {
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    label: r.label,
    permissionKeys: r.permissions.map((p) => p.permission.key),
    userCount: r._count.users,
    // Admin is system-protected: cannot rename, cannot remove all permissions
    isSystem: r.name === 'admin',
  }));
}

export async function listPermissions() {
  const perms = await prisma.permission.findMany({
    orderBy: { key: 'asc' },
    select: { key: true, label: true },
  });
  return perms;
}

async function syncRolePermissions(roleId: string, keys: string[]) {
  const perms = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true, key: true },
  });
  const permIds = perms.map((p) => p.id);

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    ...(permIds.length
      ? [
          prisma.rolePermission.createMany({
            data: permIds.map((permissionId) => ({ roleId, permissionId })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  // Drop cached permission snapshots for every user in this role.
  const affected = await prisma.user.findMany({
    where: { roleId },
    select: { id: true },
  });
  await invalidateRbacForUsers(affected.map((u) => u.id));
}

export async function createRole(input: CreateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { name: input.name } });
  if (existing) {
    throw { statusCode: 409, code: 'DUPLICATE_ROLE', message: 'A role with this name already exists' };
  }

  const role = await prisma.role.create({
    data: { name: input.name, label: input.label },
  });
  await syncRolePermissions(role.id, input.permissionKeys);
  return (await listRoles()).find((r) => r.id === role.id);
}

export async function updateRole(id: string, input: UpdateRoleInput) {
  const existing = await prisma.role.findUnique({ where: { id } });
  if (!existing) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Role not found' };

  // Admin role: cannot strip all perms (locks system)
  if (existing.name === 'admin' && input.permissionKeys && input.permissionKeys.length === 0) {
    throw {
      statusCode: 400,
      code: 'SYSTEM_ROLE_LOCKED',
      message: 'The admin role must retain at least one permission',
    };
  }

  if (input.label) {
    await prisma.role.update({ where: { id }, data: { label: input.label } });
  }
  if (input.permissionKeys) {
    await syncRolePermissions(id, input.permissionKeys);
  }
  return (await listRoles()).find((r) => r.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Commission rules (per-agent)
// ─────────────────────────────────────────────────────────────────────────────

export async function listCommissionRules() {
  const rules = await prisma.commissionRule.findMany();
  const byAgent = new Map<string, { onConfirm: number; onDeliver: number }>();
  for (const r of rules) {
    const e = byAgent.get(r.agentId) ?? { onConfirm: 0, onDeliver: 0 };
    if (r.type === 'onConfirm') e.onConfirm = r.value;
    if (r.type === 'onDeliver') e.onDeliver = r.value;
    byAgent.set(r.agentId, e);
  }
  return Array.from(byAgent.entries()).map(([agentId, rates]) => ({ agentId, ...rates }));
}

export async function upsertCommissionRule(agentId: string, input: UpsertCommissionInput) {
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Agent not found' };

  await prisma.$transaction([
    prisma.commissionRule.deleteMany({ where: { agentId } }),
    prisma.commissionRule.createMany({
      data: [
        { agentId, type: 'onConfirm', value: input.onConfirm },
        { agentId, type: 'onDeliver', value: input.onDeliver },
      ],
    }),
  ]);
  return { agentId, onConfirm: input.onConfirm, onDeliver: input.onDeliver };
}

/**
 * Mark all unpaid delivered-commission orders for an agent as paid. Returns
 * the count + total amount that was just paid out.
 *
 * Before flipping the flag we backfill `commissionAmount` on delivered orders
 * that have NULL (e.g. delivered before any rule existed) — otherwise those
 * rows would be excluded forever and the agent would never get paid for them.
 */
export async function payoutAgentCommission(agentId: string) {
  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { id: true } });
  if (!agent) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Agent not found' };

  const rules = await prisma.commissionRule.findMany({
    where: { agentId },
    select: { type: true, value: true },
  });
  const perOrderRate = rules.reduce(
    (acc, r) => acc + (r.type === 'onConfirm' || r.type === 'onDeliver' ? r.value : 0),
    0,
  );

  if (perOrderRate > 0) {
    // Backfill legacy rows so the ledger matches the displayed unpaid total.
    await prisma.order.updateMany({
      where: {
        agentId,
        shippingStatus: 'delivered',
        commissionAmount: null,
        isArchived: false,
      },
      data: { commissionAmount: perOrderRate },
    });
  }

  const unpaid = await prisma.order.findMany({
    where: { agentId, commissionPaid: false, commissionAmount: { not: null } },
    select: { commissionAmount: true },
  });

  const count = unpaid.length;
  const amount = unpaid.reduce((sum, o) => sum + (o.commissionAmount ?? 0), 0);

  if (count > 0) {
    await prisma.order.updateMany({
      where: { agentId, commissionPaid: false, commissionAmount: { not: null } },
      data: { commissionPaid: true, commissionPaidAt: new Date() },
    });
  }

  return { count, amount: Math.round(amount * 100) / 100 };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assignment rule (global)
//  Stored in the Setting table under keys "assignment.*" since it's a single-
//  row singleton, and the schema's AssignmentRule model models per-city rules
//  (different semantics).
// ─────────────────────────────────────────────────────────────────────────────

const ASSIGN_KEYS = {
  isActive:    'assignment.isActive',
  strategy:    'assignment.strategy',
  bounceCount: 'assignment.bounceCount',
} as const;

const ASSIGN_DEFAULTS = {
  isActive: true,
  strategy: 'round_robin' as const,
  bounceCount: 1,
};

export interface AssignmentRuleState {
  isActive: boolean;
  strategy: 'round_robin' | 'by_product';
  bounceCount: number;
}

export async function getAssignmentRule(): Promise<AssignmentRuleState> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(ASSIGN_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const rawStrategy = map.get(ASSIGN_KEYS.strategy) ?? ASSIGN_DEFAULTS.strategy;
  const strategy: AssignmentRuleState['strategy'] =
    rawStrategy === 'by_product' ? 'by_product' : 'round_robin';

  return {
    isActive: (map.get(ASSIGN_KEYS.isActive) ?? String(ASSIGN_DEFAULTS.isActive)) === 'true',
    strategy,
    bounceCount: Number(map.get(ASSIGN_KEYS.bounceCount) ?? ASSIGN_DEFAULTS.bounceCount),
  };
}

export async function updateAssignmentRule(
  input: UpdateAssignmentRuleInput,
): Promise<AssignmentRuleState> {
  const writes: Prisma.PrismaPromise<unknown>[] = [];
  if (input.isActive !== undefined) {
    writes.push(
      prisma.setting.upsert({
        where: { key: ASSIGN_KEYS.isActive },
        update: { value: String(input.isActive) },
        create: { key: ASSIGN_KEYS.isActive, value: String(input.isActive) },
      }),
    );
  }
  if (input.strategy) {
    writes.push(
      prisma.setting.upsert({
        where: { key: ASSIGN_KEYS.strategy },
        update: { value: input.strategy },
        create: { key: ASSIGN_KEYS.strategy, value: input.strategy },
      }),
    );
  }
  if (input.bounceCount !== undefined) {
    writes.push(
      prisma.setting.upsert({
        where: { key: ASSIGN_KEYS.bounceCount },
        update: { value: String(input.bounceCount) },
        create: { key: ASSIGN_KEYS.bounceCount, value: String(input.bounceCount) },
      }),
    );
  }
  if (writes.length) await prisma.$transaction(writes);

  return getAssignmentRule();
}
