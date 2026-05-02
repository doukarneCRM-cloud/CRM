import type { FastifyInstance, FastifyReply } from 'fastify';
import { Readable } from 'node:stream';
import bcrypt from 'bcryptjs';
import { prisma } from '../../shared/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/jwt';
import {
  recordFailedLogin,
  getFailedLoginCount,
  getLoginLockoutTTL,
  clearFailedLogins,
  MAX_FAILED_ATTEMPTS,
} from '../../shared/redis';
import { LoginBody, RefreshBody, LogoutBody, UpdateProfileBody } from './auth.schema';
import { uploadFile } from '../../shared/storage';

const AVATAR_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const REMEMBER_ME_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function refreshExpiry(rememberMe: boolean): Date {
  return new Date(Date.now() + (rememberMe ? REMEMBER_ME_MS : DEFAULT_REFRESH_MS));
}

function errorReply(reply: FastifyReply, status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return reply.status(status).send({
    error: { code, message, statusCode: status, ...(extra ?? {}) },
  });
}

const USER_WITH_PERMS_INCLUDE = {
  role: { include: { permissions: { include: { permission: true } } } },
} as const;

type UserWithPerms = NonNullable<Awaited<ReturnType<typeof loadUserWithPermissions>>>;

async function loadUserWithPermissions(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    include: USER_WITH_PERMS_INCLUDE,
  });
}

function toUserDTO(user: UserWithPerms) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: { id: user.roleId, name: user.role.name, label: user.role.label },
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  };
}

