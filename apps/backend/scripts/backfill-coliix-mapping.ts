/**
 * One-shot: re-evaluate every ShipmentEvent under the new smart-fallback
 * mapping (livr → delivered, refus/retour/annul → returned, else → in_transit)
 * and rebuild a clean V2 timeline so the admin sees consistent statuses
 * without the legacy "mappedState = null" gaps.
 *
 * What this does, in one transaction per shipment so partial failures roll
 * back cleanly:
 *   1. Recompute mappedState on every ShipmentEvent. Admin overrides saved in
 *      ColiixV2StatusMapping (non-null internalState) win; otherwise the
 *      smart-fallback buckets the wording.
 *   2. Sync Shipment.state / rawState / deliveredAt / returnedAt to reflect
 *      the latest event's mappedState.
 *   3. Sync the parent Order's shippingStatus / coliixRawState / deliveredAt
 *      via the V2 → V1 enum bridge (same table the runtime uses).
 *   4. Wipe old OrderLog rows where meta.provider = 'coliix_v2' and rebuild
 *      one log row per ShipmentEvent so the timeline shows no duplicates.
 *
 * Idempotent: running twice produces the same result. Run AFTER deploying the
 * smart-fallback change so new ingests use the same logic.
 *
 * Run:
 *   Local:   cd apps/backend && npx tsx scripts/backfill-coliix-mapping.ts
 *   Railway: railway run --service "backend " -- npx tsx scripts/backfill-coliix-mapping.ts
 */

import { PrismaClient, Prisma, type ShipmentState, type ShippingStatus } from '@prisma/client';

const prisma = new PrismaClient();

const CARRIER_CODE = 'coliix_v2';

// Mirror events.service.ts. Keep in lockstep — if the runtime bridge changes,
// rerun this script after.
const V2_TO_V1_STATUS: Record<ShipmentState, ShippingStatus> = {
  pending: 'not_shipped',
  push_failed: 'not_shipped',
  pushed: 'label_created',
  picked_up: 'picked_up',
  in_transit: 'in_transit',
  out_for_delivery: 'out_for_delivery',
  delivered: 'delivered',
  refused: 'return_refused',
  returned: 'returned',
  lost: 'lost',
  cancelled: 'not_shipped',
};

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function smartFallback(rawState: string): ShipmentState {
  const norm = normalize(rawState);
  if (norm.includes('livr')) return 'delivered';
  if (norm.includes('refus') || norm.includes('retour') || norm.includes('annul')) return 'returned';
  return 'in_transit';
}

interface OverrideMap {
  byExact: Map<string, ShipmentState>;
  byNormalized: Map<string, ShipmentState>;
  byFirstToken: Map<string, ShipmentState>;
}

async function loadAdminOverrides(): Promise<OverrideMap> {
  const rows = await prisma.coliixV2StatusMapping.findMany({
    where: { carrierCode: CARRIER_CODE, internalState: { not: null } },
  });
  const byExact = new Map<string, ShipmentState>();
  const byNormalized = new Map<string, ShipmentState>();
  const byFirstToken = new Map<string, ShipmentState>();
  for (const r of rows) {
    if (!r.internalState) continue;
    byExact.set(r.rawWording, r.internalState);
    const norm = normalize(r.rawWording);
    if (norm && !byNormalized.has(norm)) byNormalized.set(norm, r.internalState);
    const tok = norm.split(/\s+/)[0] ?? '';
    if (tok && !byFirstToken.has(tok)) byFirstToken.set(tok, r.internalState);
  }
  return { byExact, byNormalized, byFirstToken };
}

function resolveState(rawState: string, overrides: OverrideMap): ShipmentState {
  const exact = overrides.byExact.get(rawState);
  if (exact) return exact;
  const norm = normalize(rawState);
  const normHit = overrides.byNormalized.get(norm);
  if (normHit) return normHit;
  const tok = norm.split(/\s+/)[0] ?? '';
  const tokHit = overrides.byFirstToken.get(tok);
  if (tokHit) return tokHit;
  return smartFallback(rawState);
}

