/**
 * Shipments — links a Coliix tracking code to an order.
 *
 * The agent creates the parcel manually inside Coliix's portal (Coliix
 * doesn't expose a "create parcel" API to this account), then pastes
 * the tracking code into our CRM. This service turns that paste into a
 * Shipment row, validates the city against the imported CarrierCity
 * table, and arms the polling fallback by setting an initial nextPollAt.
 *
 * Once the row exists, the webhook + poll worker drive every state
 * change going forward — this service only handles the initial linking.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { decryptSecret } from '../../../shared/encryption';
import { emitToRoom, emitOrderUpdated } from '../../../shared/socket';
import * as cities from './cities.service';
import { addParcel, extractTracking, ColiixApiError } from './coliix.client';
import { logError } from './errors.service';
import { pollOneShipment } from './poll.worker';

// True when Coliix accepted the request — the envelope's status is
// either true (boolean) or 200 (legacy number).
function isOk(status: unknown): boolean {
  return status === true || status === 200;
}

// ─── Build the goods label from order items ─────────────────────────────────
// Format: "Product Color/Size (qty), Product2 Color/Size (qty), …".
// Truncated at 240 chars because Coliix labels are tight on space.
const GOODS_LABEL_MAX = 240;

interface OrderItemForLabel {
  quantity: number;
  variant: {
    color: string | null;
    size: string | null;
    product: { name: string };
  };
}

function buildGoodsLabel(items: OrderItemForLabel[]): { label: string; qty: number } {
  const parts: string[] = [];
  let qty = 0;
  for (const it of items) {
    qty += it.quantity;
    const v = [it.variant.color, it.variant.size].filter(Boolean).join('/');
    parts.push(v ? `${it.variant.product.name} ${v} (${it.quantity})` : `${it.variant.product.name} (${it.quantity})`);
  }
  let label = parts.join(', ');
  if (label.length > GOODS_LABEL_MAX) {
    label = `${label.slice(0, GOODS_LABEL_MAX - 1).trim()}…`;
  }
  return { label, qty };
}

// ─── Public order summary (used by the "Mark as Shipped" modal) ─────────────

export interface OrderShipmentDraft {
  orderId: string;
  reference: string;
  customer: {
    fullName: string;
    phone: string;
    phoneDisplay: string;
    city: string;
    address: string | null;
  };
  goodsLabel: string;
  goodsQty: number;
  cod: number;
  shippingInstruction: string | null;
  // City lookup result so the modal can flag "this city isn't in your
  // Coliix list yet" before the agent submits.
  cityKnown: boolean;
  cityFee: number | null;
  // Existing shipment, if any. The modal shows a re-link warning when
  // present.
  existingShipment: { id: string; trackingCode: string; state: string } | null;
}

export async function getOrderShipmentDraft(
  orderId: string,
  accountId: string,
): Promise<OrderShipmentDraft> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      reference: true,
      total: true,
      shippingInstruction: true,
      customer: {
        select: { fullName: true, phone: true, phoneDisplay: true, city: true, address: true },
      },
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
      shipment: {
        select: { id: true, trackingCode: true, state: true },
      },
    },
  });

  if (!order) {
    throw Object.assign(new Error('Order not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }

  const goods = buildGoodsLabel(order.items);
  const cityHit = await cities.findCity(accountId, order.customer.city);

  return {
    orderId: order.id,
    reference: order.reference,
    customer: {
      fullName: order.customer.fullName,
      phone: order.customer.phone,
      phoneDisplay: order.customer.phoneDisplay,
      city: order.customer.city,
      address: order.customer.address,
    },
    goodsLabel: goods.label,
    goodsQty: goods.qty,
    cod: Number(order.total),
    shippingInstruction: order.shippingInstruction,
    cityKnown: !!cityHit,
    cityFee: cityHit?.deliveryPrice ?? null,
    existingShipment: order.shipment,
  };
}

// ─── Create the Shipment (auto-call Coliix) ─────────────────────────────────
// One click on the Send button → CRM POSTs to Coliix's add-parcel API →
// Coliix returns a fresh tracking code → CRM stores it. No manual paste,
// no extra modal step. From here, webhook + poll fallback drive every
// state change.

export interface CreateShipmentInput {
  orderId: string;
  accountId: string;
  // When true, replaces any existing shipment on the order. The route
  // exposes this as a confirmation knob; default is false (409 on
  // already-linked).
  force?: boolean;
  actor: { id: string; name: string };
}

export interface CreateShipmentResult {
  shipmentId: string;
  trackingCode: string;
}

// ── Per-order mutex ──────────────────────────────────────────────────────────
// A double-clicked "Send to Coliix" button (or any race that fires two
// concurrent POSTs for the same order) used to slip past the re-link
// guard below: both requests read `order.shipment = null` before either
// transaction had committed, both then POSTed to Coliix, and Coliix
// happily created two parcels — the second insert into our `Shipment`
// table failed silently on the `idempotencyKey` unique constraint, so
// we'd never notice on our side.
//
// Serialize concurrent createShipment calls per orderId in-process: the
// second caller waits for the first to finish, then re-runs and finds
// the shipment row already linked → throws ALREADY_LINKED without
// touching Coliix. Single-instance backend, so an in-memory map is
// sufficient; a multi-instance deployment would need a distributed lock
// (e.g. Postgres advisory lock keyed on order id).
const shipmentLocks = new Map<string, Promise<unknown>>();

export async function createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  const inflight = shipmentLocks.get(input.orderId);
  if (inflight) {
    // Wait for the in-flight call to settle (success OR failure), then fall
    // through and re-run normally. The re-link guard will catch us if the
    // first call linked a shipment.
    await inflight.catch(() => undefined);
  }
  const promise = doCreateShipment(input);
  shipmentLocks.set(input.orderId, promise);
  try {
    return await promise;
  } finally {
    if (shipmentLocks.get(input.orderId) === promise) {
      shipmentLocks.delete(input.orderId);
    }
  }
}

async function doCreateShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
  // ── 1. Load order + carrier account ──────────────────────────────────
  const [order, account] = await Promise.all([
    prisma.order.findUnique({
      where: { id: input.orderId },
      select: {
        id: true,
        reference: true,
        total: true,
        shippingInstruction: true,
        isArchived: true,
        mergedIntoId: true,
        confirmationStatus: true,
        customer: {
          select: { fullName: true, phoneDisplay: true, city: true, address: true },
        },
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
        shipment: { select: { id: true } },
      },
    }),
    prisma.carrierAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, hubLabel: true, apiBaseUrl: true, apiKey: true, isActive: true },
    }),
  ]);

  if (!order) {
    throw Object.assign(new Error('Order not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  if (!account) {
    throw Object.assign(new Error('Coliix hub not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  }
  if (!account.isActive) {
    throw Object.assign(new Error('Coliix hub is inactive — activate it on the Setup tab.'), {
      statusCode: 412,
      code: 'HUB_INACTIVE',
    });
  }
  if (order.isArchived || order.mergedIntoId) {
    throw Object.assign(new Error('Order is archived or merged'), {
      statusCode: 400,
      code: 'INVALID_STATE',
    });
  }
  if (order.confirmationStatus !== 'confirmed') {
    throw Object.assign(new Error('Only confirmed orders can be sent to Coliix.'), {
      statusCode: 400,
      code: 'NOT_CONFIRMED',
    });
  }

  // ── 2. Validate the city against the imported list ───────────────────
  const cityHit = await cities.findCity(input.accountId, order.customer.city);
  if (!cityHit) {
    await logError({
      type: 'city_unknown',
      message: `City "${order.customer.city}" is not in your Coliix city list. Add it on the Cities tab.`,
      accountId: input.accountId,
      orderId: order.id,
      meta: { city: order.customer.city },
    });
    throw Object.assign(
      new Error(
        `City "${order.customer.city}" is not in your Coliix city list. Add it on the Cities tab first.`,
      ),
      { statusCode: 422, code: 'CITY_UNKNOWN' },
    );
  }

  // ── 3. Re-link guard ─────────────────────────────────────────────────
  if (order.shipment && !input.force) {
    throw Object.assign(
      new Error('This order already has a shipment. Use force to replace.'),
      { statusCode: 409, code: 'ALREADY_LINKED' },
    );
  }

  const goods = buildGoodsLabel(order.items);

  // ── 4. Call Coliix add-parcel API ─────────────────────────────────────
  let response;
  try {
    response = await addParcel({
      baseUrl: account.apiBaseUrl,
      apiKey: decryptSecret(account.apiKey),
      fullName: order.customer.fullName,
      phone: order.customer.phoneDisplay,
      city: order.customer.city,
      address: order.customer.address ?? '',
      comment: order.shippingInstruction,
      cod: Number(order.total),
      goodsLabel: goods.label,
      goodsQty: goods.qty,
      hubLabel: account.hubLabel,
    });
  } catch (err) {
    // Translate ColiixApiError into a typed CRM error + Errors-tab row
    // so the UI can show the operator what to fix.
    const kind = err instanceof ColiixApiError ? err.kind : 'unknown';
    const message = err instanceof Error ? err.message : String(err);
    const errorType =
      kind === 'credential'
        ? ('api_credential_invalid' as const)
        : kind === 'timeout'
          ? ('api_timeout' as const)
          : ('api_unknown' as const);
    await logError({
      type: errorType,
      message: `Coliix add-parcel failed: ${message}`,
      accountId: input.accountId,
      orderId: order.id,
      meta: { city: order.customer.city, cod: Number(order.total), goods: goods.label },
    });
    throw Object.assign(new Error(message), {
      statusCode: kind === 'credential' ? 401 : kind === 'timeout' ? 504 : 502,
      code: 'COLIIX_API_ERROR',
    });
  }

  // ── 5. Validate Coliix response ──────────────────────────────────────
  if (!isOk(response.status)) {
    const msg = typeof response.msg === 'string' ? response.msg : 'Coliix rejected the parcel';
    await logError({
      type: 'api_unknown',
      message: `Coliix rejected: ${msg}`,
      accountId: input.accountId,
      orderId: order.id,
      meta: { response: response as Record<string, unknown> },
    });
    throw Object.assign(new Error(msg), {
      statusCode: 422,
      code: 'COLIIX_REJECTED',
    });
  }

  const trackingCode = extractTracking(response);
  if (!trackingCode) {
    await logError({
      type: 'api_unknown',
      message: 'Coliix accepted the parcel but no tracking code was returned',
      accountId: input.accountId,
      orderId: order.id,
      meta: { response: response as Record<string, unknown> },
    });
    throw Object.assign(
      new Error('Coliix accepted the parcel but did not return a tracking code'),
      { statusCode: 502, code: 'COLIIX_NO_TRACKING' },
    );
  }

  const now = new Date();
  // Initial nextPollAt — 30s. We want to capture Coliix's first status
  // ("Nouveau Colis") before the operator manually advances it to
  // "Attente De Ramassage" by creating the label, otherwise the
  // intermediate wording is lost from the timeline. Webhook-configured
  // accounts get the update instantly anyway; this cadence is the
  // fallback for the first minute of a parcel's life.
  const nextPollAt = new Date(now.getTime() + 30_000);

  // ── 6. Persist Shipment + flip Order.labelSent atomically ────────────
  const result = await prisma.$transaction(async (tx) => {
    if (order.shipment) {
      await tx.shipment.delete({ where: { id: order.shipment.id } });
    }
    const shipment = await tx.shipment.create({
      data: {
        orderId: order.id,
        accountId: input.accountId,
        trackingCode,
        idempotencyKey: order.reference,
        state: 'pushed',
        cod: order.total,
        city: order.customer.city,
        address: order.customer.address ?? '',
        recipientName: order.customer.fullName,
        recipientPhone: order.customer.phoneDisplay,
        goodsLabel: goods.label,
        goodsQty: goods.qty,
        comment: order.shippingInstruction ?? null,
        pushedAt: now,
        nextPollAt,
      },
    });

    // Mirror the shipment state onto the order's shippingStatus so the
    // orders table / dashboard / pipeline cards reflect the new state
    // immediately. Without this the Shipment row says `pushed` but the
    // Order row stays `not_shipped`, so the row badge never moves until
    // a tracking event later flips it.
    await tx.order.update({
      where: { id: order.id },
      data: {
        labelSent: true,
        labelSentAt: now,
        shippingStatus: 'pushed',
      },
    });

    await tx.orderLog.create({
      data: {
        orderId: order.id,
        type: 'shipping',
        action: `Sent to Coliix · tracking ${trackingCode}`,
        performedBy: input.actor.name,
        userId: input.actor.id,
        meta: {
          trackingCode,
          accountId: input.accountId,
          coliixResponse: response as Record<string, unknown>,
        } as never,
      },
    });

    return shipment;
  });

  // ── 7. Socket fan-out ────────────────────────────────────────────────
  emitOrderUpdated(order.id, { kpi: 'shipped' });
  emitToRoom('admin', 'shipment:updated', {
    shipmentId: result.id,
    orderId: order.id,
    accountId: result.accountId,
    state: 'pushed',
    ts: Date.now(),
  });

  // ── 8. Immediate first poll ──────────────────────────────────────────
  // Fire one targeted poll a few seconds after the parcel lands at
  // Coliix's side so "Nouveau Colis" (the first wording Coliix emits
  // after addParcel) shows up in the timeline within seconds rather
  // than waiting for the next polling tick. Operators routinely advance
  // the parcel to "Attente De Ramassage" by creating the label
  // immediately afterwards — without this trigger, the intermediate
  // "Nouveau Colis" wording is overwritten in Coliix's tracking
  // response before our first scheduled poll arrives, and the order
  // timeline silently loses it. Fire-and-forget; pollOneShipment owns
  // its own error logging.
  setTimeout(() => {
    pollOneShipment(result.id).catch(() => {
      /* swallowed inside pollOneShipment via logError */
    });
  }, 3000);

  return { shipmentId: result.id, trackingCode: result.trackingCode };
}

