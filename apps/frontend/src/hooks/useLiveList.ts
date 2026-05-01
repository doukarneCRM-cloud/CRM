import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '@/services/socket';

// ─── Live list hook ──────────────────────────────────────────────────────────
//
// One canonical pattern for "fetch a list, then keep it surgically in sync via
// socket events." Replaces the per-page hand-rolled `useEffect(load, [])` +
// `socket.on('event', loadAll)` pattern that wipes scroll / selection / open
// modals on every emit.
//
// Each binding decides what to do with an incoming event:
//
//   - `kind: 'patch'`  — fetch the single item by id and merge into the array.
//                        Use for `order:updated` style events that touched
//                        one row.
//   - `kind: 'remove'` — drop the item by id. For `*:archived` / `*:deleted`.
//   - `kind: 'insert'` — fetch a single item by id and prepend / append (the
//                        caller picks). For `*:created` when surgical insert
//                        is preferred over a full refetch.
//   - `kind: 'refetch'` — call the loader again. Bulk events should fall back
//                         here since we can't know which rows changed.
//
// Every consumer gets the same guarantees: list state replaces only the
// affected row, scroll/selection state in the parent component is preserved,
// and there's no hidden refresh-key bump.

export type ListEventBinding<T extends { id: string }> =
  | {
      kind: 'patch';
      event: string;
      // Map the socket payload to the id we should refetch. Default: payload.orderId or payload.id.
      idFrom?: (payload: unknown) => string | undefined;
      // Fetch the fresh single item.
      fetchOne: (id: string) => Promise<T>;
    }
  | {
      kind: 'remove';
      event: string;
      idFrom?: (payload: unknown) => string | undefined;
    }
  | {
      kind: 'insert';
      event: string;
      idFrom?: (payload: unknown) => string | undefined;
      fetchOne: (id: string) => Promise<T>;
      position?: 'prepend' | 'append';
    }
  | {
      kind: 'refetch';
      event: string;
    };

export interface UseLiveListResult<T> {
  items: T[];
  loading: boolean;
  refetch: () => void;
  // Manual handles — useful when an action's response already returns the
  // fresh item, so the caller can patch optimistically without waiting for
  // the socket round-trip.
  patchLocal: (id: string, fields: Partial<T>) => void;
  removeLocal: (id: string) => void;
  setItems: React.Dispatch<React.SetStateAction<T[]>>;
}

function defaultIdFrom(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const p = payload as Record<string, unknown>;
  // Common shapes used across our backend emits.
  if (typeof p.id === 'string') return p.id;
  if (typeof p.orderId === 'string') return p.orderId;
  return undefined;
}

export function useLiveList<T extends { id: string }>(
  loader: () => Promise<T[]>,
  bindings: ReadonlyArray<ListEventBinding<T>>,
  // Re-run loader when any of these dependencies change (filters, page, etc.).
  // Stringify for stable comparison; objects with the same content but new
  // refs won't cause refetches.
  deps: unknown = null,
): UseLiveListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable refs so socket handlers don't capture stale closures.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await loaderRef.current();
      setItems(fresh);
    } catch {
      // Silently fail — global error handling deals with auth/network.
    } finally {
      setLoading(false);
    }
  }, []);

  const depKey = JSON.stringify(deps);
  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depKey, refetch]);

  // Socket subscriptions. Re-bind only when the *event names* actually change
  // — not on every render. Callers typically pass a fresh literal array
  // (`[{ kind: 'patch', event: 'order:updated', fetchOne }]`) on each render,
  // so a naive `bindings`-based dep would cause `socket.off` + `socket.on` on
  // every render → a microsecond gap where events are dropped, plus listener
  // churn under the hood. Sorting + joining the names keeps the signature
  // stable across renders that didn't actually change the binding list.
  const eventSig = [...bindings.map((b) => `${b.kind}:${b.event}`)].sort().join('|');
  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const handlers: Array<[string, (payload: unknown) => void]> = [];
    for (const binding of bindingsRef.current) {
      const handler = async (payload: unknown) => {
        const idFn = (binding as { idFrom?: (p: unknown) => string | undefined }).idFrom ?? defaultIdFrom;
        const id = binding.kind === 'refetch' ? null : idFn(payload);

        if (binding.kind === 'patch') {
          if (!id) return;
          try {
            const fresh = await binding.fetchOne(id);
            setItems((prev) => {
              const idx = prev.findIndex((it) => it.id === id);
              if (idx === -1) return prev;
              const next = prev.slice();
              next[idx] = { ...next[idx], ...fresh };
              return next;
            });
          } catch {
            setItems((prev) => prev.filter((it) => it.id !== id));
          }
          return;
        }

        if (binding.kind === 'remove') {
          if (!id) return;
          setItems((prev) => prev.filter((it) => it.id !== id));
          return;
        }

        if (binding.kind === 'insert') {
          if (!id) return;
          try {
            const fresh = await binding.fetchOne(id);
            setItems((prev) => {
              if (prev.some((it) => it.id === id)) return prev;
              return binding.position === 'append' ? [...prev, fresh] : [fresh, ...prev];
            });
          } catch {
            // Item may have been deleted between create + insert — silent.
          }
          return;
        }

        if (binding.kind === 'refetch') {
          await refetch();
          return;
        }
      };
      handlers.push([binding.event, handler]);
      socket.on(binding.event, handler);
    }

    return () => {
      for (const [ev, fn] of handlers) socket?.off(ev, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventSig, refetch]);

  const patchLocal = useCallback((id: string, fields: Partial<T>) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...next[idx], ...fields };
      return next;
    });
  }, []);

  const removeLocal = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  return { items, loading, refetch, patchLocal, removeLocal, setItems };
}
