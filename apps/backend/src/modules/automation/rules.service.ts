import type { AutomationTrigger, Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { ALLOWED_FIELDS, type Cond, type RuleConditions } from './conditionEvaluator';

// ─── Validation (hand-rolled instead of zod dep drift) ────────────────────
const ALLOWED_OPS = new Set(['eq', 'neq', 'in', 'not_in', 'gte', 'lte', 'contains']);

export function validateConditions(raw: unknown): RuleConditions {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw { statusCode: 400, code: 'INVALID_CONDITIONS', message: 'conditions must be an object' };
  }
  const obj = raw as Record<string, unknown>;
  const out: RuleConditions = {};
  for (const clause of ['all', 'any'] as const) {
    const list = obj[clause];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      throw { statusCode: 400, code: 'INVALID_CONDITIONS', message: `${clause} must be an array` };
    }
    const parsed: Cond[] = list.map((c, idx) => {
      if (!c || typeof c !== 'object') {
        throw { statusCode: 400, code: 'INVALID_CONDITIONS', message: `${clause}[${idx}] is not an object` };
      }
      const cc = c as Record<string, unknown>;
      const field = String(cc.field ?? '');
      const op = String(cc.op ?? '');
      if (!(ALLOWED_FIELDS as readonly string[]).includes(field)) {
        throw { statusCode: 400, code: 'INVALID_CONDITIONS', message: `Unknown field ${field}` };
      }
      if (!ALLOWED_OPS.has(op)) {
        throw { statusCode: 400, code: 'INVALID_CONDITIONS', message: `Unknown op ${op}` };
      }
      return { field: field as Cond['field'], op: op as Cond['op'], value: cc.value as Cond['value'] };
    });
    out[clause] = parsed;
  }
  return out;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────
export async function listRules(trigger?: AutomationTrigger) {
  return prisma.automationRule.findMany({
    where: trigger ? { trigger } : undefined,
    orderBy: [{ trigger: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
    include: { template: { select: { id: true, body: true, enabled: true } } },
  });
}

export async function createRule(input: {
  trigger: AutomationTrigger;
  name: string;
  priority?: number;
  enabled?: boolean;
  overlap?: string;
  conditions?: unknown;
  templateId: string;
  sendFromSystem?: boolean;
  createdById?: string | null;
}) {
  const conditions = validateConditions(input.conditions);
  return prisma.automationRule.create({
    data: {
      trigger: input.trigger,
      name: input.name,
      priority: input.priority ?? 0,
      enabled: input.enabled ?? true,
      overlap: input.overlap === 'all' ? 'all' : 'first',
      conditions: conditions as unknown as Prisma.InputJsonValue,
      templateId: input.templateId,
      sendFromSystem: input.sendFromSystem ?? false,
      createdById: input.createdById ?? null,
    },
  });
}

export async function updateRule(
  id: string,
  patch: {
    name?: string;
    priority?: number;
    enabled?: boolean;
    overlap?: string;
    conditions?: unknown;
    templateId?: string;
    sendFromSystem?: boolean;
  },
) {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.enabled !== undefined) data.enabled = patch.enabled;
  if (patch.overlap !== undefined) data.overlap = patch.overlap === 'all' ? 'all' : 'first';
  if (patch.templateId !== undefined) data.templateId = patch.templateId;
  if (patch.sendFromSystem !== undefined) data.sendFromSystem = patch.sendFromSystem;
  if (patch.conditions !== undefined) {
    data.conditions = validateConditions(patch.conditions) as unknown as Prisma.InputJsonValue;
  }
  return prisma.automationRule.update({ where: { id }, data });
}

export async function deleteRule(id: string) {
  await prisma.automationRule.delete({ where: { id } });
}

// Seed one catch-all rule per existing template on first boot so the dispatcher
// keeps firing for the default behavior. Only creates a rule if the template
// has zero rules yet.
export async function ensureFallbackRules(): Promise<void> {
  const templates = await prisma.messageTemplate.findMany({
    include: { rules: { select: { id: true } } },
  });
  for (const t of templates) {
    if (t.rules.length > 0) continue;
    await prisma.automationRule.create({
      data: {
        trigger: t.trigger,
        name: 'Default',
        priority: 0,
        enabled: t.enabled,
        overlap: 'first',
        conditions: {} as unknown as Prisma.InputJsonValue,
        templateId: t.id,
      },
    });
  }
}
