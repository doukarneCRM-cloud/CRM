/**
 * Team tasks service (Atelie Kanban).
 *
 * Visibility model:
 *   - private: only the owner sees it
 *   - shared:  visible to all users EXCEPT those who have opted out via
 *              AtelieTaskHide. Only the owner can mutate.
 *
 * Ordering within a column uses fractional positions — inserting between two
 * cards sets position = (prev + next) / 2. When consecutive cards get closer
 * than POS_EPSILON, `renormalizeColumn` rewrites positions to integer steps.
 */

import { prisma } from '../../shared/prisma';
import { emitToRoom, emitToUser } from '../../shared/socket';
import type {
  AtelieTask,
  AtelieTaskStatus,
  AtelieTaskVisibility,
} from '@prisma/client';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  MoveTaskInput,
  CreateCommentInput,
} from './atelieTasks.schema';

const POS_EPSILON = 1e-4;
const POS_STEP = 1024;

export class TaskAccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

async function userCanSee(
  task: Pick<AtelieTask, 'id' | 'ownerId' | 'visibility'>,
  userId: string,
): Promise<boolean> {
  if (task.ownerId === userId) return true;
  if (task.visibility !== 'shared') return false;
  const hide = await prisma.atelieTaskHide.findUnique({
    where: { userId_taskId: { userId, taskId: task.id } },
  });
  return !hide;
}

function broadcastTaskChange(
  event: 'task:created' | 'task:updated' | 'task:moved' | 'task:deleted',
  task: AtelieTask,
) {
  if (task.visibility === 'shared') {
    emitToRoom('tasks:shared', event, { taskId: task.id, ownerId: task.ownerId });
  } else {
    emitToUser(task.ownerId, event, { taskId: task.id, ownerId: task.ownerId });
  }
}

