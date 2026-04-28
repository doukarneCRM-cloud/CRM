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
import { dispatchOrderStatusChange, dispatchColiixStateChange } from '../automation/dispatcher';

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
      coliixRawState: true,
      deliveredAt: true,
    },
  });
  if (!order) {
    return { matched: false, changed: false, reason: `No order with tracking ${tracking}` };
  }

  const trimmedRaw = input.rawState.trim();
  const mapped = mapColiixState(input.rawState);

  if (!mapped) {
    // Idempotent on the raw wording. The poller re-fetches every 5 min;
    // without this guard, every tick wrote a new "Coliix raw state → X"
    // log entry even when nothing changed — one user reported 169
    // identical "Expédié" rows on a single order. Bail out early when
    // there's nothing new to record.
    if (!trimmedRaw || order.coliixRawState === trimmedRaw) {
      return {
        matched: true,
        changed: false,
        orderId: order.id,
        reference: order.reference,
        reason: 'Raw state unchanged',
      };
    }

    // rawState actually changed → persist + log + dispatch (once).
    // Self-correcting demote: when the previous wording put the order
    // into 'delivered' but the new wording no longer maps there (e.g.
    // a courier later corrected "Livré" to "En cours" or to a wording
    // we don't recognise), we MUST move shippingStatus out of
    // delivered. Otherwise dashboard KPIs and the Coliix-wording
    // breakdown disagree forever — the operator complaint that "Livré
    // count and delivered KPI never match". picked_up is the safest
    // truth: Coliix has the parcel, exact phase unknown.
    const demoteFromDelivered = order.shippingStatus === 'delivered';
    await prisma.order.update({
      where: { id: order.id },
      data: {
        coliixRawState: trimmedRaw,
        lastTrackedAt: new Date(),
        ...(demoteFromDelivered
          ? { shippingStatus: 'picked_up', deliveredAt: null }
          : {}),
      },
    });
    emitToRoom('orders:all', 'order:updated', { orderId: order.id });
    if (demoteFromDelivered) {
      emitToRoom('dashboard', 'kpi:refresh', {});
    }

    await prisma.orderLog.create({
      data: {
        orderId: order.id,
        type: 'shipping',
        action: demoteFromDelivered
          ? `Coliix raw state → "${input.rawState}" (${input.source}) — demoted from delivered (wording no longer maps to delivered)`
          : `Coliix raw state → "${input.rawState}" (${input.source}) — no enum mapping, raw text saved`,
        performedBy: 'System',
        meta: {
          provider: 'coliix',
          rawState: input.rawState,
          source: input.source,
          // Coliix's own event timestamp — drives the timeline in the
          // order-history modal. See the mapped branch for context.
          eventDate: input.eventDate ? input.eventDate.toISOString() : null,
          ...(demoteFromDelivered
            ? { demoted: true, prevStatus: 'delivered', newStatus: 'picked_up' }
            : {}),
        } as Prisma.InputJsonValue,
      },
    });

    // Fire the custom Coliix-state automation even though we couldn't
    // map the wording to an enum — that's the whole point of the
    // ColiixStateTemplate path: cover statuses outside our enum.
    void dispatchColiixStateChange(order.id, order.coliixRawState, trimmedRaw);

    return {
      matched: true,
      changed: true,
      orderId: order.id,
      reference: order.reference,
      reason: `Raw state saved: ${input.rawState}`,
    };
  }

  // Idempotent on the enum AND the raw text — webhook may fire twice for
  // the same event, but we still refresh coliixRawState if Coliix changes
  // the wording while keeping the same enum bucket (e.g. "Livré au client"
  // vs "Livré"). Otherwise old wording would freeze on the order.
  if (order.shippingStatus === mapped && order.coliixRawState === trimmedRaw) {
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
    coliixRawState: input.rawState.trim() || null,
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
        // Coliix's own event timestamp (when the courier scanned, not
        // when our poller noticed). Drives the timeline in the order-
        // history modal so what the operator reads matches Coliix's
        // tracking page exactly.
        eventDate: input.eventDate ? input.eventDate.toISOString() : null,
      } as Prisma.InputJsonValue,
    },
  });

  // Instant UI refresh for everyone viewing orders.
  emitToRoom('orders:all', 'order:updated', { orderId: order.id });
  emitToRoom('dashboard', 'kpi:refresh', {});

  // Automation — WhatsApp client notification for the new shipping state.
  // Two paths fire in parallel:
  //   1. The legacy enum-based dispatcher for any rule keyed on the
  //      mapped ShippingStatus enum (shipping_picked_up, shipping_delivered…).
  //   2. The new Coliix-state-keyed dispatcher for any custom template the
  //      operator pinned to this exact wording (Ramassé, Hub Casablanca…).
  // Both are fire-and-forget; the queue + dedupe key make repeated calls
  // for the same state a no-op.
  void dispatchOrderStatusChange(order.id, {
    prev: { confirmation: order.confirmationStatus, shipping: order.shippingStatus },
    next: { confirmation: order.confirmationStatus, shipping: mapped },
  });
  if (trimmedRaw) {
    void dispatchColiixStateChange(order.id, order.coliixRawState, trimmedRaw);
  }

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

