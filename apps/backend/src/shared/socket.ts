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
    }

    // Mark online
    onlineUsers.set(user.sub, { socketId: socket.id, lastHeartbeat: new Date() });
    const dbUser = await prisma.user
      .update({
        where: { id: user.sub },
        data: { isOnline: true, lastSeenAt: new Date() },
        select: { name: true, avatarUrl: true },
      })
      .catch((err) => {
        app.log.warn({ err, userId: user.sub }, '[Socket] user not found — disconnecting');
        return null;
      });
    if (!dbUser) {
      socket.disconnect(true);
      return;
    }
    lastPersistedAt.set(user.sub, Date.now());

    socket.to('admin').emit('user:online', {
      userId: user.sub,
      name: dbUser.name,
      avatarUrl: dbUser.avatarUrl,
      roleName: user.roleName,
    });

    socket.on('heartbeat', async () => {
      const now = Date.now();
      const entry = onlineUsers.get(user.sub);
      if (entry) entry.lastHeartbeat = new Date(now);
      socket.emit('heartbeat:ack');

      const lastPersist = lastPersistedAt.get(user.sub) ?? 0;
      if (now - lastPersist < HEARTBEAT_PERSIST_MS) return;
      lastPersistedAt.set(user.sub, now);
      prisma.user
        .update({ where: { id: user.sub }, data: { lastHeartbeat: new Date(now) } })
        .catch((err) => app.log.warn({ err, userId: user.sub }, '[Socket] heartbeat persist failed'));
    });

    socket.on('disconnect', async () => {
      app.log.info(`[Socket] disconnected: ${user.sub}`);
      onlineUsers.delete(user.sub);
      lastPersistedAt.delete(user.sub);

      await prisma.user.update({
        where: { id: user.sub },
        data: { isOnline: false, lastSeenAt: new Date() },
      });

      io.to('admin').emit('user:offline', { userId: user.sub });
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
        io.to('admin').emit('user:offline', { userId });
      }
    }
  }, 60_000);

  return io;
}
