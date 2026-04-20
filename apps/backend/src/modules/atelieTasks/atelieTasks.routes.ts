/**
 * Team tasks routes (Atelie Kanban).
 *
 * Auth: every endpoint requires a logged-in user, but there is NO atelie:*
 * permission gate — tasks are open to any CRM user per the product brief
 * ("each user can write their tasks, others see shared ones"). Visibility is
 * enforced inside the service layer.
 */

import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import * as svc from './atelieTasks.service';
import { TaskAccessError } from './atelieTasks.service';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  MoveTaskSchema,
  CreateCommentSchema,
} from './atelieTasks.schema';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'atelie', 'tasks');

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
]);

function ensureDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function atelieTasksRoutes(app: FastifyInstance) {
  type WithId = { Params: { id: string } };
  type WithIdCid = { Params: { id: string; cid: string } };
  type WithIdAid = { Params: { id: string; aid: string } };

  app.get('/', { preHandler: [verifyJWT] }, async (req, reply) => {
    const data = await svc.listVisibleTasks(req.user.sub);
    return reply.send(data);
  });

  app.get<WithId>('/:id', { preHandler: [verifyJWT] }, async (req, reply) => {
    const task = await svc.getTask(req.params.id, req.user.sub);
    return reply.send(task);
  });

  app.post('/', { preHandler: [verifyJWT] }, async (req, reply) => {
    const input = CreateTaskSchema.parse(req.body);
    const task = await svc.createTask(input, req.user.sub);
    return reply.status(201).send(task);
  });

  app.patch<WithId>('/:id', { preHandler: [verifyJWT] }, async (req, reply) => {
    const input = UpdateTaskSchema.parse(req.body);
    const task = await svc.updateTask(req.params.id, input, req.user.sub);
    return reply.send(task);
  });

  app.patch<WithId>('/:id/move', { preHandler: [verifyJWT] }, async (req, reply) => {
    const input = MoveTaskSchema.parse(req.body);
    const task = await svc.moveTask(req.params.id, input, req.user.sub);
    return reply.send(task);
  });

  app.delete<WithId>('/:id', { preHandler: [verifyJWT] }, async (req, reply) => {
    const result = await svc.deleteTask(req.params.id, req.user.sub);
    return reply.send(result);
  });

  // ── Comments ──────────────────────────────────────────────────────────────
  app.post<WithId>('/:id/comments', { preHandler: [verifyJWT] }, async (req, reply) => {
    const input = CreateCommentSchema.parse(req.body);
    const comment = await svc.addComment(req.params.id, input, req.user.sub);
    return reply.status(201).send(comment);
  });

  app.delete<WithIdCid>('/:id/comments/:cid', { preHandler: [verifyJWT] }, async (req, reply) => {
    const result = await svc.deleteComment(req.params.id, req.params.cid, req.user.sub);
    return reply.send(result);
  });

  // ── Attachments ───────────────────────────────────────────────────────────
  app.post<WithId>('/:id/attachments', { preHandler: [verifyJWT] }, async (req, reply) => {
    // Ownership check before we touch the filesystem — cheaper than streaming
    // a big file only to reject it.
    const taskId = req.params.id;
    await svc.assertCanAttach(taskId, req.user.sub);

    const file = await req.file();
    if (!file) {
      return reply.status(400).send({
        error: { code: 'NO_FILE', message: 'No file uploaded', statusCode: 400 },
      });
    }

    if (!ALLOWED_MIME.has(file.mimetype)) {
      return reply.status(400).send({
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: `Unsupported file type: ${file.mimetype}`,
          statusCode: 400,
        },
      });
    }

    ensureDir();
    const ext = path.extname(file.filename) || '';
    const safeExt = ext.length > 0 && ext.length <= 10 ? ext : '';
    const storedName = `${Date.now()}-${randomBytes(6).toString('hex')}${safeExt}`;
    const destPath = path.join(UPLOADS_DIR, storedName);

    try {
      await pipeline(file.file, fs.createWriteStream(destPath));
    } catch (err) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      throw err;
    }

    if (file.file.truncated) {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      return reply.status(413).send({
        error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 8 MB limit', statusCode: 413 },
      });
    }

    const stats = fs.statSync(destPath);
    const fileUrl = `/uploads/atelie/tasks/${storedName}`;
    const att = await svc.recordAttachment({
      taskId,
      userId: req.user.sub,
      fileUrl,
      fileName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: stats.size,
    });

    return reply.status(201).send(att);
  });

  app.delete<WithIdAid>(
    '/:id/attachments/:aid',
    { preHandler: [verifyJWT] },
    async (req, reply) => {
      const result = await svc.deleteAttachment(req.params.id, req.params.aid, req.user.sub);
      // Best-effort cleanup of the file on disk.
      if (result.fileUrl.startsWith('/uploads/')) {
        const onDisk = path.resolve(process.cwd(), result.fileUrl.slice(1));
        fs.promises.unlink(onDisk).catch(() => {});
      }
      return reply.send({ ok: true });
    },
  );

  // ── Hide / unhide shared tasks for the current viewer ────────────────────
  app.post<WithId>('/:id/hide', { preHandler: [verifyJWT] }, async (req, reply) => {
    const result = await svc.hideTaskForUser(req.params.id, req.user.sub);
    return reply.send(result);
  });

  app.delete<WithId>('/:id/hide', { preHandler: [verifyJWT] }, async (req, reply) => {
    const result = await svc.unhideTaskForUser(req.params.id, req.user.sub);
    return reply.send(result);
  });

  // Module-local error handler — maps TaskAccessError.status → HTTP.
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof TaskAccessError) {
      return reply.status(error.status).send({
        error: { code: 'TASK_ACCESS', message: error.message, statusCode: error.status },
      });
    }
    throw error;
  });
}