// ─── Read shipment + timeline (used by Order detail) ────────────────────────

export interface TimelineEvent {
  id: string;
  source: string;
  rawState: string | null;
  mappedState: string | null;
  driverNote: string | null;
  occurredAt: Date;
  receivedAt: Date;
}

export interface ShipmentDetail {
  id: string;
  orderId: string;
  trackingCode: string;
  state: string;
  rawState: string | null;
  cod: number;
  city: string;
  address: string;
  recipientName: string;
  recipientPhone: string;
  goodsLabel: string;
  goodsQty: number;
  comment: string | null;
  pushedAt: Date;
  deliveredAt: Date | null;
  returnedAt: Date | null;
  events: TimelineEvent[];
  account: { id: string; hubLabel: string };
}

/**
 * Force a fresh track call to Coliix for this shipment, ingest whatever
 * history Coliix returns, and return the updated detail. Used by the
 * "Refresh" button on the order's shipment timeline so the operator
 * doesn't have to wait up to 60s for the next poll tick.
 *
 * Returns null if the order has no shipment yet (caller renders the
 * "Send to Coliix" CTA instead).
 */
export async function trackNow(orderId: string): Promise<ShipmentDetail | null> {
  const ship = await prisma.shipment.findUnique({
    where: { orderId },
    select: {
      id: true,
      trackingCode: true,
      accountId: true,
      account: { select: { apiBaseUrl: true } },
    },
  });
  if (!ship) return null;

  // Lazy-import to dodge the cycle the worker file would otherwise
  // create with this service through the events.service ingest path.
  const { track } = await import('./coliix.client');
  const { getDecryptedApiKey } = await import('./accounts.service');
  const { ingestEvent } = await import('./events.service');
  const { logError } = await import('./errors.service');
  const crypto = await import('node:crypto');

  let apiKey: string;
  try {
    apiKey = await getDecryptedApiKey(ship.accountId);
  } catch {
    return getShipmentDetail(orderId);
  }

  try {
    const response = await track({
      baseUrl: ship.account.apiBaseUrl,
      apiKey,
      tracking: ship.trackingCode,
    });
    // Coliix track responses keep the chronological history on the
    // envelope's `msg` array. We replay every entry through the same
    // ingest pipeline the webhook + poll worker use, so per-event
    // ShipmentEvent rows + state transitions land identically. Dedupe
    // hashes prevent double-ingesting events we've already seen.
    const envelope = response as unknown as Record<string, unknown>;
    const msg = Array.isArray(envelope?.msg) ? (envelope.msg as Array<Record<string, unknown>>) : [];
    for (const entry of msg) {
      const rawState = String(entry.status ?? entry.state ?? entry.etat ?? '').trim();
      if (!rawState) continue;
      const time = String(entry.time ?? entry.date ?? entry.datereported ?? '');
      const normalisedTime = time.replace(/\s+:/, ':');
      const occurredAt = normalisedTime ? new Date(normalisedTime) : null;
      const note = (entry.note ?? entry.comment ?? entry.driverNote ?? null) as string | null;
      const dedupeHash = crypto
        .createHash('sha256')
        .update(`${ship.trackingCode}|${rawState}|${normalisedTime}`)
        .digest('hex');

      try {
        await ingestEvent({
          source: 'poll',
          tracking: ship.trackingCode,
          rawState,
          driverNote: note,
          eventDate: occurredAt && !Number.isNaN(occurredAt.getTime()) ? occurredAt : null,
          dedupeHash,
          payload: entry,
        });
      } catch {
        // ingestEvent already logs its own errors — swallow per-entry
        // failures so one malformed history row doesn't abort the rest.
      }
    }
    // Mark the shipment as freshly polled regardless of ingest count
    // (no events = nothing changed, but we still touched Coliix).
    await prisma.shipment.update({
      where: { id: ship.id },
      data: { lastPolledAt: new Date() },
    });
  } catch (err) {
    await logError({
      type: 'api_unknown',
      message: err instanceof Error ? err.message : String(err),
      shipmentId: ship.id,
      orderId,
      accountId: ship.accountId,
      meta: { trigger: 'manual_track_now' },
    });
  }

  return getShipmentDetail(orderId);
}