// Re-applies the current mapColiixState rules to every order that has a
// stored coliixRawState. Doesn't talk to Coliix at all — just recomputes
// the enum bucket from the wording we already have in the DB. Use this
// after changing the mapping rules so existing orders inherit the new
// classification without waiting for the next webhook / poller tick.
export interface RemapStatusesResult {
  scanned: number;
  changed: number;
  unchanged: number;
  unmapped: number;
  rows: Array<{
    orderId: string;
    reference: string;
    rawState: string;
    prevStatus: ShippingStatus;
    newStatus: ShippingStatus | null;
    changed: boolean;
  }>;
}

export async function remapShippingStatusesFromRawState(): Promise<RemapStatusesResult> {
  const orders = await prisma.order.findMany({
    where: {
      coliixRawState: { not: null },
      labelSent: true,
    },
    select: {
      id: true,
      reference: true,
      coliixRawState: true,
      shippingStatus: true,
      deliveredAt: true,
    },
  });

  let scanned = 0;
  let changed = 0;
  let unchanged = 0;
  let unmapped = 0;
  const rows: RemapStatusesResult['rows'] = [];

  for (const o of orders) {
    if (!o.coliixRawState) continue;
    scanned++;
    const mapped = mapColiixState(o.coliixRawState);
    if (mapped === null) {
      // Special case: order is currently 'delivered' but the wording
      // that put it there no longer maps to delivered (e.g. "Reçu" was
      // narrowed out of the delivered bucket because the operator
      // confirmed it's a hub-side receipt, not client delivery).
      // Leaving shippingStatus='delivered' here would keep inflating
      // the dashboard KPI. Demote to 'picked_up' (most conservative
      // truth: Coliix has the parcel, exact phase unknown) and null
      // out deliveredAt so revenue analytics drops it.
      if (o.shippingStatus === 'delivered') {
        await prisma.order.update({
          where: { id: o.id },
          data: {
            shippingStatus: 'picked_up',
            deliveredAt: null,
            lastTrackedAt: new Date(),
          },
        });
        await prisma.orderLog.create({
          data: {
            orderId: o.id,
            type: 'shipping',
            action: `Coliix re-map: delivered → picked_up (raw "${o.coliixRawState}" no longer mapped)`,
            performedBy: 'System',
            meta: {
              provider: 'coliix',
              rawState: o.coliixRawState,
              prevStatus: 'delivered',
              newStatus: 'picked_up',
              source: 'remap',
              reason: 'rawState no longer maps to delivered',
            } as Prisma.InputJsonValue,
          },
        });
        emitToRoom('orders:all', 'order:updated', { orderId: o.id });
        changed++;
        rows.push({
          orderId: o.id,
          reference: o.reference,
          rawState: o.coliixRawState,
          prevStatus: 'delivered',
          newStatus: 'picked_up',
          changed: true,
        });
        continue;
      }
      unmapped++;
      rows.push({
        orderId: o.id,
        reference: o.reference,
        rawState: o.coliixRawState,
        prevStatus: o.shippingStatus,
        newStatus: null,
        changed: false,
      });
      continue;
    }
    if (mapped === o.shippingStatus) {
      unchanged++;
      continue;
    }
    // Promote / demote the order. Side effects:
    //   - if we're newly delivering it AND deliveredAt is null, stamp it now
    //   - if we're moving OUT of delivered (i.e. correcting an old mismap),
    //     null out deliveredAt so revenue analytics drops it
    const data: Prisma.OrderUpdateInput = {
      shippingStatus: mapped,
      lastTrackedAt: new Date(),
    };
    if (mapped === 'delivered' && !o.deliveredAt) data.deliveredAt = new Date();
    if (o.shippingStatus === 'delivered' && mapped !== 'delivered') data.deliveredAt = null;

    await prisma.order.update({ where: { id: o.id }, data });
    await prisma.orderLog.create({
      data: {
        orderId: o.id,
        type: 'shipping',
        action: `Coliix re-map: ${o.shippingStatus} → ${mapped} (raw "${o.coliixRawState}")`,
        performedBy: 'System',
        meta: {
          provider: 'coliix',
          rawState: o.coliixRawState,
          prevStatus: o.shippingStatus,
          newStatus: mapped,
          source: 'remap',
        } as Prisma.InputJsonValue,
      },
    });
    emitToRoom('orders:all', 'order:updated', { orderId: o.id });
    changed++;
    rows.push({
      orderId: o.id,
      reference: o.reference,
      rawState: o.coliixRawState,
      prevStatus: o.shippingStatus,
      newStatus: mapped,
      changed: true,
    });
  }

  if (changed > 0) {
    emitToRoom('dashboard', 'kpi:refresh', {});
  }

  return { scanned, changed, unchanged, unmapped, rows };
}

