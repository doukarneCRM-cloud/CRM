/**
 * Coliix export service.
 *
 * Given a CRM order id, validate that it's ready to ship, push it to Coliix
 * via the HTTP client, and persist the resulting tracking code + state change
 * on the order. Writes an OrderLog entry (type=shipping) for every attempt so
 * operations can audit success and failure equally.
 *
 * Callers:
 *   - exportOrder(orderId, actor)          — single export
 *   - exportOrders(orderIds[], actor)      — bulk export (sequential to avoid
 *                                            hammering the Coliix API; returns
 *                                            one result per order)
 */

import { Prisma, type ShippingStatus } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { emitToRoom } from '../../shared/socket';
import { createParcel, ColiixError } from './coliixClient';
import { mapColiixState } from './coliixStateMap';
import type { JwtPayload } from '../../shared/jwt';
import { dispatchOrderStatusChange } from '../automation/dispatcher';

export interface ExportResult {
  orderId: string;
  reference: string;
  ok: boolean;
  tracking?: string;
  error?: string;
}

interface MerchandiseItem {
  quantity: number;
  variant: {
    color: string | null;
    size: string | null;
    product: { name: string };
  };
}

/**
 * Compose the `marchandise` string shown on the Coliix parcel label.
 *
 * Mirrors how the orders table presents variants: product name, then
 * color / size, then `xN` only if quantity > 1. When the same product appears
 * with multiple variants, the product name is stated once and each variation
 * is listed inside parentheses — matches how operators read the table.
 *
 * Examples:
 *   "Robe du lin / Rouge / M x2"
 *   "Robe du lin (Rouge / M x2, Bleu / L)"
 *   "Robe du lin / Rouge / M x2, T-Shirt / Bleu"
 */
function buildMerchandise(items: MerchandiseItem[]): string {
  const byProduct = new Map<
    string,
    Array<{ color: string | null; size: string | null; quantity: number }>
  >();
  for (const i of items) {
    const name = i.variant?.product?.name?.trim();
    if (!name) continue;
    const bucket = byProduct.get(name) ?? [];
    bucket.push({
      color: i.variant.color?.trim() || null,
      size: i.variant.size?.trim() || null,
      quantity: i.quantity,
    });
    byProduct.set(name, bucket);
  }

  const formatVariant = (v: {
    color: string | null;
    size: string | null;
    quantity: number;
  }) => {
    const parts: string[] = [];
    if (v.color) parts.push(v.color);
    if (v.size) parts.push(v.size);
    const base = parts.join(' / ');
    const qty = v.quantity > 1 ? ` x${v.quantity}` : '';
    return (base + qty).trim();
  };

  const products: string[] = [];
  for (const [name, variants] of byProduct) {
    if (variants.length === 1) {
      const v = variants[0];
      const label = formatVariant(v);
      if (!label) {
        products.push(name);
      } else if (v.color || v.size) {
        products.push(`${name} / ${label}`);
      } else {
        products.push(`${name} ${label}`);
      }
    } else {
      const variantLabels = variants.map(formatVariant).filter(Boolean);
      products.push(variantLabels.length ? `${name} (${variantLabels.join(', ')})` : name);
    }
  }

  return products.join(', ');
}

function requireReady(order: {
  confirmationStatus: string;
  labelSent: boolean;
  customer: { fullName: string; phoneDisplay: string; city: string; address: string | null };
  items: { quantity: number }[];
  total: number;
}): void {
  if (order.labelSent) {
    throw new Error('Order has already been sent to Coliix');
  }
  if (order.confirmationStatus !== 'confirmed') {
    throw new Error('Only confirmed orders can be exported');
  }
  if (!order.customer.fullName?.trim()) throw new Error('Missing customer name');
  if (!order.customer.phoneDisplay?.trim()) throw new Error('Missing customer phone');
  if (!order.customer.city?.trim()) throw new Error('Missing city');
  if (!order.customer.address?.trim()) throw new Error('Missing address');
  if (order.items.length === 0) throw new Error('Order has no items');
  if (order.total <= 0) throw new Error('Order total must be positive');
}

async function writeShippingLog(
  orderId: string,
  actor: JwtPayload,
  actorName: string,
  action: string,
  meta: Record<string, unknown>,
) {
  await prisma.orderLog.create({
    data: {
      orderId,
      type: 'shipping',
      action,
      performedBy: actorName,
      userId: actor.sub,
      meta: meta as Prisma.InputJsonValue,
    },
  });
}

