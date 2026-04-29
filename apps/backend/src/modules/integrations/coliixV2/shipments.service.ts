/**
 * Shipment lifecycle — create from order, enqueue push, expose detail/timeline.
 *
 * Compared to V1 (`coliix.service.exportOrder`) this layer never blocks the
 * caller on Coliix's HTTP — the route returns as soon as the Shipment row is
 * created and the push job is enqueued. The worker does the actual call.
 */

import crypto from 'node:crypto';
import { Prisma, type Shipment, type ShipmentEvent } from '@prisma/client';
import { prisma } from '../../../shared/prisma';
import { coliixV2PushQueue } from '../../../shared/queue';
import { pickAccountForStore } from './accounts.service';
import { isVilleKnown } from './cities.service';

export class ShipmentValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ShipmentValidationError';
    this.code = code;
  }
}

export interface CreateShipmentInput {
  orderId: string;
  // Optional override — defaults to picking an active account for the order's store.
  accountId?: string;
  // Optional override of the COD amount; defaults to order.total
  cod?: number;
  // Optional driver note
  note?: string | null;
}

export interface CreatedShipment {
  shipmentId: string;
  state: string;
  accountId: string;
  hubLabel: string;
}

/**
 * Phone normaliser. Accepts a few common Moroccan input forms and returns
 * a 10-digit form with leading 0. Throws on unrecoverable input.
 */
function normalisePhone(input: string): string {
  const digits = input.replace(/[^\d+]/g, '');
  // +212 6XX XXX XXX → 06XXXXXXXX
  if (digits.startsWith('+212')) return '0' + digits.slice(4);
  if (digits.startsWith('212') && digits.length === 12) return '0' + digits.slice(3);
  if (digits.startsWith('00212')) return '0' + digits.slice(5);
  if (digits.startsWith('0') && digits.length === 10) return digits;
  throw new ShipmentValidationError(
    'invalid_phone',
    `Phone number "${input}" is not in a recognised Moroccan format`,
  );
}

/**
 * Create a Shipment from an order, then enqueue the push. The order must be
 * confirmed and have a customer with phone + address. We validate before we
 * write so push failures don't pollute the table with orphan rows.
 */
