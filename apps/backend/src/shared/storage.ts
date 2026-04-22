import path from 'node:path';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

// Storage adapter — uploads go to Cloudflare R2 when R2 env vars are set,
// otherwise fall back to the local `uploads/` folder (dev default).
// Every call returns a public URL safe to persist on Product.imageUrl, etc.

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  // Audio — WhatsApp voice notes are `audio/ogg; codecs=opus`, regular audio
  // is usually mp4 or mpeg. Keep the `; codec=...` form stripped by caller.
  'audio/ogg': '.ogg',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  // Video
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/3gpp': '.3gp',
  // Documents (most common WA pass-throughs)
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
};

export interface UploadOptions {
  folder: string;
  mimeType: string;
  stream: Readable;
}

export interface UploadResult {
  url: string;
}

// ── R2 (when env vars present) ────────────────────────────────────────────────

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

const useR2 =
  !!R2_ENDPOINT && !!R2_BUCKET && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_URL;

let s3Client: S3Client | null = null;
if (useR2) {
  s3Client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadToR2(opts: UploadOptions): Promise<UploadResult> {
  if (!s3Client) throw new Error('R2 client not initialised');
  const ext = EXT_BY_MIME[opts.mimeType] ?? '.bin';
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const key = `${opts.folder}/${filename}`;

  const body = await streamToBuffer(opts.stream);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: opts.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );

  const base = R2_PUBLIC_URL!.replace(/\/+$/, '');
  return { url: `${base}/${key}` };
}

// ── Local disk (dev fallback) ─────────────────────────────────────────────────

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');

async function uploadToLocal(opts: UploadOptions): Promise<UploadResult> {
  const dir = path.join(UPLOADS_ROOT, opts.folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext = EXT_BY_MIME[opts.mimeType] ?? '.bin';
  const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
  const destPath = path.join(dir, filename);

  try {
    await pipeline(opts.stream, fs.createWriteStream(destPath));
  } catch (err) {
    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    throw err;
  }

  return { url: `/uploads/${opts.folder}/${filename}` };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isRemoteStorage(): boolean {
  return useR2;
}

export async function uploadFile(opts: UploadOptions): Promise<UploadResult> {
  return useR2 ? uploadToR2(opts) : uploadToLocal(opts);
}
