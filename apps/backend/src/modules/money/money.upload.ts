/**
 * Shared multipart upload handler for Money attachments (expense invoices,
 * commission-payment proofs). Accepts images + PDFs up to the global
 * fastify/multipart limit (8 MB).
 */

import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest, FastifyReply } from 'fastify';

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
]);

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

export async function uploadMoneyFile(
  subdir: 'expenses' | 'commission',
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const file = await request.file();
  if (!file) {
    return reply
      .status(400)
      .send({ error: { code: 'NO_FILE', message: 'No file uploaded', statusCode: 400 } });
  }

  if (!ALLOWED_MIME.has(file.mimetype)) {
    return reply.status(400).send({
      error: {
        code: 'UNSUPPORTED_FORMAT',
        message: 'Only PNG, JPEG, WebP, GIF, or PDF files are allowed',
        statusCode: 400,
      },
    });
  }

  const dir = path.resolve(process.cwd(), 'uploads', subdir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ext = EXT_BY_MIME[file.mimetype] ?? '.bin';
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const destPath = path.join(dir, filename);

  try {
    await pipeline(file.file, fs.createWriteStream(destPath));
  } catch (err) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    throw err;
  }

  if (file.file.truncated) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    return reply.status(413).send({
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File exceeds the 8 MB limit',
        statusCode: 413,
      },
    });
  }

  const publicUrl = `/uploads/${subdir}/${filename}`;
  return reply.send({ url: publicUrl });
}
