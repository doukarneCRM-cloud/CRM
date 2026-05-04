/**
 * Smart Répartition — production planner for a single product (model).
 *
 * Returns RAW counts grouped by (color, size, lifecycle-status) for all
 * orders matching the supplied filters. The frontend applies the
 * status weights, production targets, and business rules — keeping the
 * sliders responsive (no refetch on every change) and letting the
 * operator iterate quickly. The backend's only job is the aggregation.
 *
 * Lifecycle status maps the raw confirmation/shipping enums onto the
 * 6 buckets the operator thinks in:
 *
 *   delivered  — parcel delivered.
 *   returned   — parcel returned.
 *   shipped    — pushed to carrier and in flight (any non-terminal
 *                shipping state).
 *   confirmed  — order confirmed but not yet pushed to a carrier.
 *   pending    — order placed but no decision yet (pending / callback /
 *                unreachable / no-stock / postponed).
 *   cancelled  — explicitly cancelled, plus the junk buckets (fake,
 *                duplicate, wrong-number).
 */

import { prisma } from '../../shared/prisma';
import { buildOrderWhereClause, type OrderFilterParams } from '../../utils/filterBuilder';

export type LifecycleStatus =
  | 'delivered'
  | 'returned'
  | 'shipped'
  | 'confirmed'
  | 'pending'
  | 'cancelled';

const ALL_LIFECYCLE: LifecycleStatus[] = [
  'delivered',
  'returned',
  'shipped',
  'confirmed',
  'pending',
  'cancelled',
];

function lifecycleOf(
  shippingStatus: string | null | undefined,
  confirmationStatus: string | null | undefined,
): LifecycleStatus {
  // Shipping outcomes win — once a parcel left the warehouse, that's
  // the canonical state regardless of upstream confirmation flips.
  if (shippingStatus === 'delivered') return 'delivered';
  if (shippingStatus === 'returned') return 'returned';
  if (
    shippingStatus === 'in_transit' ||
    shippingStatus === 'picked_up' ||
    shippingStatus === 'out_for_delivery' ||
    shippingStatus === 'pushed' ||
    shippingStatus === 'failed_delivery' ||
    shippingStatus === 'reported'
  ) {
    return 'shipped';
  }
  // Confirmation buckets that haven't shipped yet.
  if (confirmationStatus === 'confirmed') return 'confirmed';
  if (confirmationStatus === 'cancelled') return 'cancelled';
  // Junk: collapse into cancelled — operator doesn't want to plan
  // production around fake / duplicate / wrong-number signals.
  if (
    confirmationStatus === 'fake' ||
    confirmationStatus === 'duplicate' ||
    confirmationStatus === 'wrong-number'
  ) {
    return 'cancelled';
  }
  // Everything else (pending, callback, unreachable, no-stock,
  // postponed, null) lives in the pending bucket — buyer intent
  // exists, we just haven't reached them yet.
  return 'pending';
}

// ─── Public types ───────────────────────────────────────────────────────────

export interface SmartRepartitionRow {
  color: string;
  size: string;
  status: LifecycleStatus;
  count: number; // sum of OrderItem.quantity
}

export interface SmartRepartitionPayload {
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
  } | null;
  // Raw aggregation — frontend applies weights to derive demand.
  rows: SmartRepartitionRow[];
  // Distinct colors / sizes observed in the rows. Sizes are NOT pre-
  // sorted here; the frontend imports the canonical compareSizes from
  // lib/sizeOrder so the matrix layout stays consistent everywhere.
  colors: string[];
  sizes: string[];
  // Per-status order counts (for the insights panel + operator
  // confidence: "we computed against 1248 orders, of which 200 are
  // pending").
  rawCounts: Record<LifecycleStatus, number>;
  // Total order count (NOT items). Useful for the "based on X orders"
  // hint at the top of the result.
  totalOrders: number;
  // Echo the window so the frontend can label "based on the last N days".
  windowDays: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export interface ComputeSmartRepartitionInput extends OrderFilterParams {
  modelId: string;
}

export async function computeSmartRepartition(
  input: ComputeSmartRepartitionInput,
): Promise<SmartRepartitionPayload> {
  const { modelId, ...filters } = input;

  // Window for the "based on N days" echo. Mirrors the same fallback
  // (30 days) we use in computeAllOrdersTab so first-paint feels
  // consistent across analytics tabs.
  const fromIso = filters.dateFrom ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
  const toIso = filters.dateTo ?? new Date().toISOString();
  const windowMs = Math.max(86_400_000, new Date(toIso).getTime() - new Date(fromIso).getTime());
  const windowDays = Math.max(1, Math.round(windowMs / 86_400_000));

  const where = buildOrderWhereClause(filters, { dateField: 'createdAt' });

  const [product, items, totalOrders] = await Promise.all([
    prisma.product.findUnique({
      where: { id: modelId },
      select: { id: true, name: true, imageUrl: true },
    }),
    prisma.orderItem.findMany({
      where: {
        order: where,
        variant: { productId: modelId },
      },
      select: {
        quantity: true,
        variant: { select: { color: true, size: true } },
        order: {
          select: {
            confirmationStatus: true,
            shippingStatus: true,
          },
        },
      },
    }),
    prisma.order.count({
      where: {
        ...where,
        items: { some: { variant: { productId: modelId } } },
      },
    }),
  ]);

  // Aggregate (color, size, status) → quantity
  const key = (c: string, s: string, st: LifecycleStatus) => `${c}|${s}|${st}`;
  const counts = new Map<string, number>();
  const rawCounts: Record<LifecycleStatus, number> = {
    delivered: 0,
    returned: 0,
    shipped: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
  };
  const colorSet = new Set<string>();
  const sizeSet = new Set<string>();

  for (const it of items) {
    const c = it.variant.color ?? '—';
    const s = it.variant.size ?? '—';
    const status = lifecycleOf(it.order.shippingStatus, it.order.confirmationStatus);
    colorSet.add(c);
    sizeSet.add(s);
    const k = key(c, s, status);
    counts.set(k, (counts.get(k) ?? 0) + it.quantity);
    rawCounts[status] += it.quantity;
  }

  const rows: SmartRepartitionRow[] = [];
  for (const c of colorSet) {
    for (const s of sizeSet) {
      for (const status of ALL_LIFECYCLE) {
        const v = counts.get(key(c, s, status));
        if (v && v > 0) {
          rows.push({ color: c, size: s, status, count: v });
        }
      }
    }
  }

  return {
    product: product ?? null,
    rows,
    colors: Array.from(colorSet).sort((a, b) => a.localeCompare(b)),
    sizes: Array.from(sizeSet),
    rawCounts,
    totalOrders,
    windowDays,
  };
}
