import { prisma } from '../shared/prisma';
import { redis } from '../shared/redis';
import { emitToRoom } from '../shared/socket';
import { getAssignmentRule } from '../modules/team/team.service';

// ─── Redis lock ──────────────────────────────────────────────────────────────
// Distributed single-writer lock so concurrent order creates don't race past
// the round-robin counter (system design §11.3).

const LOCK_KEY = 'assignment:lock';
const LOCK_TTL_MS = 5_000;

async function acquireLock(timeoutMs = 3_000): Promise<string | null> {
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await redis.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX');
    if (result === 'OK') return token;
    // Poll at a non-hammering interval
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

async function releaseLock(token: string): Promise<void> {
  // Lua: delete only if our token still owns the key. Prevents blowing away
  // another process's lock if ours already expired.
  const script = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    end
    return 0
  `;
  await redis.eval(script, 1, LOCK_KEY, token).catch((err) => {
    console.warn('[autoAssign] releaseLock failed', err);
    return 0;
  });
}

// ─── Round-robin cursor ──────────────────────────────────────────────────────

const CURSOR_KEY = 'assignment:round_robin:cursor';
const STREAK_KEY = 'assignment:round_robin:streak';

interface Candidate {
  id: string;
  name: string;
}

/**
 * Agents eligible for auto-assignment.
 *
 * Two modes, picked by whether the admin set an allowlist:
 *
 *   1. Allowlist set (admin explicitly picked specific agents in the
 *      Eligible-agents picker). Honor that set in full — every active
 *      agent on the list participates in the rotation regardless of
 *      online status. The admin already said "these are the agents",
 *      so secretly skipping the offline ones makes the rotation
 *      unpredictable (e.g. a 2-agent allowlist where only one is
 *      currently online would funnel every order to that one agent
 *      until the other came back).
 *
 *   2. Allowlist empty (back-compat broad pool — everyone with
 *      confirmation:view). Prefer agents currently online so handoffs
 *      track shifts; fall back to the full active pool if nobody is
 *      online — better to assign than to drop orders on the floor.
 *
 * Both modes still require `isActive: true` and the confirmation:view
 * permission, so a deactivated user or one whose role lost the
 * permission silently drops out of the rotation either way.
 */
async function eligibleAgents(allowlist: string[] = []): Promise<Candidate[]> {
  if (allowlist.length > 0) {
    return prisma.user.findMany({
      where: {
        id: { in: allowlist },
        isActive: true,
        role: { permissions: { some: { permission: { key: 'confirmation:view' } } } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  const online = await prisma.user.findMany({
    where: {
      isActive: true,
      isOnline: true,
      role: { permissions: { some: { permission: { key: 'confirmation:view' } } } },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (online.length > 0) return online;

  return prisma.user.findMany({
    where: {
      isActive: true,
      role: { permissions: { some: { permission: { key: 'confirmation:view' } } } },
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Round-robin with bounceCount: the cursor stays on the same agent until
 * they've received `bounceCount` orders, then rotates to the next one.
 */
async function pickRoundRobin(agents: Candidate[], bounceCount: number): Promise<Candidate> {
  const cursorStr = await redis.get(CURSOR_KEY);
  const streakStr = await redis.get(STREAK_KEY);

  let cursorId = cursorStr;
  let streak = Number(streakStr ?? 0);

  const cursorIdx = cursorId ? agents.findIndex((a) => a.id === cursorId) : -1;
  let idx = cursorIdx >= 0 ? cursorIdx : 0;

  // Rotate if current agent reached the bounce
  if (cursorIdx >= 0 && streak >= bounceCount) {
    idx = (cursorIdx + 1) % agents.length;
    streak = 0;
  } else if (cursorIdx < 0) {
    // First-ever run, or the previous cursor agent is no longer eligible
    idx = 0;
    streak = 0;
  }

  const picked = agents[idx];
  streak += 1;

  await redis.set(CURSOR_KEY, picked.id);
  await redis.set(STREAK_KEY, String(streak));

  return picked;
}

/**
 * By-product strategy: look at the order's items, take the first product with
 * a configured `assignedAgentId` that's in the eligible-agent pool, and pick
 * them. Falls back to round-robin if no item's product has a mapping or the
 * mapped agent isn't currently eligible.
 */
async function pickByProduct(
  orderId: string,
  agents: Candidate[],
  bounceCount: number,
): Promise<Candidate> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { variant: { select: { product: { select: { assignedAgentId: true } } } } },
    orderBy: { id: 'asc' },
  });

  const eligible = new Map(agents.map((a) => [a.id, a]));
  for (const it of items) {
    const mappedId = it.variant.product?.assignedAgentId;
    if (mappedId && eligible.has(mappedId)) return eligible.get(mappedId)!;
  }

  return pickRoundRobin(agents, bounceCount);
}

// ─── Public: autoAssign ──────────────────────────────────────────────────────

export interface AutoAssignResult {
  assigned: boolean;
  agentId?: string;
  agentName?: string;
  reason?: string;
}

/**
 * Picks an eligible agent under a Redis lock and sets `agentId` + `assignedAt`
 * on the order. Emits `order:assigned` so the UI updates live.
 */
export async function autoAssign(orderId: string): Promise<AutoAssignResult> {
  const rule = await getAssignmentRule();
  if (!rule.isActive) return { assigned: false, reason: 'auto-assign disabled' };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, agentId: true, isArchived: true },
  });
  if (!order) return { assigned: false, reason: 'order not found' };
  if (order.agentId) return { assigned: false, reason: 'already assigned' };
  if (order.isArchived) return { assigned: false, reason: 'order archived' };

  const token = await acquireLock();
  if (!token) return { assigned: false, reason: 'lock timeout' };

  try {
    // Re-read under lock in case a parallel write got there first
    const fresh = await prisma.order.findUnique({
      where: { id: orderId },
      select: { agentId: true },
    });
    if (fresh?.agentId) return { assigned: false, reason: 'already assigned' };

    const agents = await eligibleAgents(rule.eligibleAgentIds);
    if (agents.length === 0) return { assigned: false, reason: 'no eligible agents' };

    const picked = rule.strategy === 'by_product'
      ? await pickByProduct(orderId, agents, rule.bounceCount)
      : await pickRoundRobin(agents, rule.bounceCount);

    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { agentId: picked.id, assignedAt: new Date() },
      }),
      prisma.orderLog.create({
        data: {
          orderId,
          type: 'system',
          action: `Auto-assigned to ${picked.name}`,
          performedBy: 'System',
        },
      }),
    ]);

    emitToRoom('orders:all', 'order:assigned', { orderId, agentId: picked.id });
    emitToRoom(`agent:${picked.id}`, 'order:assigned', { orderId });

    return { assigned: true, agentId: picked.id, agentName: picked.name };
  } finally {
    await releaseLock(token);
  }
}

/**
 * Dry-run simulation used by the assignment-rules page: pretends to assign N
 * orders without touching Redis or the DB, so the admin can preview the
 * rotation. Returns the sequence of agent names.
 */
export async function simulateAssign(count: number): Promise<string[]> {
  const rule = await getAssignmentRule();
  const agents = await eligibleAgents(rule.eligibleAgentIds);
  if (agents.length === 0) return [];

  const result: string[] = [];
  let idx = 0;
  let streak = 0;
  for (let i = 0; i < count; i += 1) {
    if (streak >= rule.bounceCount) {
      idx = (idx + 1) % agents.length;
      streak = 0;
    }
    result.push(agents[idx].name);
    streak += 1;
  }
  return result;
}
