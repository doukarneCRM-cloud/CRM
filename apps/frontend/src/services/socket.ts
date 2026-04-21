import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  // Lazy-init: if a component mounts before AppLayout's useSocket effect has
  // called connectSocket (e.g. a direct page refresh on /call-center), we
  // bootstrap the connection here so listeners can attach immediately.
  if (!socket) return connectSocket();
  return socket;
}

export function connectSocket(): Socket {
  const { accessToken } = useAuthStore.getState();

  if (socket?.connected) return socket;

  // Disconnect existing stale socket
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    startHeartbeat();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    stopHeartbeat();
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  stopHeartbeat();
  socket?.disconnect();
  socket = null;
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    socket?.emit('heartbeat');
  }, 30_000); // every 30 seconds
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}
