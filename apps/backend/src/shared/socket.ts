import { Server, type Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { verifyAccessToken } from './jwt';
import { prisma } from './prisma';

let io: Server;

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO not initialized');
  return io;
}

// ─── Online tracking (in-memory, keyed by userId) ────────────────────────────
const onlineUsers = new Map<string, { socketId: string; lastHeartbeat: Date }>();

// Throttle lastHeartbeat DB persistence to once per minute per user. Ping
// traffic is continuous; keeping it in-memory (above) is enough for the stale
// cleanup, and the DB write only needs to be accurate to the minute.
const HEARTBEAT_PERSIST_MS = 60_000;
const lastPersistedAt = new Map<string, number>();

export function getOnlineUserIds(): string[] {
  return Array.from(onlineUsers.keys());
}

// ─── Emit helper used by services ────────────────────────────────────────────
export function emitToRoom(room: string, event: string, data: unknown) {
  getIO().to(room).emit(event, data);
}

export function emitToUser(userId: string, event: string, data: unknown) {
  getIO().to(`agent:${userId}`).emit(event, data);
}

export function emitToAll(event: string, data: unknown) {
  getIO().emit(event, data);
}

// ─── Initialize and attach to Fastify's HTTP server ──────────────────────────
export function initSocket(app: FastifyInstance) {
  io = new Server(app.server, {
    cors: {
      origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 25000,
  });

  // ── JWT Auth handshake ────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication token missing'));
    }
    try {
      const user = verifyAccessToken(token);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ── On connection ─────────────────────────────────────────────────────────
  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user;
    if (!user) return socket.disconnect();

    app.log.info(`[Socket] connected: ${user.sub} (${user.roleName})`);

    // Join rooms based on role/permissions
    socket.join(`agent:${user.sub}`); // always — per-user private channel
    socket.join('orders:all');        // always
    socket.join('tasks:shared');      // always — shared Atelie tasks reach everyone

    if (
      user.roleName === 'admin' ||
      user.roleName === 'supervisor'
    ) {
      socket.join('dashboard');
      socket.join('admin');
      socket.join('whatsapp:monitor');
    }

    // Verify the user exists and cache their identity for online/offline
    // broadcasts. The mark-online side-effect lives in markOnline() below.
    const dbUser = await prisma.user
      .findUnique({ where: { id: user.sub }, select: { name: true, avatarUrl: true } })
      .catch((err) => {
        app.log.warn({ err, userId: user.sub }, '[Socket] user lookup failed');
        return null;
      });
    if (!dbUser) {
      socket.disconnect(true);
      return;
    }

    // ── Helpers: presence transitions tied to this socket ────────────────
    // The user can transition online/offline multiple times within one
    // socket lifetime now that presence is gated on real input activity
    // (mouse / keys / scroll / tab visible). Each transition is idempotent
    // and only writes when the in-memory state actually changes.
    async function markOnline() {
      const existing = onlineUsers.get(user.sub);
      if (existing && existing.socketId === socket.id) {
        existing.lastHeartbeat = new Date();
        return;
      }
      onlineUsers.set(user.sub, { socketId: socket.id, lastHeartbeat: new Date() });
      lastPersistedAt.set(user.sub, Date.now());
      await prisma.user
        .update({ where: { id: user.sub }, data: { isOnline: true, lastSeenAt: new Date() } })
        .catch((err) => app.log.warn({ err, userId: user.sub }, '[Socket] markOnline persist failed'));
      io.emit('user:online', {
        userId: user.sub,
        name: dbUser!.name,
        avatarUrl: dbUser!.avatarUrl,
        roleName: user.roleName,
      });
    }

    async function markOffline() {
      const entry = onlineUsers.get(user.sub);
      // Only flip offline if this socket is the one currently tracked. A
      // newer socket replacing this one (refresh / second tab) must not
      // clobber the map.
      if (!entry || entry.socketId !== socket.id) return;
      onlineUsers.delete(user.sub);
      lastPersistedAt.delete(user.sub);
      await prisma.user
        .update({ where: { id: user.sub }, data: { isOnline: false, lastSeenAt: new Date() } })
        .catch((err) => app.log.warn({ err, userId: user.sub }, '[Socket] markOffline persist failed'));
      io.emit('user:offline', { userId: user.sub });
    }

    // Initial connect counts as "user is here right now" — page just loaded.
    await markOnline();

    socket.on('heartbeat', async () => {
      const now = Date.now();
      const entry = onlineUsers.get(user.sub);
      // If the entry is missing (idle-removed) or owned by another socket,
      // resurrect — this socket is alive AND the client only heartbeats
      // while active, so the user is genuinely back.
      if (!entry || entry.socketId !== socket.id) {
        await markOnline();
      } else {
        entry.lastHeartbeat = new Date(now);
      }
      socket.emit('heartbeat:ack');

      const lastPersist = lastPersistedAt.get(user.sub) ?? 0;
      if (now - lastPersist < HEARTBEAT_PERSIST_MS) return;
      lastPersistedAt.set(user.sub, now);
      prisma.user
        .update({ where: { id: user.sub }, data: { lastHeartbeat: new Date(now) } })
        .catch((err) => app.log.warn({ err, userId: user.sub }, '[Socket] heartbeat persist failed'));
    });

    socket.on('presence:active', () => {
      void markOnline();
    });

    socket.on('presence:idle', () => {
      void markOffline();
    });

    socket.on('disconnect', async () => {
      app.log.info(`[Socket] disconnected: ${user.sub}`);
      await markOffline();
    });
  });

  setInterval(async () => {
    const threshold = new Date(Date.now() - 2 * 60 * 1000);
    for (const [userId, entry] of onlineUsers.entries()) {
      if (entry.lastHeartbeat < threshold) {
        onlineUsers.delete(userId);
        lastPersistedAt.delete(userId);
        await prisma.user
          .update({ where: { id: userId }, data: { isOnline: false } })
          .catch((err) => app.log.warn({ err, userId }, '[Socket] stale cleanup failed'));
        io.emit('user:offline', { userId });
      }
    }
  }, 60_000);

  return io;
}
