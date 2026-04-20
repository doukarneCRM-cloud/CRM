import type { FastifyRequest, FastifyReply } from 'fastify';
import { uploadFile } from '../../shared/storage';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function uploadProductImage(request: FastifyRequest, reply: FastifyReply) {
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
        message: 'Only PNG, JPEG, WebP, or GIF images are allowed',
        statusCode: 400,
      },
    });
  }

  try {
    const { url } = await uploadFile({
      folder: 'products',
      mimeType: file.mimetype,
      stream: file.file,
    });

    // @fastify/multipart flags `truncated` when the file exceeded the size
    // limit. For local storage we could clean up the partial file, but for R2
    // the PUT has already completed — we report it and move on. Either way,
    // the stream has been consumed by now.
    if (file.file.truncated) {
      return reply.status(413).send({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Image exceeds the 8 MB limit',
          statusCode: 413,
        },
      });
    }

    return reply.send({ url });
  } catch (err) {
    request.log.error({ err }, 'upload failed');
    return reply.status(500).send({
      error: { code: 'UPLOAD_FAILED', message: 'Failed to store upload', statusCode: 500 },
    });
  }
}