export async function authRoutes(app: FastifyInstance) {
  // ── POST /api/v1/auth/login ─────────────────────────────────────────────
  app.post('/login', async (request, reply) => {
    const ip = request.ip;

    const failCount = await getFailedLoginCount(ip);
    if (failCount >= MAX_FAILED_ATTEMPTS) {
      const ttl = await getLoginLockoutTTL(ip);
      return errorReply(reply, 429, 'LOCKED_OUT', `Account locked. Try again in ${Math.ceil(ttl / 60)} minutes.`, { ttl });
    }

    const parsed = LoginBody.safeParse(request.body);
    if (!parsed.success) {
      return errorReply(reply, 400, 'VALIDATION_ERROR', 'Invalid request body', { issues: parsed.error.issues });
    }

    const { email, password, rememberMe } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: USER_WITH_PERMS_INCLUDE,
    });

    if (!user || !user.isActive) {
      await recordFailedLogin(ip);
      return errorReply(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const count = await recordFailedLogin(ip);
      const remaining = MAX_FAILED_ATTEMPTS - count;
      return errorReply(reply, 401, 'INVALID_CREDENTIALS', 'Invalid email or password', {
        attemptsRemaining: Math.max(0, remaining),
      });
    }

    await clearFailedLogins(ip);

    // Fire-and-forget: socket connect will also update lastSeenAt, but this
    // covers non-socket clients (REST-only, mobile future).
    prisma.user
      .update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })
      .catch((err) => app.log.warn({ err, userId: user.id }, '[auth] lastSeenAt update failed'));

    const tokenPayload = {
      sub: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: user.role.name,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken(tokenPayload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: refreshExpiry(rememberMe),
        rememberMe,
      },
    });

    return reply.status(200).send({
      accessToken,
      refreshToken,
      user: toUserDTO(user),
    });
  });

  // ── POST /api/v1/auth/refresh ───────────────────────────────────────────
  app.post(
    '/refresh',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = RefreshBody.safeParse(request.body);
      if (!parsed.success) {
        return errorReply(reply, 400, 'VALIDATION_ERROR', 'Invalid request body');
      }

      const { refreshToken } = parsed.data;

      let payload;
      try {
        payload = verifyRefreshToken(refreshToken);
      } catch {
        return errorReply(reply, 401, 'INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token');
      }

      const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
      if (!stored || stored.expiresAt < new Date()) {
        return errorReply(reply, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token revoked or expired');
      }

      await prisma.refreshToken.delete({ where: { token: refreshToken } });

      const tokenPayload = {
        sub: payload.sub,
        email: payload.email,
        roleId: payload.roleId,
        roleName: payload.roleName,
      };

      const newAccess = signAccessToken(tokenPayload);
      const newRefresh = signRefreshToken(tokenPayload);

      await prisma.refreshToken.create({
        data: {
          token: newRefresh,
          userId: payload.sub,
          expiresAt: refreshExpiry(stored.rememberMe),
          rememberMe: stored.rememberMe,
        },
      });

      return reply.status(200).send({ accessToken: newAccess, refreshToken: newRefresh });
    },
  );

  // ── POST /api/v1/auth/logout ────────────────────────────────────────────
  app.post(
    '/logout',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = LogoutBody.safeParse(request.body);
      if (!parsed.success) {
        return errorReply(reply, 400, 'VALIDATION_ERROR', 'Invalid request body');
      }

      const { refreshToken } = parsed.data;

      // Silently revoke — do not leak whether token existed
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });

      return reply.status(200).send({ message: 'Logged out' });
    },
  );

  // ── GET /api/v1/auth/me ─────────────────────────────────────────────────
  app.get('/me', { preHandler: [app.verifyJWT] }, async (request, reply) => {
    const user = await loadUserWithPermissions(request.user.sub);
    if (!user) return errorReply(reply, 404, 'NOT_FOUND', 'User not found');
    return reply.status(200).send(toUserDTO(user));
  });

  // ── PATCH /api/v1/auth/me ───────────────────────────────────────────────
  // Self-service profile edits (display name for now).
  app.patch('/me', { preHandler: [app.verifyJWT] }, async (request, reply) => {
    const parsed = UpdateProfileBody.safeParse(request.body);
    if (!parsed.success) {
      return errorReply(reply, 400, 'VALIDATION_ERROR', 'Invalid request body', { issues: parsed.error.issues });
    }
    const { name } = parsed.data;
    if (name === undefined) {
      const user = await loadUserWithPermissions(request.user.sub);
      if (!user) return errorReply(reply, 404, 'NOT_FOUND', 'User not found');
      return reply.send(toUserDTO(user));
    }
    await prisma.user.update({ where: { id: request.user.sub }, data: { name } });
    const user = await loadUserWithPermissions(request.user.sub);
    if (!user) return errorReply(reply, 404, 'NOT_FOUND', 'User not found');
    return reply.send(toUserDTO(user));
  });

  // ── POST /api/v1/auth/me/avatar ─────────────────────────────────────────
  // Multipart upload; stores file and saves the public URL on the user.
  app.post('/me/avatar', { preHandler: [app.verifyJWT] }, async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return errorReply(reply, 400, 'NO_FILE', 'No file uploaded');
    }
    if (!AVATAR_MIME.has(file.mimetype)) {
      return errorReply(reply, 400, 'UNSUPPORTED_FORMAT', 'Only PNG, JPEG, WebP, or GIF images are allowed');
    }
    try {
      // Buffer the upload first so we can detect a truncated stream BEFORE
      // committing the (partial) bytes to storage. Otherwise oversized files
      // get persisted to R2/disk and we only return 413 after the wasteful
      // write completes.
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (file.file.truncated) {
        return errorReply(reply, 413, 'FILE_TOO_LARGE', 'Image exceeds the 8 MB limit');
      }
      const { url } = await uploadFile({
        folder: 'avatars',
        mimeType: file.mimetype,
        stream: Readable.from(Buffer.concat(chunks)),
      });
      await prisma.user.update({ where: { id: request.user.sub }, data: { avatarUrl: url } });
      const user = await loadUserWithPermissions(request.user.sub);
      if (!user) return errorReply(reply, 404, 'NOT_FOUND', 'User not found');
      return reply.send(toUserDTO(user));
    } catch (err) {
      request.log.error({ err }, 'avatar upload failed');
      return errorReply(reply, 500, 'UPLOAD_FAILED', 'Failed to store avatar');
    }
  });
}