export async function exportOrder(orderId: string, actor: JwtPayload): Promise<ExportResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: { select: { fullName: true, phoneDisplay: true, city: true, address: true } },
      items: {
        select: {
          quantity: true,
          variant: {
            select: {
              color: true,
              size: true,
              product: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!order) {
    return { orderId, reference: '?', ok: false, error: 'Order not found' };
  }

  const actorUser = await prisma.user.findUnique({
    where: { id: actor.sub },
    select: { name: true },
  });
  const actorName = actorUser?.name ?? actor.email;

  try {
    requireReady(order);
    const totalQty = order.items.reduce((s, i) => s + i.quantity, 0);
    const merchandise = buildMerchandise(order.items) || order.reference;

    const result = await createParcel({
      name: order.customer.fullName,
      phone: order.customer.phoneDisplay,
      address: order.customer.address!,
      city: order.customer.city,
      price: order.total,
      quantity: totalQty,
      merchandise,
      note: order.shippingInstruction ?? '',
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        coliixTrackingId: result.tracking,
        trackingProvider: 'coliix',
        labelSent: true,
        labelSentAt: new Date(),
        // Move the parcel out of "not_shipped" so it leaves the confirmation
        // backlog and shows up in the Shipping tab.
        shippingStatus: 'label_created',
      },
    });

    await writeShippingLog(order.id, actor, actorName, `Exported to Coliix — ${result.tracking}`, {
      tracking: result.tracking,
      provider: 'coliix',
    });

    emitToRoom('orders:all', 'order:updated', { orderId: order.id });

    return { orderId: order.id, reference: order.reference, ok: true, tracking: result.tracking };
  } catch (err) {
    const message =
      err instanceof ColiixError
        ? err.message
        : err instanceof Error
        ? err.message
        : String(err);
    await writeShippingLog(order.id, actor, actorName, `Coliix export failed — ${message}`, {
      provider: 'coliix',
      error: message,
      ...(err instanceof ColiixError ? { status: err.status } : {}),
    }).catch(() => {});
    return { orderId: order.id, reference: order.reference, ok: false, error: message };
  }
}

/**
 * Ingest a status update from Coliix (webhook push or poller pull). Idempotent
 * — if the mapped status matches the current order state and the driver note
 * hasn't changed, nothing is written (no duplicate logs, no needless socket
 * broadcast).
 *
 * Returns the outcome so the webhook can send an appropriate HTTP response and
 * the poller can decide how aggressively to retry.
 */
export interface IngestResult {
  matched: boolean;          // did we find an order with this tracking code?
  changed: boolean;          // did the order state actually change?
  orderId?: string;
  reference?: string;
  newStatus?: ShippingStatus;
  reason?: string;           // populated when not matched / not changed
}

export async function ingestStatus(input: {
  tracking: string;
  rawState: string;
  driverNote?: string | null;
  eventDate?: Date | null;
  source: 'webhook' | 'poller';
}): Promise<IngestResult> {
  const tracking = input.tracking.trim();
  if (!tracking) {
    return { matched: false, changed: false, reason: 'Missing tracking' };
  }

  const order = await prisma.order.findFirst({
    where: { coliixTrackingId: tracking },
    select: {
      id: true,
      reference: true,
      confirmationStatus: true,
      shippingStatus: true,
      deliveredAt: true,
    },
  });
  if (!order) {
    return { matched: false, changed: false, reason: `No order with tracking ${tracking}` };
  }

  const mapped = mapColiixState(input.rawState);
  if (!mapped) {
    // Log the unknown state so ops can extend the mapping table.
    await prisma.orderLog.create({
      data: {
        orderId: order.id,
        type: 'shipping',
        action: `Coliix unknown state "${input.rawState}" (${input.source}) — ignored`,
        performedBy: 'System',
        meta: {
          provider: 'coliix',
          rawState: input.rawState,
          source: input.source,
        } as Prisma.InputJsonValue,
      },
    });
    return {
      matched: true,
      changed: false,
      orderId: order.id,
      reference: order.reference,
      reason: `Unknown Coliix state: ${input.rawState}`,
    };
  }

  // Idempotent — webhook may fire twice for the same event.
  if (order.shippingStatus === mapped) {
    return {
      matched: true,
      changed: false,
      orderId: order.id,
      reference: order.reference,
      newStatus: mapped,
      reason: 'Status unchanged',
    };
  }

  const data: Prisma.OrderUpdateInput = {
    shippingStatus: mapped,
    lastTrackedAt: new Date(),
  };
  if (mapped === 'delivered' && !order.deliveredAt) {
    data.deliveredAt = input.eventDate ?? new Date();
  }

  await prisma.order.update({ where: { id: order.id }, data });

  await prisma.orderLog.create({
    data: {
      orderId: order.id,
      type: 'shipping',
      action: `Coliix status → ${mapped} (was ${order.shippingStatus})`,
      performedBy: 'System',
      meta: {
        provider: 'coliix',
        rawState: input.rawState,
        mapped,
        driverNote: input.driverNote ?? null,
        source: input.source,
      } as Prisma.InputJsonValue,
    },
  });

  // Instant UI refresh for everyone viewing orders.
  emitToRoom('orders:all', 'order:updated', { orderId: order.id });
  emitToRoom('dashboard', 'kpi:refresh', {});

  // Automation — WhatsApp client notification for the new shipping state.
  void dispatchOrderStatusChange(order.id, {
    prev: { confirmation: order.confirmationStatus, shipping: order.shippingStatus },
    next: { confirmation: order.confirmationStatus, shipping: mapped },
  });

  return {
    matched: true,
    changed: true,
    orderId: order.id,
    reference: order.reference,
    newStatus: mapped,
  };
}

export async function exportOrders(orderIds: string[], actor: JwtPayload): Promise<{
  results: ExportResult[];
  summary: { total: number; ok: number; failed: number };
}> {
  const results: ExportResult[] = [];
  // Sequential — avoids flooding Coliix with concurrent connections and keeps
  // tracking code generation deterministic across a batch.
  for (const id of orderIds) {
    results.push(await exportOrder(id, actor));
  }
  const ok = results.filter((r) => r.ok).length;
  return {
    results,
    summary: { total: results.length, ok, failed: results.length - ok },
  };
}
