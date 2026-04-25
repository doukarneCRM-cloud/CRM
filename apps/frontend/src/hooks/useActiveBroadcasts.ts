import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { broadcastsApi, type Broadcast } from '@/services/broadcastsApi';

interface ClosedPayload {
  id: string;
}

/**
 * Subscribe to the current user's active broadcast feed.
 *
 *  - Pulls `/broadcasts/active/me` once on auth (and after socket reconnect)
 *    to seed pending POPUPs and active BARs.
 *  - Listens for `broadcast:new` (server fan-out at create time) and pushes
 *    incoming broadcasts onto the right list.
 *  - Listens for `broadcast:closed` (admin deactivated a BAR) and removes the
 *    corresponding entry from the bars list.
 *
 * Both `<BroadcastPopupGate />` and `<BroadcastTopBar />` consume this hook
 * — they each filter the feed they care about.
 */
export function useActiveBroadcasts() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [popups, setPopups] = useState<Broadcast[]>([]);
  const [bars, setBars] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);

  // Public removers used by the popup gate after the user clicks OK so the
  // queue advances without waiting for a re-fetch.
  const removePopup = useCallback((id: string) => {
    setPopups((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const feed = await broadcastsApi.listActiveForMe();
      setPopups(feed.popups);
      setBars(feed.bars);
    } catch {
      /* ignore — auth or transient error; we'll retry on next reconnect */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setPopups([]);
      setBars([]);
      setLoading(false);
      return;
    }
    refresh();
  }, [isAuthenticated, refresh]);

  useEffect(() => {
    if (!isAuthenticated) return;

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const handleNew = (payload: Broadcast) => {
      if (!payload || !payload.id) return;
      if (payload.kind === 'POPUP') {
        setPopups((prev) =>
          prev.some((p) => p.id === payload.id) ? prev : [...prev, payload],
        );
      } else if (payload.kind === 'BAR') {
        setBars((prev) =>
          prev.some((b) => b.id === payload.id) ? prev : [payload, ...prev],
        );
      }
    };

    const handleClosed = (payload: ClosedPayload) => {
      if (!payload?.id) return;
      setBars((prev) => prev.filter((b) => b.id !== payload.id));
      // POPUP can also be closed (e.g. admin hard-deletes); drop it from the
      // queue so the user isn't blocked on a phantom modal.
      setPopups((prev) => prev.filter((p) => p.id !== payload.id));
    };

    // Re-pull on reconnect so we don't miss broadcasts sent while offline.
    const handleConnect = () => {
      refresh();
    };

    socket.on('broadcast:new', handleNew);
    socket.on('broadcast:closed', handleClosed);
    socket.on('connect', handleConnect);

    return () => {
      socket.off('broadcast:new', handleNew);
      socket.off('broadcast:closed', handleClosed);
      socket.off('connect', handleConnect);
    };
  }, [isAuthenticated, refresh]);

  return { popups, bars, loading, removePopup, refresh };
}
