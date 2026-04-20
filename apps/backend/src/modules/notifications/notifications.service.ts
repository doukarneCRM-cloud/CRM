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
    emitToUser(input.userId, 'notification:new', notif);
    return notif;
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
    for (const n of created) {
      emitToUser(n.userId, 'notification:new', n);
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
  return { items, unreadCount };
}

export async function markAllRead(userId: string) {
  const now = new Date();
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now },
  });
  return { updated: result.count };
}
