import type { FastifyInstance } from 'fastify';
import type { WhatsAppThreadStatus } from '@prisma/client';
import { verifyJWT } from '../../shared/middleware/verifyJWT';
import { requirePermission } from '../../shared/middleware/rbac.middleware';
import * as inbox from './inbox.service';

// Agents see their own threads; anyone with whatsapp:view can see all (admin,
// supervisor). Scope is enforced in-route rather than at the middleware so
// agents don't need a separate permission for "mine vs all".
export async function inboxRoutes(app: FastifyInstance) {
  app.get(
    '/threads',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const q = req.query as {
        status?: WhatsAppThreadStatus;
        scope?: 'mine' | 'all';
        agentId?: string;
      };
      const scope = q.scope ?? 'mine';
      // Explicit agentId wins over scope so admin can drill into a specific
      // agent's threads; mine keeps its own-id shortcut for non-admins.
      const agentId = q.agentId ? q.agentId : scope === 'mine' ? req.user.sub : undefined;
      const rows = await inbox.listThreads({
        agentId,
        status: q.status,
      });
      return reply.send({ data: rows });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/threads/:id/messages',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const rows = await inbox.listMessages(req.params.id);
      return reply.send({ data: rows });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/threads/:id/read',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      await inbox.markThreadRead(req.params.id);
      return reply.send({ ok: true });
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/threads/:id',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const body = req.body as { status?: WhatsAppThreadStatus; assignedAgentId?: string | null };
      const updated = await inbox.updateThread(req.params.id, body);
      return reply.send(updated);
    },
  );

  app.post<{ Params: { id: string } }>(
    '/threads/:id/reply',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      const body = req.body as { body: string };
      if (!body.body || !body.body.trim()) {
        return reply.status(400).send({ error: { code: 'EMPTY_BODY', message: 'Message body is required' } });
      }
      const result = await inbox.sendReply({
        threadId: req.params.id,
        body: body.body,
        authorUserId: req.user.sub,
      });
      return reply.status(201).send(result);
    },
  );

  // Media reply — multipart/form-data with a single `file` field plus
  // optional `caption` and `voiceNote` ("true"/"false") form fields.
  // Voice notes are sent via Evolution's /sendWhatsAppAudio so they render
  // as a playable PTT bubble on the recipient's phone.
  app.post<{ Params: { id: string } }>(
    '/threads/:id/reply-media',
    { preHandler: [verifyJWT, requirePermission('whatsapp:view')] },
    async (req, reply) => {
      if (!req.isMultipart()) {
        return reply.status(400).send({
          error: { code: 'EXPECT_MULTIPART', message: 'multipart/form-data required' },
        });
      }
      const file = await req.file();
      if (!file) {
        return reply
          .status(400)
          .send({ error: { code: 'NO_FILE', message: 'A media file is required' } });
      }

      // Accumulate the file to a Buffer — provider.sendMedia needs the full
      // bytes for base64 encoding anyway, and we also need to upload a copy
      // to our own storage.
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      if (file.file.truncated) {
        return reply.status(413).send({
          error: { code: 'FILE_TOO_LARGE', message: 'File exceeds the 50 MB limit' },
        });
      }

      // Form fields come back via `file.fields`. A field can be undefined,
      // an array (when repeated), or a single Multipart entry which is
      // either a file part or a scalar value — only the value shape has
      // `.value`. Narrow manually.
      const readField = (name: string): string => {
        const entry = (file.fields as Record<string, unknown>)[name];
        const first = Array.isArray(entry) ? entry[0] : entry;
        if (first && typeof first === 'object' && 'value' in first) {
          const v = (first as { value: unknown }).value;
          if (typeof v === 'string') return v;
        }
        return '';
      };
      const caption = readField('caption');
      const voiceNoteRaw = readField('voiceNote');
      const asVoiceNote = voiceNoteRaw === 'true' || voiceNoteRaw === '1';

      try {
        const result = await inbox.sendMediaReply({
          threadId: req.params.id,
          authorUserId: req.user.sub,
          fileBuffer: buf,
          fileMime: file.mimetype,
          fileName: file.filename,
          caption,
          asVoiceNote,
        });
        return reply.status(201).send(result);
      } catch (err) {
        const e = err as { statusCode?: number; code?: string; message?: string };
        if (e.statusCode && e.code) {
          return reply
            .status(e.statusCode)
            .send({ error: { code: e.code, message: e.message ?? 'Send failed' } });
        }
        throw err;
      }
    },
  );
}