export async function createShipmentFromOrder(input: CreateShipmentInput): Promise<CreatedShipment> {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      customer: { select: { name: true, phone: true, address: true, city: true } },
      items: { include: { variant: { include: { product: { select: { name: true } } } } } },
      store: { select: { id: true } },
    },
  });
  if (!order) throw new ShipmentValidationError('order_not_found', 'Order not found');
  if (order.confirmationStatus !== 'confirmed') {
    throw new ShipmentValidationError(
      'order_not_confirmed',
      'Only confirmed orders can be shipped via Coliix V2',
    );
  }

  const c = order.customer;
  if (!c.name?.trim()) throw new ShipmentValidationError('customer_name_missing', 'Customer name is required');
  if (!c.phone?.trim()) throw new ShipmentValidationError('customer_phone_missing', 'Customer phone is required');
  if (!c.address?.trim()) throw new ShipmentValidationError('customer_address_missing', 'Customer address is required');
  if (!c.city?.trim()) throw new ShipmentValidationError('customer_city_missing', 'Customer city (ville) is required');

  // Pick an active account scoped to the store (or unscoped fallback).
  let account: { id: string; hubLabel: string } | null;
  if (input.accountId) {
    const explicit = await prisma.carrierAccount.findUnique({
      where: { id: input.accountId },
      select: { id: true, hubLabel: true, isActive: true },
    });
    if (!explicit) throw new ShipmentValidationError('account_not_found', 'Carrier account not found');
    if (!explicit.isActive) throw new ShipmentValidationError('account_inactive', 'Carrier account is disabled');
    account = explicit;
  } else {
    const picked = await pickAccountForStore(order.store?.id ?? null);
    if (!picked) {
      throw new ShipmentValidationError(
        'no_active_account',
        'No active Coliix V2 account configured for this store',
      );
    }
    account = picked;
  }

  // Pre-flight ville check. Bypassable only by syncing cities or marking the
  // override flag (future). Today: hard-fail with a copy-fix message.
  const villeOk = await isVilleKnown(account.id, c.city.trim());
  if (!villeOk) {
    throw new ShipmentValidationError(
      'ville_not_recognised',
      `City "${c.city}" is not in Coliix's recognised list. Sync cities or fix the customer's city.`,
    );
  }

  // Phone normalisation. Throws on bad input — caller surfaces via 400.
  const phone = normalisePhone(c.phone);

  // Goods label: human-readable summary, e.g. "Sweater × 2, Bag × 1"
  const goodsLabel = order.items
    .map((it) => `${it.variant.product.name} × ${it.quantity}`)
    .join(', ')
    .slice(0, 240);
  const goodsQty = order.items.reduce((sum, it) => sum + it.quantity, 0);

  const cod = input.cod ?? Number(order.total);

  // Reuse an existing pending shipment if one exists for this order. Stops
  // double-clicks on the UI from creating two parcels.
  const existing = await prisma.shipment.findFirst({
    where: { orderId: order.id, state: { in: ['pending', 'push_failed'] } },
    select: { id: true, state: true, accountId: true },
  });

  let shipmentId: string;
  if (existing) {
    shipmentId = existing.id;
    // If the state is push_failed, allow the user to retry by resetting attempts.
    await prisma.shipment.update({
      where: { id: existing.id },
      data: { state: 'pending', lastPushError: null },
    });
  } else {
    // Pre-generate a unique idempotencyKey so the unique index is satisfied
    // on insert. We overwrite to the shipment id immediately after so the
    // push payload's tag matches the shipment row admins look up by.
    const placeholderKey = `pending-${crypto.randomUUID()}`;
    const created = await prisma.shipment.create({
      data: {
        orderId: order.id,
        accountId: account.id,
        idempotencyKey: placeholderKey,
        state: 'pending',
        cod: new Prisma.Decimal(cod),
        city: c.city.trim(),
        zone: null,
        address: c.address.trim(),
        recipientName: c.name.trim(),
        recipientPhone: phone,
        goodsLabel: goodsLabel || 'Articles',
        goodsQty: Math.max(1, goodsQty),
        note: input.note ?? null,
      },
      select: { id: true },
    });
    shipmentId = created.id;
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { idempotencyKey: shipmentId },
    });
  }

  // Enqueue with shipment id as the job id — Bull dedupes by jobId, so a
  // double-click can't push the parcel twice.
  await coliixV2PushQueue.add(
    { shipmentId },
    {
      jobId: `push:${shipmentId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
    },
  );

  return {
    shipmentId,
    state: existing ? existing.state : 'pending',
    accountId: account.id,
    hubLabel: account.hubLabel,
  };
}

export type ShipmentDetail = Shipment & { events: ShipmentEvent[] };

export async function getShipmentDetail(id: string): Promise<ShipmentDetail | null> {
  return prisma.shipment.findUnique({
    where: { id },
    include: { events: { orderBy: { occurredAt: 'desc' } } },
  });
}

export async function listShipmentsForOrder(orderId: string) {
  return prisma.shipment.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
    include: { account: { select: { hubLabel: true } } },
  });
}

/** Local cancel — Coliix has no API for cancelling a pushed parcel; we mark
 *  the shipment locally so KPIs are accurate, and the operator handles the
 *  physical pickup off-platform. */
export async function cancelShipment(id: string, reason: string | null) {
  const shipment = await prisma.shipment.findUnique({
    where: { id },
    select: { state: true },
  });
  if (!shipment) throw new ShipmentValidationError('shipment_not_found', 'Shipment not found');

  await prisma.shipment.update({
    where: { id },
    data: {
      state: 'cancelled',
      nextPollAt: null,
      note: reason ?? undefined,
    },
  });

  await prisma.shipmentEvent.create({
    data: {
      shipmentId: id,
      source: 'manual',
      rawState: 'Cancelled (local)',
      mappedState: 'cancelled',
      driverNote: reason ?? null,
      occurredAt: new Date(),
      payload: { reason } as Prisma.InputJsonValue,
      dedupeHash: `manual-cancel-${id}-${Date.now()}`,
    },
  });
}
