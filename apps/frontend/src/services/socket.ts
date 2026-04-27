import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

// Presence is tied to real input activity, not just "tab open with a live
// socket". After IDLE_THRESHOLD_MS without mouse / scroll / key / touch
// input — or as soon as the tab is hidden — we tell the server we're idle
// so other agents see us flip offline. The next input event flips us back.
const IDLE_THRESHOLD_MS = 60_000;
const IDLE_CHECK_MS = 5_000;
const HEARTBEAT_MS = 30_000;
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
  'focus',
] as const;

let socket: Socket | null = null;
let presenceState: 'active' | 'idle' = 'active';
let lastActivityAt = Date.now();

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let idleCheckInterval: ReturnType<typeof setInterval> | null = null;
let listenersAttached = false;

function emitActive() {
  if (presenceState === 'active') return;
  presenceState = 'active';
  socket?.emit('presence:active');
}

function emitIdle() {
  if (presenceState === 'idle') return;
  presenceState = 'idle';
  socket?.emit('presence:idle');
}

function onActivity() {
  lastActivityAt = Date.now();
  if (!document.hidden) emitActive();
}

function onVisibilityChange() {
  if (document.hidden) {
    emitIdle();
  } else {
    lastActivityAt = Date.now();
    emitActive();
  }
}

function attachActivityListeners() {
  if (listenersAttached) return;
  for (const e of ACTIVITY_EVENTS) {
    window.addEventListener(e, onActivity, { passive: true });
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  listenersAttached = true;
}

function detachActivityListeners() {
  if (!listenersAttached) return;
  for (const e of ACTIVITY_EVENTS) {
    window.removeEventListener(e, onActivity);
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
  listenersAttached = false;
}

function startTimers() {
  stopTimers();
  heartbeatInterval = setInterval(() => {
    // Only heartbeat while the user is actually present. When idle/hidden
    // we stop heartbeating; the server's stale-sweep is the safety net.
    if (presenceState === 'active' && !document.hidden) {
      socket?.emit('heartbeat');
    }
  }, HEARTBEAT_MS);

  idleCheckInterval = setInterval(() => {
    if (presenceState === 'active' && Date.now() - lastActivityAt > IDLE_THRESHOLD_MS) {
      emitIdle();
    }
  }, IDLE_CHECK_MS);
}

function stopTimers() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

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
    presenceState = 'active';
    lastActivityAt = Date.now();
    attachActivityListeners();
    startTimers();
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    stopTimers();
    detachActivityListeners();
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  stopTimers();
  detachActivityListeners();
  socket?.disconnect();
  socket = null;
}
