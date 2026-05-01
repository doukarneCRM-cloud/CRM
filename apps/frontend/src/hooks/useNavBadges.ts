import { useEffect, useRef, useState } from 'react';
import { api } from '@/services/api';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';

// ─── Sidebar badge counts ────────────────────────────────────────────────────
//
// One round-trip on mount, then ticked locally in reaction to scoped socket
// events. The backend endpoint returns only the counts the caller has
// permission to see — `undefined` means "no badge for that nav item."
//
// Why local ticks vs refetching the endpoint on each event:
//   - Refetching on every order:* / coliix:error / return:* event would
//     mean a /nav/badges round-trip on every status change in the system,
//     which is exactly the "global hammer" we just removed elsewhere.
//   - Local arithmetic stays correct as long as we have the right hint
//     attached to the event. Where hints aren't enough (callbacksToday
//     depends on the clock + the order's callbackAt, which we don't get
//     in the patch), we fall back to a one-shot refetch.

export interface NavBadges {
  ordersPending?: number;
  callbacksToday?: number;
  returnsToVerify?: number;
  coliixErrors?: number;
  atelieTasks?: number;
}

interface OrderUpdatedPayload {
  orderId: string;
  ts: number;
  kpi?:
    | 'created'
    | 'confirmed'
    | 'delivered'
    | 'cancelled'
    | 'archived'
    | 'shipped'
    | 'returned'
    | 'reassigned';
}

export function useNavBadges(): NavBadges {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [badges, setBadges] = useState<NavBadges>({});
  // Pending refetch debouncer — coalesce a burst of events into a single
  // /nav/badges call instead of one per event.
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initial pull + one-shot refetch helper for "the hint isn't enough" cases.
  const refetch = async () => {
    try {
      const r = await api.get<NavBadges>('/nav/badges');
      setBadges(r.data);
    } catch {
      // Silent — global error handling deals with auth/network.
    }
  };

  const scheduleRefetch = () => {
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      void refetch();
    }, 1000);
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setBadges({});
      return;
    }
    void refetch();
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const onOrderCreated = () => {
      // A new order is pending until an agent acts. Ticks ordersPending.
      setBadges((b) =>
        b.ordersPending !== undefined ? { ...b, ordersPending: b.ordersPending + 1 } : b,
      );
    };

    const onOrderUpdated = (payload: unknown) => {
      const p = payload as OrderUpdatedPayload | undefined;
      if (!p?.kpi) {
        // Without a hint we can't know whether the change moved a counter,
        // so debounce-refetch to stay correct.
        scheduleRefetch();
        return;
      }
      // Surgical decrements when we know what just happened.
      if (p.kpi === 'confirmed' || p.kpi === 'cancelled' || p.kpi === 'archived') {
        setBadges((b) =>
          b.ordersPending !== undefined
            ? { ...b, ordersPending: Math.max(0, b.ordersPending - 1) }
            : b,
        );
      }
      if (p.kpi === 'returned') {
        setBadges((b) =>
          b.returnsToVerify !== undefined
            ? { ...b, returnsToVerify: b.returnsToVerify + 1 }
            : b,
        );
      }
    };

    const onOrderArchived = () => {
      setBadges((b) =>
        b.ordersPending !== undefined
          ? { ...b, ordersPending: Math.max(0, b.ordersPending - 1) }
          : b,
      );
    };

    const onColiixError = (payload: unknown) => {
      const resolved = (payload as { resolved?: boolean })?.resolved ?? false;
      if (resolved) return;
      setBadges((b) =>
        b.coliixErrors !== undefined ? { ...b, coliixErrors: b.coliixErrors + 1 } : b,
      );
    };

    const onColiixResolved = () => {
      setBadges((b) =>
        b.coliixErrors !== undefined
          ? { ...b, coliixErrors: Math.max(0, b.coliixErrors - 1) }
          : b,
      );
    };

    const onReturnsAdvanced = () => {
      // Verifying a return removes it from the to-verify queue. We don't
      // have a typed "verified" event yet — order:updated covers it via
      // the kpi hint, but only when the shipping status moved to a final
      // state. Schedule a refetch as a safety net.
      scheduleRefetch();
    };

    socket.on('order:created', onOrderCreated);
    socket.on('order:updated', onOrderUpdated);
    socket.on('order:archived', onOrderArchived);
    socket.on('coliix:error', onColiixError);
    socket.on('coliix:error:resolved', onColiixResolved);
    socket.on('return:scanned', onReturnsAdvanced);
    // Atelie task creation/completion ticks the atelie counter. Refetch
    // is honest here — task status logic is non-trivial.
    socket.on('task:created', scheduleRefetch);
    socket.on('task:updated', scheduleRefetch);
    socket.on('task:deleted', scheduleRefetch);

    return () => {
      socket?.off('order:created', onOrderCreated);
      socket?.off('order:updated', onOrderUpdated);
      socket?.off('order:archived', onOrderArchived);
      socket?.off('coliix:error', onColiixError);
      socket?.off('coliix:error:resolved', onColiixResolved);
      socket?.off('return:scanned', onReturnsAdvanced);
      socket?.off('task:created', scheduleRefetch);
      socket?.off('task:updated', scheduleRefetch);
      socket?.off('task:deleted', scheduleRefetch);
      // Drop any pending debounced refetch — without this, a no-hint event
      // arriving just before a logout / unmount fires `refetch()` after the
      // hook is gone, calling setBadges on an unmounted component.
      if (refetchTimer.current) {
        clearTimeout(refetchTimer.current);
        refetchTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  return badges;
}