/** List tasks visible to `userId`: own + shared-from-others (minus hidden). */
export async function listVisibleTasks(userId: string) {
  const [mine, sharedFromOthers, hiddenIds] = await Promise.all([
    prisma.atelieTask.findMany({
      where: { ownerId: userId },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
      include: {
        _count: { select: { comments: true, attachments: true } },
      },
    }),
    prisma.atelieTask.findMany({
      where: { visibility: 'shared', ownerId: { not: userId } },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
      include: {
        owner: { select: { id: true, name: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    }),
    prisma.atelieTaskHide.findMany({
      where: { userId },
      select: { taskId: true },
    }),
  ]);
  const hiddenSet = new Set(hiddenIds.map((h) => h.taskId));
  return {
    mine,
    shared: sharedFromOthers.filter((t) => !hiddenSet.has(t.id)),
  };
}

export async function getTask(taskId: string, userId: string) {
  const task = await prisma.atelieTask.findUnique({
    where: { id: taskId },
    include: {
      owner: { select: { id: true, name: true } },
      comments: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true } } },
      },
      attachments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (!(await userCanSee(task, userId))) {
    throw new TaskAccessError('Not visible to you', 404);
  }
  return task;
}

export async function createTask(input: CreateTaskInput, ownerId: string) {
  // Append at the end of the target column.
  const status = (input.status ?? 'backlog') as AtelieTaskStatus;
  const last = await prisma.atelieTask.findFirst({
    where: { ownerId, status },
    orderBy: { position: 'desc' },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + POS_STEP;
  const task = await prisma.atelieTask.create({
    data: {
      ownerId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      visibility: (input.visibility ?? 'private') as AtelieTaskVisibility,
      color: input.color ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      position,
    },
  });
  broadcastTaskChange('task:created', task);
  return task;
}

export async function updateTask(taskId: string, input: UpdateTaskInput, userId: string) {
  const existing = await prisma.atelieTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new TaskAccessError('Task not found', 404);
  if (existing.ownerId !== userId) throw new TaskAccessError('Only the owner can edit this task');

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description?.trim() || null;
  if (input.visibility !== undefined) data.visibility = input.visibility;
  if (input.color !== undefined) data.color = input.color;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;

  const updated = await prisma.atelieTask.update({ where: { id: taskId }, data });

  // If visibility flipped, broadcast under BOTH old and new audiences so the
  // other side can add/remove the card without a full refetch.
  if (input.visibility !== undefined && input.visibility !== existing.visibility) {
    if (existing.visibility === 'shared') {
      emitToRoom('tasks:shared', 'task:deleted', { taskId, ownerId: existing.ownerId });
    }
    if (updated.visibility === 'shared') {
      emitToRoom('tasks:shared', 'task:created', { taskId, ownerId: updated.ownerId });
    }
  }
  broadcastTaskChange('task:updated', updated);
  return updated;
}

export async function moveTask(taskId: string, input: MoveTaskInput, userId: string) {
  const existing = await prisma.atelieTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new TaskAccessError('Task not found', 404);
  if (existing.ownerId !== userId) throw new TaskAccessError('Only the owner can move this task');

  if (input.status === 'incomplete' && !input.incompleteReason?.trim()) {
    throw new TaskAccessError('A reason is required when marking a task incomplete', 400);
  }

  const completedAt =
    input.status === 'done' && existing.status !== 'done'
      ? new Date()
      : input.status !== 'done'
      ? null
      : existing.completedAt;

  const moved = await prisma.atelieTask.update({
    where: { id: taskId },
    data: {
      status: input.status,
      position: input.position,
      incompleteReason:
        input.status === 'incomplete'
          ? input.incompleteReason?.trim() ?? null
          : null,
      completedAt,
    },
  });
  broadcastTaskChange('task:moved', moved);

  // Renormalize if column gets too crowded (cheap background job).
  renormalizeIfNeeded(userId, input.status).catch(() => {});

  return moved;
}

async function renormalizeIfNeeded(ownerId: string, status: AtelieTaskStatus) {
  const rows = await prisma.atelieTask.findMany({
    where: { ownerId, status },
    orderBy: { position: 'asc' },
    select: { id: true, position: true },
  });
  let needs = false;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].position - rows[i - 1].position < POS_EPSILON) {
      needs = true;
      break;
    }
  }
  if (!needs) return;
  await prisma.$transaction(
    rows.map((r, i) =>
      prisma.atelieTask.update({
        where: { id: r.id },
        data: { position: (i + 1) * POS_STEP },
      }),
    ),
  );
}

export async function deleteTask(taskId: string, userId: string) {
  const existing = await prisma.atelieTask.findUnique({ where: { id: taskId } });
  if (!existing) throw new TaskAccessError('Task not found', 404);
  if (existing.ownerId !== userId) throw new TaskAccessError('Only the owner can delete this task');

  await prisma.atelieTask.delete({ where: { id: taskId } });
  broadcastTaskChange('task:deleted', existing);
  return { ok: true };
}

// ── Comments ────────────────────────────────────────────────────────────────

export async function addComment(taskId: string, input: CreateCommentInput, authorId: string) {
  const task = await prisma.atelieTask.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (!(await userCanSee(task, authorId))) {
    throw new TaskAccessError('Not visible to you', 404);
  }

  const comment = await prisma.atelieTaskComment.create({
    data: {
      taskId,
      authorId,
      body: input.body.trim(),
    },
    include: { author: { select: { id: true, name: true } } },
  });

  // Notify owner (if someone else commented) + shared room so everyone viewing
  // the task can see the new comment live.
  if (task.ownerId !== authorId) {
    emitToUser(task.ownerId, 'task:comment_added', { taskId, commentId: comment.id });
  }
  if (task.visibility === 'shared') {
    emitToRoom('tasks:shared', 'task:comment_added', { taskId, commentId: comment.id });
  }
  return comment;
}

export async function deleteComment(taskId: string, commentId: string, userId: string) {
  const [comment, task] = await Promise.all([
    prisma.atelieTaskComment.findUnique({ where: { id: commentId } }),
    prisma.atelieTask.findUnique({ where: { id: taskId } }),
  ]);
  if (!comment || !task || comment.taskId !== taskId) {
    throw new TaskAccessError('Comment not found', 404);
  }
  // Author OR task owner may delete.
  if (comment.authorId !== userId && task.ownerId !== userId) {
    throw new TaskAccessError('Only the author or task owner can delete');
  }
  await prisma.atelieTaskComment.delete({ where: { id: commentId } });
  if (task.visibility === 'shared') {
    emitToRoom('tasks:shared', 'task:comment_deleted', { taskId, commentId });
  }
  return { ok: true };
}

// ── Attachments (metadata only — multipart saved on disk separately) ────────

/** Pre-flight ownership check before streaming an upload to disk. */
export async function assertCanAttach(taskId: string, userId: string) {
  const task = await prisma.atelieTask.findUnique({
    where: { id: taskId },
    select: { ownerId: true },
  });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (task.ownerId !== userId) {
    throw new TaskAccessError('Only the owner can attach files');
  }
}

export async function recordAttachment(params: {
  taskId: string;
  userId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const task = await prisma.atelieTask.findUnique({ where: { id: params.taskId } });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (task.ownerId !== params.userId) {
    throw new TaskAccessError('Only the owner can attach files');
  }
  const att = await prisma.atelieTaskAttachment.create({
    data: {
      taskId: params.taskId,
      uploadedBy: params.userId,
      fileUrl: params.fileUrl,
      fileName: params.fileName,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
    },
  });
  if (task.visibility === 'shared') {
    emitToRoom('tasks:shared', 'task:attachment_added', { taskId: params.taskId, attachmentId: att.id });
  }
  return att;
}

export async function deleteAttachment(taskId: string, attachmentId: string, userId: string) {
  const [att, task] = await Promise.all([
    prisma.atelieTaskAttachment.findUnique({ where: { id: attachmentId } }),
    prisma.atelieTask.findUnique({ where: { id: taskId } }),
  ]);
  if (!att || !task || att.taskId !== taskId) {
    throw new TaskAccessError('Attachment not found', 404);
  }
  if (task.ownerId !== userId) {
    throw new TaskAccessError('Only the owner can remove attachments');
  }
  await prisma.atelieTaskAttachment.delete({ where: { id: attachmentId } });
  return { ok: true, fileUrl: att.fileUrl };
}

// ── Hide / unhide shared tasks for the current viewer ───────────────────────

export async function hideTaskForUser(taskId: string, userId: string) {
  const task = await prisma.atelieTask.findUnique({ where: { id: taskId } });
  if (!task) throw new TaskAccessError('Task not found', 404);
  if (task.ownerId === userId) {
    throw new TaskAccessError("You can't hide your own task", 400);
  }
  if (task.visibility !== 'shared') {
    throw new TaskAccessError('Only shared tasks can be hidden', 400);
  }
  await prisma.atelieTaskHide.upsert({
    where: { userId_taskId: { userId, taskId } },
    create: { userId, taskId },
    update: {},
  });
  return { ok: true };
}

export async function unhideTaskForUser(taskId: string, userId: string) {
  await prisma.atelieTaskHide
    .delete({ where: { userId_taskId: { userId, taskId } } })
    .catch(() => {}); // idempotent
  return { ok: true };
}
