/**
 * Broadcasts — admin-pushed announcements aimed at one or more agents.
 *
 *   POPUP: blocking modal that re-shows on every page load until the agent
 *          clicks OK. The OK click counts as "read" and the popup never
 *          returns for that agent.
 *
 *   BAR  : sticky banner on the Call Center page. Agents cannot dismiss;
 *          only the admin can flip `isActive=false` to retire it.
 *
 * Each broadcast can carry text + optional image + optional clickable link.
 * Per-recipient rows track delivery / acknowledgement / link clicks so the
 * admin can audit who actually saw the message.
 */

import { Prisma, BroadcastKind } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToUser } from '../../shared/socket';
import type { CreateBroadcastInput, ListFilterInput } from './broadcasts.schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function resolveRecipientIds(
  input: CreateBroadcastInput,
): Promise<string[]> {
  if (input.allUsers) {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
  // Drop duplicates and verify every id is a real, active user — silently
  // skipping unknown ids would be confusing during admin debugging.
  const unique = Array.from(new Set(input.recipientIds));
  if (unique.length === 0) {
    const e = new Error('No recipients to send to');
    (e as Error & { statusCode?: number }).statusCode = 400;
    throw e;
  }
  const found = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true },
  });
  if (found.length !== unique.length) {
    const e = new Error('One or more recipientIds are unknown');
    (e as Error & { statusCode?: number }).statusCode = 400;
    throw e;
  }
  return unique;
}

// Minimal payload pushed over Socket.io — recipients fetch the full row from
// `/active/me` if they need fields we didn't include.
function broadcastPayload(b: {
  id: string;
  kind: BroadcastKind;
  title: string;
  body: string | null;
  imageUrl: string | null;
  linkUrl: string | null;
  isActive: boolean;
  createdAt: Date;
}) {
  return {
    id: b.id,
    kind: b.kind,
    title: b.title,
    body: b.body,
    imageUrl: b.imageUrl,
    linkUrl: b.linkUrl,
    isActive: b.isActive,
    createdAt: b.createdAt,
  };
}

// ─── Admin: create ───────────────────────────────────────────────────────────

export async function createBroadcast(
  input: CreateBroadcastInput,
  actorId: string,
  imageUrl: string | null = null,
) {
  const recipientIds = await resolveRecipientIds(input);

  // Single transaction: row + N recipient rows. If any insert fails we'd
  // rather not have an orphan broadcast with no targets.
  const broadcast = await prisma.$transaction(async (tx) => {
    const row = await tx.broadcast.create({
      data: {
        kind: input.kind as BroadcastKind,
        title: input.title,
        body: input.body ?? null,
        imageUrl,
        linkUrl: input.linkUrl ?? null,
        createdById: actorId,
        recipients: {
          createMany: {
            data: recipientIds.map((userId) => ({ userId })),
          },
        },
      },
    });
    return row;
  });

  // Fire-and-forget socket fan-out — failures are logged in `emitToUser`'s
  // caller path but never block the admin's request. Mirrors
  // `notifications.service.ts:69`.
  const payload = broadcastPayload(broadcast);
  for (const userId of recipientIds) {
    try {
      emitToUser(userId, 'broadcast:new', payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[broadcasts] socket emit failed', { userId, err });
    }
  }

  return { ...broadcast, recipientCount: recipientIds.length };
}

// ─── Admin: list + details ──────────────────────────────────────────────────

export async function listBroadcasts(filter: ListFilterInput = {}) {
  const where: Prisma.BroadcastWhereInput = {};
  if (filter.kind) where.kind = filter.kind as BroadcastKind;
  if (filter.isActive !== undefined) where.isActive = filter.isActive;

  const rows = await prisma.broadcast.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      _count: { select: { recipients: true } },
    },
  });

  // Pull aggregated stats with a second query keyed by broadcastId. groupBy
  // returns one row per (broadcastId) so we sum acked/clicked counts in JS.
  const stats = await prisma.broadcastRecipient.groupBy({
    by: ['broadcastId'],
    where: { broadcastId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
    _sum: { clickCount: true },
  });
  const ackedCounts = await prisma.broadcastRecipient.groupBy({
    by: ['broadcastId'],
    where: {
      broadcastId: { in: rows.map((r) => r.id) },
      ackedAt: { not: null },
    },
    _count: { _all: true },
  });
  const clickedCounts = await prisma.broadcastRecipient.groupBy({
    by: ['broadcastId'],
    where: {
      broadcastId: { in: rows.map((r) => r.id) },
      clickedAt: { not: null },
    },
    _count: { _all: true },
  });

  const byId = new Map(stats.map((s) => [s.broadcastId, s]));
  const ackedById = new Map(ackedCounts.map((s) => [s.broadcastId, s._count._all]));
  const clickedById = new Map(clickedCounts.map((s) => [s.broadcastId, s._count._all]));

  return rows.map((r) => ({
    ...r,
    recipientCount: r._count.recipients,
    ackedCount: ackedById.get(r.id) ?? 0,
    clickedCount: clickedById.get(r.id) ?? 0,
    totalClicks: byId.get(r.id)?._sum.clickCount ?? 0,
  }));
}

