/**
 * Shipping Status Groups — admin-managed buckets that roll the long
 * ShippingStatus enum into a handful of named tabs on the Call Center page.
 *
 * Statuses not claimed by any group automatically show up in the frontend's
 * "Other" tab — the backend just stores the explicit groups.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  ReorderGroupsInput,
} from './shippingStatusGroups.schema';

export async function listGroups() {
  return prisma.shippingStatusGroup.findMany({
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function createGroup(input: CreateGroupInput, actorId?: string) {
  // New groups land at the end of the list. The next-position fallback is 0
  // when the table is empty.
  const last = await prisma.shippingStatusGroup.findFirst({
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const nextPosition = (last?.position ?? -1) + 1;

  try {
    return await prisma.shippingStatusGroup.create({
      data: {
        name: input.name,
        color: input.color ?? null,
        statusKeys: input.statusKeys,
        position: nextPosition,
        createdById: actorId ?? null,
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const e = new Error('A group with this name already exists');
      (e as Error & { statusCode?: number }).statusCode = 409;
      throw e;
    }
    throw err;
  }
}

export async function updateGroup(id: string, input: UpdateGroupInput) {
  const data: Prisma.ShippingStatusGroupUpdateInput = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.color !== undefined) data.color = input.color;
  if (input.statusKeys !== undefined) data.statusKeys = { set: input.statusKeys };

  try {
    return await prisma.shippingStatusGroup.update({ where: { id }, data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        const e = new Error('A group with this name already exists');
        (e as Error & { statusCode?: number }).statusCode = 409;
        throw e;
      }
      if (err.code === 'P2025') {
        const e = new Error('Group not found');
        (e as Error & { statusCode?: number }).statusCode = 404;
        throw e;
      }
    }
    throw err;
  }
}

export async function deleteGroup(id: string) {
  try {
    await prisma.shippingStatusGroup.delete({ where: { id } });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2025'
    ) {
      const e = new Error('Group not found');
      (e as Error & { statusCode?: number }).statusCode = 404;
      throw e;
    }
    throw err;
  }
}

/**
 * Atomic position rewrite. Caller submits the desired ID order; we assign
 * positions 0..N-1 in a single transaction so the list is always consistent
 * even if two admins reorder concurrently.
 */
export async function reorderGroups(input: ReorderGroupsInput) {
  const existing = await prisma.shippingStatusGroup.findMany({
    select: { id: true },
  });
  const existingIds = new Set(existing.map((g) => g.id));
  const submittedIds = new Set(input.ids);

  // Reject reorder requests that don't match the current set exactly — guards
  // against stale clients overwriting positions of groups they didn't see.
  if (
    submittedIds.size !== existing.length ||
    input.ids.some((id) => !existingIds.has(id))
  ) {
    const e = new Error('Reorder list does not match current groups');
    (e as Error & { statusCode?: number }).statusCode = 409;
    throw e;
  }

  await prisma.$transaction(
    input.ids.map((id, index) =>
      prisma.shippingStatusGroup.update({
        where: { id },
        data: { position: index },
      }),
    ),
  );
  return listGroups();
}
