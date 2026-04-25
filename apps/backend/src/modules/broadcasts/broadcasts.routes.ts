import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import { uploadFile } from '../../shared/storage';
import * as svc from './broadcasts.service';
import { CreateBroadcastSchema, ListFilterSchema } from './broadcasts.schema';

const ALLOWED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

// Parse a multipart request that carries either: just JSON fields, or JSON
// fields + an optional `image` file. Walks `request.parts()` once because
// `request.file()` errors when the request has no file part. Reads the file
// into a Buffer (capped at MAX_IMAGE_BYTES) and returns the scalar fields as
// a flat record.
async function readBroadcastForm(req: FastifyRequest): Promise<{
  fields: Record<string, string>;
  file: { buffer: Buffer; mimetype: string } | null;
  errorReply?: { status: number; body: { error: { code: string; message: string; statusCode: number } } };
}> {
  const fields: Record<string, string> = {};
  let file: { buffer: Buffer; mimetype: string } | null = null;

  // `request.parts()` is the iterator entry point — works even without a file.
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      const filePart = part as MultipartFile;
      if (filePart.fieldname !== 'image') {
        // Drain unknown file fields so the request finishes cleanly.
        for await (const _ of filePart.file) { /* drain */ }
        continue;
      }
      if (!ALLOWED_IMAGE_MIME.has(filePart.mimetype)) {
        for await (const _ of filePart.file) { /* drain */ }
        return {
          fields,
          file: null,
          errorReply: {
            status: 400,
            body: {
              error: {
                code: 'UNSUPPORTED_FORMAT',
                message: 'Image must be PNG, JPEG, WebP, or GIF',
                statusCode: 400,
              },
            },
          },
        };
      }
      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of filePart.file) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buf.length;
        if (total > MAX_IMAGE_BYTES) {
          // Keep draining so the upstream connection closes cleanly.
          for await (const _ of filePart.file) { /* drain */ }
          return {
            fields,
            file: null,
            errorReply: {
              status: 413,
              body: {
                error: {
                  code: 'FILE_TOO_LARGE',
                  message: 'Image exceeds the 8 MB limit',
                  statusCode: 413,
                },
              },
            },
          };
        }
        chunks.push(buf);
      }
      file = { buffer: Buffer.concat(chunks), mimetype: filePart.mimetype };
    } else {
      // Scalar field — `part.value` is the string content.
      fields[part.fieldname] = String((part as { value: unknown }).value ?? '');
    }
  }

  return { fields, file };
}

export async function broadcastsRoutes(app: FastifyInstance) {
  // ── Admin: history list ────────────────────────────────────────────────
  app.get(
    '/',
    { preHandler: [verifyJWT, requirePermission('broadcasts:manage')] },
    async (req, reply) => {
      const filter = ListFilterSchema.parse(req.query ?? {});
      const rows = await svc.listBroadcasts(filter);
      return reply.send({ data: rows });
    },
  );

  // ── Admin: per-broadcast detail with full recipient list ───────────────
  app.get<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('broadcasts:manage')] },
    async (req, reply) => {
      const row = await svc.getBroadcastDetails(req.params.id);
      return reply.send(row);
    },
  );

  // ── Admin: create ──────────────────────────────────────────────────────
  app.post(
    '/',
    { preHandler: [verifyJWT, requirePermission('broadcasts:manage')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.isMultipart()) {
        return reply.status(415).send({
          error: {
            code: 'UNSUPPORTED_MEDIA_TYPE',
            message: 'Use multipart/form-data',
            statusCode: 415,
          },
        });
      }

      const parsed = await readBroadcastForm(req);
      if (parsed.errorReply) {
        return reply.status(parsed.errorReply.status).send(parsed.errorReply.body);
      }

      // Coerce wire-format strings into the shape Zod expects. recipientIds
      // arrives as a JSON-encoded string so we can carry an array through
      // multipart's flat field set.
      let recipientIds: string[] = [];
      if (parsed.fields.recipientIds) {
        try {
          const decoded = JSON.parse(parsed.fields.recipientIds);
          if (Array.isArray(decoded)) {
            recipientIds = decoded.filter((v): v is string => typeof v === 'string');
          }
        } catch {
          // Treat invalid JSON as empty — Zod will reject if allUsers also false.
        }
      }
      const allUsers =
        parsed.fields.allUsers === 'true' || parsed.fields.allUsers === '1';

      let input;
      try {
        input = CreateBroadcastSchema.parse({
          kind: parsed.fields.kind,
          title: parsed.fields.title,
          body: parsed.fields.body || undefined,
          linkUrl: parsed.fields.linkUrl || undefined,
          recipientIds,
          allUsers,
        });
      } catch (err) {
        return reply.status(400).send({
          error: {
            code: 'VALIDATION',
            message:
              err instanceof Error ? err.message : 'Invalid broadcast input',
            statusCode: 400,
          },
        });
      }

      let imageUrl: string | null = null;
      if (parsed.file) {
        // Convert the buffered file back into a stream for the storage adapter.
        const { Readable } = await import('node:stream');
        const stream = Readable.from(parsed.file.buffer);
        const result = await uploadFile({
          folder: 'broadcasts',
          mimeType: parsed.file.mimetype,
          stream,
        });
        imageUrl = result.url;
      }

      try {
        const created = await svc.createBroadcast(input, req.user.sub, imageUrl);
        return reply.status(201).send(created);
      } catch (err) {
        const e = err as { statusCode?: number; message?: string };
        if (e.statusCode) {
          return reply.status(e.statusCode).send({
            error: {
              code: 'BROADCAST_CREATE_FAILED',
              message: e.message ?? 'Failed to create broadcast',
              statusCode: e.statusCode,
            },
          });
        }
        throw err;
      }
    },
  );

  // ── Admin: deactivate (kill switch for BAR) ────────────────────────────
  app.patch<{ Params: { id: string } }>(
    '/:id/deactivate',
    { preHandler: [verifyJWT, requirePermission('broadcasts:manage')] },
    async (req, reply) => {
      const row = await svc.deactivateBroadcast(req.params.id);
      return reply.send(row);
    },
  );

  // ── Admin: hard delete ─────────────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [verifyJWT, requirePermission('broadcasts:manage')] },
    async (req, reply) => {
      await svc.deleteBroadcast(req.params.id);
      return reply.send({ ok: true });
    },
  );

  // ── User: own active feed (popups + bars) ──────────────────────────────
  // Auth-only — every signed-in user can read their own feed.
  app.get(
    '/active/me',
    { preHandler: [verifyJWT] },
    async (req, reply) => {
      const result = await svc.getActiveForUser(req.user.sub);
      return reply.send(result);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/ack',
    { preHandler: [verifyJWT] },
    async (req, reply) => {
      await svc.ack(req.params.id, req.user.sub);
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/:id/click',
    { preHandler: [verifyJWT] },
    async (req, reply) => {
      await svc.recordClick(req.params.id, req.user.sub);
      return reply.send({ ok: true });
    },
  );
}