async function main() {
  console.log('[backfill] loading admin overrides…');
  const overrides = await loadAdminOverrides();
  console.log(`[backfill] ${overrides.byExact.size} explicit override(s) loaded`);

  // Pull every shipment that has at least one event. Ones with no events
  // (push pending, push_failed) keep their current state — nothing to backfill.
  const shipments = await prisma.shipment.findMany({
    where: { events: { some: {} } },
    select: { id: true, orderId: true, state: true, rawState: true },
  });
  console.log(`[backfill] ${shipments.length} shipment(s) with event history`);

  let eventsUpdated = 0;
  let shipmentsUpdated = 0;
  let ordersUpdated = 0;
  let logsDeleted = 0;
  let logsCreated = 0;

  for (const s of shipments) {
    const events = await prisma.shipmentEvent.findMany({
      where: { shipmentId: s.id },
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        source: true,
        rawState: true,
        mappedState: true,
        driverNote: true,
        occurredAt: true,
      },
    });
    if (events.length === 0) continue;

    // Resolve every event under the new rules. Drop events with no rawState
    // — they shouldn't exist post-deploy but legacy rows might; without a
    // wording there's nothing to map and rebuilding a log row would produce
    // a nonsensical timeline entry.
    const resolved = events
      .filter((e): e is typeof e & { rawState: string } => Boolean(e.rawState))
      .map((e) => ({
        ...e,
        desiredMapped: resolveState(e.rawState, overrides),
      }));
    if (resolved.length === 0) continue;

    const latest = resolved[resolved.length - 1];
    const targetState = latest.desiredMapped;
    const targetRaw = latest.rawState;
    const deliveredEvent = [...resolved].reverse().find((e) => e.desiredMapped === 'delivered');
    const returnedEvent = [...resolved].reverse().find(
      (e) => e.desiredMapped === 'returned' || e.desiredMapped === 'refused',
    );

    await prisma.$transaction(async (tx) => {
      // 1) Patch ShipmentEvent.mappedState where it diverges.
      for (const e of resolved) {
        if (e.mappedState !== e.desiredMapped) {
          await tx.shipmentEvent.update({
            where: { id: e.id },
            data: { mappedState: e.desiredMapped },
          });
          eventsUpdated++;
        }
      }

      // 2) Sync Shipment.
      const shipmentPatch: Prisma.ShipmentUpdateInput = {};
      if (s.state !== targetState) shipmentPatch.state = targetState;
      if ((s.rawState ?? '') !== targetRaw) shipmentPatch.rawState = targetRaw;
      shipmentPatch.deliveredAt = deliveredEvent?.occurredAt ?? null;
      shipmentPatch.returnedAt = returnedEvent?.occurredAt ?? null;
      await tx.shipment.update({ where: { id: s.id }, data: shipmentPatch });
      if (s.state !== targetState || (s.rawState ?? '') !== targetRaw) {
        shipmentsUpdated++;
      }

      // 3) Sync Order.
      const orderPatch: Prisma.OrderUpdateInput = {
        coliixRawState: targetRaw,
        shippingStatus: V2_TO_V1_STATUS[targetState],
        deliveredAt: deliveredEvent?.occurredAt ?? null,
        lastTrackedAt: latest.occurredAt,
      };
      await tx.order.update({ where: { id: s.orderId }, data: orderPatch }).then(
        () => {
          ordersUpdated++;
        },
        (err) => {
          console.warn(`[backfill] order ${s.orderId} update failed:`, err);
        },
      );

      // 4) Wipe legacy V2 shipping logs for this shipment — match on the
      //    action prefix the runtime writes ("Coliix → ...") AND
      //    meta.shipmentId so we don't touch other shipments' logs
      //    (an order can have multiple shipments after a re-push).
      const wiped = await tx.orderLog.deleteMany({
        where: {
          orderId: s.orderId,
          type: 'shipping',
          action: { startsWith: 'Coliix → ' },
          meta: { path: ['shipmentId'], equals: s.id },
        },
      });
      logsDeleted += wiped.count;

      // 5) Rebuild a clean log per event (oldest → newest). ShipmentEvent
      //    already has the (shipmentId, dedupeHash) unique constraint, so
      //    one log per event = no duplicates.
      for (const e of resolved) {
        await tx.orderLog.create({
          data: {
            orderId: s.orderId,
            type: 'shipping',
            action: `Coliix → "${e.rawState}" (${e.source}) — mapped to ${e.desiredMapped}`,
            performedBy: 'System',
            createdAt: e.occurredAt,
            meta: {
              provider: 'coliix_v2',
              shipmentId: s.id,
              rawState: e.rawState,
              mappedState: e.desiredMapped,
              source: e.source,
              driverNote: e.driverNote ?? null,
              eventDate: e.occurredAt.toISOString(),
              backfilled: true,
            } as Prisma.InputJsonValue,
          },
        });
        logsCreated++;
      }
    });
  }

  console.log('[backfill] done.');
  console.log(`  events.mappedState updated:  ${eventsUpdated}`);
  console.log(`  shipments updated:           ${shipmentsUpdated}`);
  console.log(`  orders synced:               ${ordersUpdated}`);
  console.log(`  legacy shipping logs wiped:  ${logsDeleted}`);
  console.log(`  fresh shipping logs created: ${logsCreated}`);
}

main()
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
