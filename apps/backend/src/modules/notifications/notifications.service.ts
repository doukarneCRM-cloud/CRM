import { prisma } from '../../shared/prisma';
import { emitToUser } from '../../shared/socket';

export type NotificationKind = 'order_assigned' | 'order_confirmed' | 'order_new';

export interface CreateNotificationInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  orderId?: string;
}

export interface NotificationProductMeta {
  name: string;
  extraCount: number;
}

export async function fetchOrderProductMeta(
  orderId: string | null,
): Promise<NotificationProductMeta | null> {
  if (!orderId) return null;
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: {
      variant: {
        select: { product: { select: { name: true } } },
      },
    },
  });
  if (items.length === 0) return null;
  const names: string[] = [];
  for (const it of items) {
    const n = it.variant?.product?.name;
    if (n && !names.includes(n)) names.push(n);
  }
  if (names.length === 0) return null;
  return { name: names[0], extraCount: Math.max(0, names.length - 1) };
}

async function attachProductMeta<T extends { orderId: string | null }>(
  notif: T,
): Promise<T & { product: NotificationProductMeta | null }> {
  const product = await fetchOrderProductMeta(notif.orderId);
  return { ...notif, product };
}

// Notifications are best-effort: callers fire-and-forget, and a DB or socket
// failure here must never surface to the triggering API call. Errors are
// logged so they aren't silently lost.
export async function createNotification(input: CreateNotificationInput) {
  try {
    const notif = await prisma.notification.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        href: input.href,
        orderId: input.orderId,
      },
    });
    const enriched = await attachProductMeta(notif);
    emitToUser(input.userId, 'notification:new', enriched);
    return enriched;
  } catch (err) {
    console.error('[notifications] createNotification failed', err);
    return null;
  }
}

// Fan-out: one row per admin/supervisor so each has their own read state.
export async function createAdminNotification(
  input: Omit<CreateNotificationInput, 'userId'>,
) {
  try {
    const admins = await prisma.user.findMany({
      where: {
        isActive: true,
        role: { name: { in: ['admin', 'supervisor'] } },
      },
      select: { id: true },
    });
    const created = await prisma.$transaction(
      admins.map((a) =>
        prisma.notification.create({
          data: {
            userId: a.id,
            kind: input.kind,
            title: input.title,
            body: input.body,
            href: input.href,
            orderId: input.orderId,
          },
        }),
      ),
    );
    // Product meta is the same across the fan-out since orderId is shared
    const product = await fetchOrderProductMeta(input.orderId ?? null);
    for (const n of created) {
      emitToUser(n.userId, 'notification:new', { ...n, product });
    }
    return created;
  } catch (err) {
    console.error('[notifications] createAdminNotification failed', err);
    return [];
  }
}

export async function listNotifications(userId: string) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  const enriched = await Promise.all(items.map(attachProductMeta));
  return { items: enriched, unreadCount };
}

export async function markAllRead(userId: string) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  });
  return { updated: result.count };
}
