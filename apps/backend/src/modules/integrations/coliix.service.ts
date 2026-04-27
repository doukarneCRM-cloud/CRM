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
import { createParcel, trackParcel, ColiixError, type ColiixTrackEvent } from './coliixClient';
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

    void dispatchOrderStatusChange(order.id, {
      prev: { confirmation: order.confirmationStatus, shipping: order.shippingStatus },
      next: { confirmation: order.confirmationStatus, shipping: 'label_created' },
    });

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

// ─── On-demand tracking diagnostics ─────────────────────────────────────────
//
// The poller runs every 5 minutes — fine for production but useless when
// you're standing in front of a parcel that just changed state and want to
// confirm the pipeline works. These helpers expose the same machinery the
// poller uses, but on demand and with the full Coliix payload returned so
// admins can see exactly what arrived and how it was mapped.

const NON_TERMINAL_STATUSES: ShippingStatus[] = [
  'label_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'attempted',
];

export interface InFlightOrder {
  orderId: string;
  reference: string;
  customerName: string;
  city: string;
  shippingStatus: ShippingStatus;
  coliixTrackingId: string;
  lastTrackedAt: Date | null;
  labelSentAt: Date | null;
}

/** Orders currently moving through Coliix — eligible for a status refresh. */
export async function listInFlightOrders(): Promise<InFlightOrder[]> {
  const rows = await prisma.order.findMany({
    where: {
      trackingProvider: 'coliix',
      coliixTrackingId: { not: null },
      shippingStatus: { in: NON_TERMINAL_STATUSES },
    },
    orderBy: [{ lastTrackedAt: 'asc' }, { labelSentAt: 'desc' }],
    select: {
      id: true,
      reference: true,
      shippingStatus: true,
      coliixTrackingId: true,
      lastTrackedAt: true,
      labelSentAt: true,
      customer: { select: { fullName: true, city: true } },
    },
  });
  return rows.map((r) => ({
    orderId: r.id,
    reference: r.reference,
    customerName: r.customer.fullName,
    city: r.customer.city,
    shippingStatus: r.shippingStatus,
    coliixTrackingId: r.coliixTrackingId!,
    lastTrackedAt: r.lastTrackedAt,
    labelSentAt: r.labelSentAt,
  }));
}

export interface TrackNowResult {
  ok: boolean;
  orderId: string;
  reference: string;
  tracking: string;
  prevStatus: ShippingStatus;
  // What Coliix said this minute.
  coliix: {
    currentState: string;       // raw text Coliix returned
    events: ColiixTrackEvent[]; // full history they expose
  } | null;
  // What the mapping produced and whether the order was updated.
  mapped: ShippingStatus | null;
  changed: boolean;
  newStatus?: ShippingStatus;
  error?: string;
  // Raw HTTP response body Coliix returned on failure. Surfaced so the
  // diagnostic table can show it verbatim when our own error extractor
  // misses an unexpected shape — leaves no information unrecoverable.
  errorStatus?: number;
  errorPayload?: unknown;
  reason?: string;
}

/**
 * Run the same track→ingest pipeline the background poller uses, but on
 * demand and with the raw Coliix response returned for inspection. Use this
 * to test the status mapping or to force-refresh a single order without
 * waiting for the next poller tick.
 */
export async function trackOrderNow(orderId: string): Promise<TrackNowResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      shippingStatus: true,
      coliixTrackingId: true,
      trackingProvider: true,
    },
  });
  if (!order) {
    return {
      ok: false,
      orderId,
      reference: '?',
      tracking: '',
      prevStatus: 'not_shipped',
      coliix: null,
      mapped: null,
      changed: false,
      error: 'Order not found',
    };
  }
  if (order.trackingProvider !== 'coliix' || !order.coliixTrackingId) {
    return {
      ok: false,
      orderId: order.id,
      reference: order.reference,
      tracking: order.coliixTrackingId ?? '',
      prevStatus: order.shippingStatus,
      coliix: null,
      mapped: null,
      changed: false,
      error: 'Order has no Coliix tracking code',
    };
  }

  try {
    const track = await trackParcel(order.coliixTrackingId);
    const ingest = await ingestStatus({
      tracking: order.coliixTrackingId,
      rawState: track.currentState,
      driverNote: track.events[0]?.driverNote ?? null,
      eventDate: track.events[0]?.date ? new Date(track.events[0].date) : null,
      source: 'poller',
    });
    return {
      ok: true,
      orderId: order.id,
      reference: order.reference,
      tracking: order.coliixTrackingId,
      prevStatus: order.shippingStatus,
      coliix: { currentState: track.currentState, events: track.events },
      mapped: ingest.newStatus ?? mapColiixState(track.currentState),
      changed: ingest.changed,
      newStatus: ingest.newStatus,
      reason: ingest.reason,
    };
  } catch (err) {
    const message =
      err instanceof ColiixError ? err.message : err instanceof Error ? err.message : String(err);
    const isColiix = err instanceof ColiixError;
    return {
      ok: false,
      orderId: order.id,
      reference: order.reference,
      tracking: order.coliixTrackingId,
      prevStatus: order.shippingStatus,
      coliix: null,
      mapped: null,
      changed: false,
      error: message,
      errorStatus: isColiix ? err.status : undefined,
      errorPayload: isColiix ? err.payload : undefined,
    };
  }
}

export interface RefreshAllResult {
  total: number;
  changed: number;
  unchanged: number;
  failed: number;
  results: TrackNowResult[];
}

/**
 * Refresh every in-flight order in one shot — same pipeline as the poller.
 * Runs in chunks of REFRESH_CONCURRENCY so a 100+ order sweep completes in
 * tens of seconds instead of minutes. Sequential was simple but pushed the
 * total wall-time past hosting-platform edge timeouts (e.g. Railway's ~5
 * minute HTTP cap), turning the Sync button into a "Network Error".
 *
 * Per-call timeout (8s, in coliixClient) keeps any single hung response
 * from poisoning a chunk.
 */
const REFRESH_CONCURRENCY = 10;

export async function refreshAllInFlight(): Promise<RefreshAllResult> {
  const inFlight = await listInFlightOrders();
  const results: TrackNowResult[] = [];
  for (let i = 0; i < inFlight.length; i += REFRESH_CONCURRENCY) {
    const chunk = inFlight.slice(i, i + REFRESH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((o) => trackOrderNow(o.orderId)));
    results.push(...chunkResults);
  }
  return {
    total: results.length,
    changed: results.filter((r) => r.changed).length,
    unchanged: results.filter((r) => r.ok && !r.changed).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}