export async function getBroadcastDetails(id: string) {
  const row = await prisma.broadcast.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, avatarUrl: true } },
      recipients: {
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  });
  if (!row) {
    const e = new Error('Broadcast not found');
    (e as Error & { statusCode?: number }).statusCode = 404;
    throw e;
  }
  return row;
}

// ─── Admin: deactivate / delete ─────────────────────────────────────────────

export async function deactivateBroadcast(id: string) {
  const existing = await prisma.broadcast.findUnique({
    where: { id },
    select: { isActive: true },
  });
  if (!existing) {
    const e = new Error('Broadcast not found');
    (e as Error & { statusCode?: number }).statusCode = 404;
    throw e;
  }
  if (!existing.isActive) {
    return prisma.broadcast.findUnique({ where: { id } });
  }

  const updated = await prisma.broadcast.update({
    where: { id },
    data: { isActive: false, deactivatedAt: new Date() },
    include: {
      recipients: { select: { userId: true } },
    },
  });

  // Push a `broadcast:closed` to every recipient so a sticky BAR disappears
  // live without forcing a reload.
  for (const r of updated.recipients) {
    try {
      emitToUser(r.userId, 'broadcast:closed', { id });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[broadcasts] socket close emit failed', { userId: r.userId, err });
    }
  }

  return updated;
}

export async function deleteBroadcast(id: string) {
  try {
    await prisma.broadcast.delete({ where: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      const e = new Error('Broadcast not found');
      (e as Error & { statusCode?: number }).statusCode = 404;
      throw e;
    }
    throw err;
  }
}

// ─── User: active feed + ack + click ────────────────────────────────────────

export async function getActiveForUser(userId: string) {
  // POPUP: not yet acked, regardless of isActive — once an admin sends it
  // the agent must ack it even if the admin later deactivates a related BAR.
  // BAR: still active, regardless of ackedAt — agents can re-acknowledge as
  // they see fit, but the bar stays up until the admin retires it.
  const popups = await prisma.broadcastRecipient.findMany({
    where: {
      userId,
      ackedAt: null,
      broadcast: { kind: BroadcastKind.POPUP, isActive: true },
    },
    include: { broadcast: true },
    orderBy: { broadcast: { createdAt: 'asc' } },
  });

  const bars = await prisma.broadcastRecipient.findMany({
    where: {
      userId,
      broadcast: { kind: BroadcastKind.BAR, isActive: true },
    },
    include: { broadcast: true },
    orderBy: { broadcast: { createdAt: 'desc' } },
  });

  // Stamp deliveredAt on first pull — single update per row, fire and forget.
  const undelivered = [...popups, ...bars]
    .filter((r) => r.deliveredAt === null)
    .map((r) => r.id);
  if (undelivered.length > 0) {
    await prisma.broadcastRecipient
      .updateMany({
        where: { id: { in: undelivered } },
        data: { deliveredAt: new Date() },
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[broadcasts] deliveredAt stamp failed', err);
      });
  }

  return {
    popups: popups.map((r) => broadcastPayload(r.broadcast)),
    bars: bars.map((r) => broadcastPayload(r.broadcast)),
  };
}

export async function ack(broadcastId: string, userId: string) {
  // Idempotent — if the user has already acked, leave the original timestamp
  // alone. `updateMany` returns count=0 when the where clause filters out the
  // already-acked row, and we treat that as success.
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, userId, ackedAt: null },
    data: { ackedAt: new Date() },
  });
  return { ok: true };
}

export async function recordClick(broadcastId: string, userId: string) {
  // Two-step: first stamp clickedAt only if it's null (preserves first-click
  // timestamp), then bump clickCount. In a transaction so the two updates
  // don't race on rapid double-clicks.
  await prisma.$transaction([
    prisma.broadcastRecipient.updateMany({
      where: { broadcastId, userId, clickedAt: null },
      data: { clickedAt: new Date() },
    }),
    prisma.broadcastRecipient.updateMany({
      where: { broadcastId, userId },
      data: { clickCount: { increment: 1 } },
    }),
  ]);
  return { ok: true };
}
