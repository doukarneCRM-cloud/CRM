import { useEffect, useRef, type MutableRefObject } from 'react';
import { getSocket } from '@/services/socket';
import { useAuthStore } from '@/store/authStore';
import { useToastStore } from '@/store/toastStore';
import { playNotificationSound } from '@/utils/sound';
import { ROUTES } from '@/constants/routes';

interface AssignedPayload {
  orderId: string;
  agentId?: string;
  reference?: string;
  customerName?: string;
  assignedBy?: string;
  product?: { name: string; extraCount: number } | null;
}

interface ConfirmedPayload {
  orderId: string;
  reference?: string;
  customerName?: string;
  agentName?: string;
  product?: { name: string; extraCount: number } | null;
}

interface NotificationNewPayload {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  orderId: string | null;
  product?: { name: string; extraCount: number } | null;
}

/**
 * Wire order socket events to the toast + sound layer.
 *
 * Agents hear/see a toast when an order lands in their queue (`order:assigned`
 * targeted at their personal room). Admins/supervisors get a cheerful confirm
 * cue on `order:confirmed` (emitted to the `admin` room only).
 *
 * A short per-orderId dedupe window prevents double-plays when both the
 * broadcast and personal-room copies of an event arrive.
 */
export function useOrderNotifications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);
  const pushToast = useToastStore((s) => s.push);
  const recentAssign = useRef<Map<string, number>>(new Map());
  const recentConfirm = useRef<Map<string, number>>(new Map());
  const recentDelivered = useRef<Map<string, number>>(new Map());
  const recentNewOrder = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let socket: ReturnType<typeof getSocket>;
    try {
      socket = getSocket();
    } catch {
      return;
    }

    const roleName = user.role.name.toLowerCase();
    const isAdmin = roleName === 'admin' || roleName === 'supervisor';

    // Dedupe is only meant to catch the *same event arriving twice* (e.g.
    // both a private-room echo and a broadcast hit on the same socket within
    // a few hundred ms). 3000 ms was too long — legitimate, distinct
    // notifications happening seconds apart on the same orderId would get
    // dropped silently, which the call-center team felt as "toasts skipping".
    // 800 ms is plenty to dedupe true echoes without eating real updates.
    const withinDedupe = (
      map: MutableRefObject<Map<string, number>>,
      orderId: string,
      windowMs = 800,
    ) => {
      const bucket = map.current;
      const now = Date.now();
      const last = bucket.get(orderId) ?? 0;
      if (now - last < windowMs) return true;
      bucket.set(orderId, now);
      if (bucket.size > 200) {
        const cutoff = now - 10_000;
        for (const [k, t] of bucket) {
          if (t < cutoff) bucket.delete(k);
        }
      }
      return false;
    };

    const handleAssigned = (payload: AssignedPayload) => {
      const targetedAtMe = !payload.agentId || payload.agentId === user.id;
      if (!targetedAtMe) return;
      if (withinDedupe(recentAssign, payload.orderId)) return;

      playNotificationSound('assignment');

      const ref = payload.reference ? ` #${payload.reference}` : '';
      pushToast({
        kind: 'assignment',
        title: `New order assigned${ref}`,
        body: payload.customerName
          ? `Customer: ${payload.customerName}${payload.assignedBy ? ` · by ${payload.assignedBy}` : ''}`
          : 'Open it in your Call Center to start confirming.',
        href: ROUTES.CALL_CENTER,
        product: payload.product ?? null,
      });
    };

    const handleConfirmed = (payload: ConfirmedPayload) => {
      if (!isAdmin) return;
      if (withinDedupe(recentConfirm, payload.orderId)) return;

      playNotificationSound('confirmed');

      const ref = payload.reference ? ` #${payload.reference}` : '';
      pushToast({
        kind: 'confirmed',
        title: `Order confirmed${ref}`,
        body: [payload.customerName, payload.agentName ? `by ${payload.agentName}` : null]
          .filter(Boolean)
          .join(' · ') || undefined,
        href: ROUTES.ORDERS,
        product: payload.product ?? null,
      });
    };

    const handleDelivered = (payload: ConfirmedPayload) => {
      if (!isAdmin) return;
      if (withinDedupe(recentDelivered, payload.orderId)) return;

      // "Cha-ching" cue — celebratory two-bell synth designed to be
      // recognizable from across the room when an order delivers.
      playNotificationSound('delivered');

      const ref = payload.reference ? ` #${payload.reference}` : '';
      pushToast({
        kind: 'delivered',
        title: `Order delivered${ref}`,
        body: [payload.customerName, payload.agentName ? `by ${payload.agentName}` : null]
          .filter(Boolean)
          .join(' · ') || undefined,
        href: ROUTES.ORDERS,
        product: payload.product ?? null,
      });
    };

    const handleNotification = (payload: NotificationNewPayload) => {
      if (!isAdmin) return;

      // Webhook auto-import failure — surface immediately so the team can
      // investigate before more orders pile up. Dedupe by notification id
      // since `orderId` is null for these (the order never got created).
      if (payload.kind === 'integration_error') {
        if (withinDedupe(recentNewOrder, payload.id)) return;
        playNotificationSound('assignment');
        pushToast({
          kind: 'error',
          title: payload.title,
          body: payload.body ?? undefined,
          href: payload.href ?? '/integrations',
        });
        return;
      }

      if (payload.kind !== 'order_new') return;
      const dedupeKey = payload.orderId ?? payload.id;
      if (withinDedupe(recentNewOrder, dedupeKey)) return;

      playNotificationSound('assignment');

      pushToast({
        kind: 'new_order',
        title: payload.title,
        body: payload.body ?? undefined,
        href: payload.href ?? ROUTES.ORDERS,
        product: payload.product ?? null,
      });
    };

    socket.on('order:assigned', handleAssigned);
    socket.on('order:confirmed', handleConfirmed);
    socket.on('order:delivered', handleDelivered);
    socket.on('notification:new', handleNotification);
    return () => {
      socket.off('order:assigned', handleAssigned);
      socket.off('order:confirmed', handleConfirmed);
      socket.off('order:delivered', handleDelivered);
      socket.off('notification:new', handleNotification);
    };
  }, [isAuthenticated, user, pushToast]);
}
