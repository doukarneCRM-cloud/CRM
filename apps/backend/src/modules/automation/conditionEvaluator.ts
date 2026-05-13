// Condition evaluator for automation rules. Deliberately tiny — no eval,
// no dynamic field resolution, no open-ended JSON schema. The whitelist is
// the allowed surface; anything else short-circuits to false.

export type Op = 'eq' | 'neq' | 'in' | 'not_in' | 'gte' | 'lte' | 'contains';

export const ALLOWED_FIELDS = [
  'customer.city',
  'customer.tag',
  'order.total',
  'order.itemCount',
  'order.shippingPrice',
  // Order statuses — the canonical enums also used everywhere else in
  // the CRM. The rule UI auto-renders a dropdown of valid values for
  // these fields, so an operator can write "send a WhatsApp when
  // order.confirmationStatus = confirmed AND order.shippingStatus =
  // not_shipped" without typo'ing the enum string.
  'order.confirmationStatus',
  'order.shippingStatus',
  'order.source',
  'product.name',
  'agent.id',
] as const;

export type AllowedField = (typeof ALLOWED_FIELDS)[number];

export interface Cond {
  field: AllowedField;
  op: Op;
  value: string | number | string[] | number[];
}

export interface RuleConditions {
  all?: Cond[];
  any?: Cond[];
}

export interface EvalContext {
  customer?: { city?: string; tag?: string };
  order?: {
    total?: number;
    itemCount?: number;
    shippingPrice?: number;
    confirmationStatus?: string;
    shippingStatus?: string;
    source?: string;
  };
  product?: { name?: string };
  agent?: { id?: string };
}

function resolve(field: AllowedField, ctx: EvalContext): unknown {
  switch (field) {
    case 'customer.city':
      return ctx.customer?.city;
    case 'customer.tag':
      return ctx.customer?.tag;
    case 'order.total':
      return ctx.order?.total;
    case 'order.itemCount':
      return ctx.order?.itemCount;
    case 'order.shippingPrice':
      return ctx.order?.shippingPrice;
    case 'order.confirmationStatus':
      return ctx.order?.confirmationStatus;
    case 'order.shippingStatus':
      return ctx.order?.shippingStatus;
    case 'order.source':
      return ctx.order?.source;
    case 'product.name':
      return ctx.product?.name;
    case 'agent.id':
      return ctx.agent?.id;
  }
}

function evalCond(cond: Cond, ctx: EvalContext): boolean {
  if (!ALLOWED_FIELDS.includes(cond.field)) return false;
  const actual = resolve(cond.field, ctx);
  const v = cond.value;

  switch (cond.op) {
    case 'eq':
      return actual === v;
    case 'neq':
      return actual !== v;
    case 'in':
      return Array.isArray(v) && (v as unknown[]).includes(actual);
    case 'not_in':
      return Array.isArray(v) && !(v as unknown[]).includes(actual);
    case 'gte':
      return typeof actual === 'number' && typeof v === 'number' && actual >= v;
    case 'lte':
      return typeof actual === 'number' && typeof v === 'number' && actual <= v;
    case 'contains':
      return (
        typeof actual === 'string' &&
        typeof v === 'string' &&
        actual.toLowerCase().includes(v.toLowerCase())
      );
    default:
      return false;
  }
}

// An empty rule (no all / no any clauses) matches everything — this is how
// the fallback catch-all rule works. Both clauses present → both must pass
// (AND between clauses, AND within `all`, OR within `any`).
export function evaluate(rules: RuleConditions | null | undefined, ctx: EvalContext): boolean {
  if (!rules || typeof rules !== 'object') return true;

  if (Array.isArray(rules.all) && rules.all.length > 0) {
    if (!rules.all.every((c) => evalCond(c, ctx))) return false;
  }
  if (Array.isArray(rules.any) && rules.any.length > 0) {
    if (!rules.any.some((c) => evalCond(c, ctx))) return false;
  }
  return true;
}
