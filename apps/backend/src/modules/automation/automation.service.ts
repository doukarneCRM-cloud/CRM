import type { AutomationTrigger, MessageLogStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { whatsappQueue } from '../../shared/queue';
import { DEFAULT_TEMPLATES, TRIGGER_ORDER } from './defaultTemplates';

// Make sure a template row exists for every trigger. Called once on startup
// and also lazily on GET so new triggers added later appear instantly.
export async function ensureDefaultTemplates(): Promise<void> {
  const existing = await prisma.messageTemplate.findMany({ select: { trigger: true } });
  const present = new Set(existing.map((t) => t.trigger));
  const missing = TRIGGER_ORDER.filter((t) => !present.has(t));
  if (missing.length === 0) return;
  await prisma.messageTemplate.createMany({
    data: missing.map((trigger) => ({
      trigger,
      body: DEFAULT_TEMPLATES[trigger].body,
      enabled: false,
    })),
    skipDuplicates: true,
  });
}

export async function listTemplates() {
  await ensureDefaultTemplates();
  const rows = await prisma.messageTemplate.findMany();
  const byTrigger = new Map(rows.map((r) => [r.trigger, r]));
  return TRIGGER_ORDER.map((trigger) => {
    const row = byTrigger.get(trigger)!;
    return {
      id: row.id,
      trigger,
      label: DEFAULT_TEMPLATES[trigger].label,
      enabled: row.enabled,
      body: row.body,
      updatedAt: row.updatedAt,
    };
  });
}

export async function updateTemplate(
  trigger: AutomationTrigger,
  patch: { enabled?: boolean; body?: string },
  updatedById: string,
) {
  await ensureDefaultTemplates();
  const data: Record<string, unknown> = { updatedById };
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.body !== undefined) data.body = patch.body;
  return prisma.messageTemplate.update({
    where: { trigger },
    data,
  });
}

export async function listLogs(filters: {
  trigger?: AutomationTrigger;
  status?: MessageLogStatus;
  from?: string;
  to?: string;
  orderId?: string;
  agentId?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = {};
  if (filters.trigger) where.trigger = filters.trigger;
  if (filters.status) where.status = filters.status;
  if (filters.orderId) where.orderId = filters.orderId;
  if (filters.agentId) where.agentId = filters.agentId;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    };
  }
  const [rows, total] = await Promise.all([
    prisma.messageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 50, 200),
      skip: filters.offset ?? 0,
      include: {
        order: { select: { reference: true } },
        agent: { select: { name: true } },
      },
    }),
    prisma.messageLog.count({ where }),
  ]);
  return { rows, total };
}

export async function retryLog(id: string) {
  const log = await prisma.messageLog.findUnique({ where: { id } });
  if (!log) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Log not found' };
  if (log.status !== 'failed' && log.status !== 'dead') {
    throw {
      statusCode: 400,
      code: 'INVALID_STATE',
      message: 'Only failed or dead messages can be retried',
    };
  }
  await prisma.messageLog.update({
    where: { id },
    data: { status: 'queued', error: null },
  });
  await whatsappQueue.add({ messageLogId: id });
  return { ok: true };
}

// ─── System-session selector (stored in Setting table) ─────────────────────
const SYSTEM_SESSION_KEY = 'whatsapp.systemSessionId';

export async function getSystemSessionId(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: SYSTEM_SESSION_KEY } });
  return row?.value ?? null;
}

export async function setSystemSessionId(sessionId: string | null): Promise<void> {
  if (sessionId === null) {
    await prisma.setting.deleteMany({ where: { key: SYSTEM_SESSION_KEY } });
    return;
  }
  await prisma.setting.upsert({
    where: { key: SYSTEM_SESSION_KEY },
    create: { key: SYSTEM_SESSION_KEY, value: sessionId },
    update: { value: sessionId },
  });
}