export async function getShipmentDetail(orderId: string): Promise<ShipmentDetail | null> {
  const shipment = await prisma.shipment.findUnique({
    where: { orderId },
    include: {
      account: { select: { id: true, hubLabel: true } },
      events: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
      },
    },
  });
  if (!shipment) return null;
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    trackingCode: shipment.trackingCode,
    state: shipment.state,
    rawState: shipment.rawState,
    cod: Number(shipment.cod),
    city: shipment.city,
    address: shipment.address,
    recipientName: shipment.recipientName,
    recipientPhone: shipment.recipientPhone,
    goodsLabel: shipment.goodsLabel,
    goodsQty: shipment.goodsQty,
    comment: shipment.comment,
    pushedAt: shipment.pushedAt,
    deliveredAt: shipment.deliveredAt,
    returnedAt: shipment.returnedAt,
    account: shipment.account,
    events: shipment.events.map((e) => ({
      id: e.id,
      source: e.source,
      rawState: e.rawState,
      mappedState: e.mappedState,
      driverNote: e.driverNote,
      occurredAt: e.occurredAt,
      receivedAt: e.receivedAt,
    })),
  };
}

/**
 * Single-account shortcut for the modal — when the operator has only one
 * active hub, the modal skips the picker and uses this. If they have
 * multiple, the modal renders a select + the caller passes accountId
 * explicitly.
 */
export async function getDefaultAccountId(): Promise<string | null> {
  const row = await prisma.carrierAccount.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

// Tiny helper for the "we do have a Prisma type clash" linter — used by
// the routes to pre-validate that an accountId is real before passing
// down to createShipment, avoiding a Prisma FK violation surfacing as a
// generic 500.
export async function accountExists(id: string): Promise<boolean> {
  const row = await prisma.carrierAccount.findUnique({ where: { id }, select: { id: true } });
  return !!row;
}

// Type guard for the unique-violation we want to translate into a nicer
// 409 in the routes. Exported so the routes can use it without
// importing Prisma directly.
export function isUniqueTrackingViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes('trackingCode')
  );
}
