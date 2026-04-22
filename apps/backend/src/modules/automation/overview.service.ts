import { prisma } from '../../shared/prisma';
import { getSessionUsage } from '../../shared/rateLimit';

// Admin dashboard snapshot. One endpoint so the Overview tab hits a single
// request — chatty endpoints on a live page are a worse experience than a
// slightly bigger response.
export async function getOverviewSnapshot() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const [
    sessions,
    queueCounts,
    todaysLogs,
    feed,
    topTriggers,
    optOuts7d,
  ] = await Promise.all([
    prisma.whatsAppSession.findMany({
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.messageLog.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: { createdAt: { gte: startOfDay } },
    }),
    prisma.messageLog.findMany({
      where: { createdAt: { gte: startOfDay } },
      select: { id: true, status: true, agentId: true },
    }),
    prisma.messageLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        agent: { select: { id: true, name: true } },
        order: { select: { reference: true } },
      },
    }),
    prisma.messageLog.groupBy({
      by: ['trigger'],
      _count: { _all: true },
      where: { createdAt: { gte: startOfDay } },
      orderBy: { _count: { trigger: 'desc' } },
      take: 8,
    }),
    prisma.customer.count({
      where: { whatsappOptOut: true, whatsappOptOutAt: { gte: sevenDaysAgo } },
    }),
  ]);

  // Per-session usage + messages-sent-today summary
  const bySession = new Map<
    string,
    { sent: number; failed: number }
  >();
  for (const l of todaysLogs) {
    const key = l.agentId ?? 'system';
    const cur = bySession.get(key) ?? { sent: 0, failed: 0 };
    if (l.status === 'sent' || l.status === 'delivered') cur.sent += 1;
    if (l.status === 'failed' || l.status === 'dead') cur.failed += 1;
    bySession.set(key, cur);
  }

  const sessionRows = await Promise.all(
    sessions.map(async (s) => {
      const usage = await getSessionUsage(s.id, s.createdAt);
      const daily = bySession.get(s.userId ?? 'system') ?? { sent: 0, failed: 0 };
      return {
        id: s.id,
        instanceName: s.instanceName,
        status: s.status,
        userId: s.userId,
        userName: s.user?.name ?? (s.userId ? 'Unknown' : 'System'),
        phoneNumber: s.phoneNumber,
        lastHeartbeat: s.lastHeartbeat,
        createdAt: s.createdAt,
        sentToday: daily.sent,
        failedToday: daily.failed,
        ...usage,
      };
    }),
  );

  const queue = { queued: 0, sending: 0, sent: 0, delivered: 0, failed: 0, dead: 0 };
  for (const c of queueCounts) {
    const k = c.status as keyof typeof queue;
    if (k in queue) queue[k] = c._count._all;
  }

  return {
    sessions: sessionRows,
    queue,
    feed,
    topTriggers: topTriggers.map((t) => ({ trigger: t.trigger, count: t._count._all })),
    optOuts7d,
  };
}
