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

// ─── Round-robin cursor (single Redis hash, atomic reads/writes) ────────────
//
// Stored as one hash so cursor + streak update together. Two separate keys
// — the previous design — could be partially written if the process died
// between SETs, leaving a cursor pointing at an agent whose streak was
// already counted twice.

const STATE_KEY = 'assignment:round_robin:state';
const STATE_FIELD_CURSOR = 'cursor';
const STATE_FIELD_STREAK = 'streak';

interface Candidate {
  id: string;
  name: string;
}

interface RrState {
  cursorId: string | null;
  streak: number;
}

async function readRrState(): Promise<RrState> {
  const [cursor, streak] = await redis.hmget(
    STATE_KEY,
    STATE_FIELD_CURSOR,
    STATE_FIELD_STREAK,
  );
  return {
    cursorId: cursor ?? null,
    streak: Number(streak ?? 0),
  };
}

async function writeRrState(state: RrState): Promise<void> {
  // hset writes both fields in one round-trip — atomic from any concurrent
  // reader's view because we're already inside the assignment lock.
  await redis.hset(STATE_KEY, {
    [STATE_FIELD_CURSOR]: state.cursorId ?? '',
    [STATE_FIELD_STREAK]: String(state.streak),
  });
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
 * Today-window over which "fair share" is measured. Resetting nightly is the
 * intuitive boundary — admins read the morning standings to verify yesterday
 * was even, and any drift from offline/manual assignments doesn't compound
 * across days.
 */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Round-robin with drift correction. The previous pure-cursor implementation
 * silently went off-count in two real-world scenarios:
 *
 *   1. An eligible agent went offline mid-rotation → dropped out of the
 *      pool → cursor landed on someone else → coming back gave them a
 *      fresh streak of `bounceCount`, so the day's total per-agent count
 *      drifted from the configured share.
 *   2. Manual / bulk / YouCan-import assignments bypass autoAssign. The
 *      cursor never saw them, so the per-agent count the admin actually
 *      reads on the dashboard drifted from the cursor's idea of fairness.
 *
 * Fix:
 *   - Default behaviour stays pure round-robin: the cursor agent receives
 *     `bounceCount` in a row, then rotation. This is what the admin sees
 *     in the simulator and the natural mental model ("2 per agent in turn").
 *   - On every rotation, before committing the next pick, check today's
 *     counts. If an eligible agent is more than `bounceCount` behind the
 *     leader (i.e. they fell off and came back), jump the cursor to them
 *     and reset the streak. This catches the offline / manual-injection
 *     drift without disrupting the steady-state rotation.
 */
async function pickRoundRobin(
  agents: Candidate[],
  bounceCount: number,
): Promise<Candidate> {
  const state = await readRrState();
  const cursorIdx = state.cursorId
    ? agents.findIndex((a) => a.id === state.cursorId)
    : -1;

  // Stay on the cursor agent until they reach the bounce. Pure round-robin
  // for the steady state — matches the simulator and the admin's intuition.
  if (cursorIdx >= 0 && state.streak < bounceCount) {
    const picked = agents[cursorIdx];
    await writeRrState({ cursorId: picked.id, streak: state.streak + 1 });
    return picked;
  }

  // Rotation point — cursor either expired (streak hit bounceCount) or the
  // cursor agent is no longer eligible. Decide the next victim with two
  // pieces of information: the natural next index after the cursor, AND
  // today's per-agent counts (drift detection).
  const sinceTs = startOfToday();
  const grouped = await prisma.order.groupBy({
    by: ['agentId'],
    where: {
      agentId: { in: agents.map((a) => a.id) },
      assignedAt: { gte: sinceTs },
      isArchived: false,
    },
    _count: { _all: true },
  });
  const todayCount = new Map<string, number>();
  for (const row of grouped) {
    if (row.agentId) todayCount.set(row.agentId, row._count._all);
  }
  const counts = agents.map((a) => todayCount.get(a.id) ?? 0);
  const maxCount = Math.max(...counts, 0);
  const minCount = Math.min(...counts, maxCount);

  // Drift-correction: if the gap between most-loaded and least-loaded is
  // more than bounceCount, there's an agent who's been left behind (offline
  // earlier, or manual assignments piled up on someone else). Jump the
  // cursor to the most-behind agent rather than the natural next index.
  if (maxCount - minCount > bounceCount) {
    const behindIdx = agents.findIndex(
      (a) => (todayCount.get(a.id) ?? 0) === minCount,
    );
    const picked = agents[behindIdx];
    await writeRrState({ cursorId: picked.id, streak: 1 });
    return picked;
  }

  // Normal rotation: take the next agent after the cursor (wrap around).
  // First-ever run has cursorIdx === -1, so we land on agents[0].
  const nextIdx = cursorIdx >= 0 ? (cursorIdx + 1) % agents.length : 0;
  const picked = agents[nextIdx];
  await writeRrState({ cursorId: picked.id, streak: 1 });
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

    emitToRoom('orders:all', 'order:assigned', {
      orderId,
      agentId: picked.id,
      ts: Date.now(),
    });
    emitToRoom(`agent:${picked.id}`, 'order:assigned', { orderId, ts: Date.now() });

    return { assigned: true, agentId: picked.id, agentName: picked.name };
  } finally {
    await releaseLock(token);
  }
}

/**
 * Dry-run simulation used by the assignment-rules page. Mirrors the
 * load-aware logic in `pickRoundRobin` but operates on an in-memory count
 * map instead of hitting the DB and Redis — so the preview the admin sees
 * matches the production rotation tick-for-tick (assuming all agents start
 * the day at zero).
 *
 * Returns [] when the rule is disabled or no eligible agents exist; the UI
 * already shows a friendly empty-state for both. Always runs the round-
 * robin path even when `strategy: by_product` is set — by_product needs
 * an order context that the simulator can't fabricate.
 */
export async function simulateAssign(count: number): Promise<string[]> {
  const rule = await getAssignmentRule();
  if (!rule.isActive) return [];

  const agents = await eligibleAgents(rule.eligibleAgentIds);
  if (agents.length === 0) return [];

  const result: string[] = [];
  let cursorId: string | null = null;
  let streak = 0;

  for (let i = 0; i < count; i += 1) {
    const cursorIdx = cursorId
      ? agents.findIndex((a) => a.id === cursorId)
      : -1;
    let picked: Candidate;
    if (cursorIdx >= 0 && streak < rule.bounceCount) {
      picked = agents[cursorIdx];
      streak += 1;
    } else {
      const next = cursorIdx >= 0 ? (cursorIdx + 1) % agents.length : 0;
      picked = agents[next];
      streak = 1;
    }
    cursorId = picked.id;
    result.push(picked.name);
  }
  return result;
}