// One-shot cleanup for the duplicate-shipping-log incident: before the
// no-mapping branch in `ingestStatus` learned to short-circuit on an
// unchanged rawState, the poller (every 5 min) wrote a fresh OrderLog
// row every tick — one user reported 169 identical "Expédié" entries
// on a single order. Status-change rows (`meta.mapped` set) and remap
// rows (`meta.source === 'remap'`) are unique by construction and must
// never be touched here. This function only deletes redundant
// no-mapping rows, keeping the OLDEST occurrence per (order, rawState)
// so the timeline still shows when the wording first appeared.
export interface DedupeShippingLogsResult {
  scanned: number;
  candidates: number;       // no-mapping rows considered
  duplicateGroups: number;  // (orderId, rawState) groups that had > 1 row
  deleted: number;
  examples: Array<{
    orderId: string;
    reference: string;
    rawState: string;
    deleted: number;
  }>;
}

export async function dedupeColiixShippingLogs(): Promise<DedupeShippingLogsResult> {
  const logs = await prisma.orderLog.findMany({
    where: { type: 'shipping' },
    select: {
      id: true,
      orderId: true,
      meta: true,
      order: { select: { reference: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  type Candidate = {
    id: string;
    orderId: string;
    reference: string;
    rawState: string;
  };
  const candidates: Candidate[] = [];
  for (const log of logs) {
    const m = log.meta as Record<string, unknown> | null;
    if (!m || m.provider !== 'coliix') continue;
    if (m.mapped) continue;             // status-change row — keep
    if (m.source === 'remap') continue; // remap row — keep
    const rawState = typeof m.rawState === 'string' ? m.rawState.trim() : '';
    if (!rawState) continue;
    candidates.push({
      id: log.id,
      orderId: log.orderId,
      reference: log.order.reference,
      rawState,
    });
  }

  const groups = new Map<
    string,
    { orderId: string; reference: string; rawState: string; deleteIds: string[] }
  >();
  for (const c of candidates) {
    const key = `${c.orderId}::${c.rawState}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        orderId: c.orderId,
        reference: c.reference,
        rawState: c.rawState,
        deleteIds: [],
      });
    } else {
      existing.deleteIds.push(c.id);
    }
  }

  const dupGroups = Array.from(groups.values()).filter((g) => g.deleteIds.length > 0);
  const idsToDelete = dupGroups.flatMap((g) => g.deleteIds);

  // Chunked delete — Postgres caps a single `IN (…)` at ~32k parameters and
  // pgbouncer is friendlier with smaller statements anyway.
  const CHUNK = 500;
  for (let i = 0; i < idsToDelete.length; i += CHUNK) {
    const chunk = idsToDelete.slice(i, i + CHUNK);
    await prisma.orderLog.deleteMany({ where: { id: { in: chunk } } });
  }

  return {
    scanned: logs.length,
    candidates: candidates.length,
    duplicateGroups: dupGroups.length,
    deleted: idsToDelete.length,
    examples: dupGroups
      .sort((a, b) => b.deleteIds.length - a.deleteIds.length)
      .slice(0, 20)
      .map((g) => ({
        orderId: g.orderId,
        reference: g.reference,
        rawState: g.rawState,
        deleted: g.deleteIds.length,
      })),
  };
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
