/**
 * V1 → V2 migration. For every in-flight V1 order (has coliixTrackingId,
 * not yet terminal), create a matching Shipment row. After this runs:
 *   - Coliix's webhook (now pointing at V2) finds these shipments by their
 *     trackingCode and applies instant updates.
 *   - V1 can be safely disabled.
 *
 * Idempotent: re-running is a no-op for already-migrated orders (the
 * Shipment.trackingCode unique constraint catches dupes).
 *
 * Terminal V1 orders are intentionally skipped — they won't receive more
 * updates from Coliix, so there's no value in mirroring them. Their data
 * stays on the Order row as before.
 */

import { Prisma, ShipmentState, ShippingStatus } from '@prisma/client';
import { prisma } from '../../../shared/prisma';

// V1 ShippingStatus → V2 ShipmentState. Used so the migrated Shipment row
// reflects the order's current state at migration time. Subsequent webhook
// events will overwrite this via the mapping cache.
const V1_TO_V2_STATE: Partial<Record<ShippingStatus, ShipmentState>> = {
  label_created: 'pushed',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  attempted: 'out_for_delivery',
};

// V1 statuses we don't migrate — already terminal, no further updates expected.
const TERMINAL_V1: ShippingStatus[] = [
  'delivered',
  'returned',
  'return_validated',
  'return_refused',
  'exchange',
  'lost',
  'destroyed',
];

export interface MigrationResult {
  scanned: number;
  migrated: number;
  skippedAlreadyMigrated: number;
  skippedNoTracking: number;
  skippedTerminal: number;
  skippedNoCustomerData: number;
  errors: Array<{ orderId: string; reference: string; reason: string }>;
}

export async function migrateV1Orders(accountId: string): Promise<MigrationResult> {
  // Confirm account exists + is V2 Coliix
  const account = await prisma.carrierAccount.findUniqueOrThrow({
    where: { id: accountId },
    include: { carrier: { select: { code: true } } },
  });
  if (account.carrier.code !== 'coliix_v2') {
    throw new Error('Migration target must be a coliix_v2 account');
  }

  // Pull every V1 order that was pushed via Coliix and isn't terminal.
  const candidates = await prisma.order.findMany({
    where: {
      coliixTrackingId: { not: null },
      labelSent: true,
      shippingStatus: { notIn: TERMINAL_V1 },
    },
    include: {
      customer: {
        select: { fullName: true, phoneDisplay: true, phone: true, address: true, city: true },
      },
      items: { include: { variant: { include: { product: { select: { name: true } } } } } },
    },
  });

  const result: MigrationResult = {
    scanned: candidates.length,
    migrated: 0,
    skippedAlreadyMigrated: 0,
    skippedNoTracking: 0,
    skippedTerminal: 0,
    skippedNoCustomerData: 0,
    errors: [],
  };

  for (const order of candidates) {
    if (!order.coliixTrackingId) {
      result.skippedNoTracking++;
      continue;
    }

    // Already migrated? Match on trackingCode (V2's unique field).
    const existing = await prisma.shipment.findUnique({
      where: { trackingCode: order.coliixTrackingId },
      select: { id: true },
    });
    if (existing) {
      result.skippedAlreadyMigrated++;
      continue;
    }

    // Defensive: skip orders missing customer data we'd otherwise fabricate.
    const c = order.customer;
    if (!c.fullName?.trim() || !c.address?.trim() || !c.city?.trim()) {
      result.skippedNoCustomerData++;
      result.errors.push({
        orderId: order.id,
        reference: order.reference,
        reason: 'Customer name / address / city missing',
      });
      continue;
    }
    const phone = c.phoneDisplay?.trim() || c.phone?.trim();
    if (!phone) {
      result.skippedNoCustomerData++;
      result.errors.push({
        orderId: order.id,
        reference: order.reference,
        reason: 'Customer phone missing',
      });
      continue;
    }

    const goodsLabel = order.items
      .map((it) => `${it.variant.product.name} × ${it.quantity}`)
      .join(', ')
      .slice(0, 240);
    const goodsQty = order.items.reduce((sum, it) => sum + it.quantity, 0);
    const v2State = V1_TO_V2_STATE[order.shippingStatus] ?? 'pushed';

    try {
      // Pre-generate idempotencyKey so the row is valid on insert. Same
      // approach as createShipmentFromOrder.
      const placeholderKey = `migrated-${order.id}`;
      const created = await prisma.shipment.create({
        data: {
          orderId: order.id,
          accountId,
          trackingCode: order.coliixTrackingId,
          idempotencyKey: placeholderKey,
          state: v2State,
          rawState: order.coliixRawState ?? null,
          cod: new Prisma.Decimal(order.total.toString()),
          city: c.city.trim(),
          zone: null,
          address: c.address.trim(),
          recipientName: c.fullName.trim(),
          recipientPhone: phone,
          goodsLabel: goodsLabel || 'Articles',
          goodsQty: Math.max(1, goodsQty),
          note: null,
          pushedAt: order.labelSentAt,
          // Adaptive cadence still applies — webhook is primary, poll is the
          // safety net. Schedule a poll within the hour as a guard.
          nextPollAt: new Date(Date.now() + 30 * 60_000),
        },
        select: { id: true },
      });
      // Marker event so the timeline shows the migration moment.
      await prisma.shipmentEvent.create({
        data: {
          shipmentId: created.id,
          source: 'manual',
          rawState: order.coliixRawState ?? `Migrated from V1 (${order.shippingStatus})`,
          mappedState: v2State,
          driverNote: 'Migrated from Coliix V1 — instant updates now via V2 webhook',
          occurredAt: new Date(),
          payload: {
            v1Order: {
              reference: order.reference,
              shippingStatus: order.shippingStatus,
              labelSentAt: order.labelSentAt,
            },
          } as Prisma.InputJsonValue,
          dedupeHash: `migration:${order.id}:${Date.now()}`,
        },
      });
      result.migrated++;
    } catch (err) {
      result.errors.push({
        orderId: order.id,
        reference: order.reference,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
