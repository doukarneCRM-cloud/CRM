-- Coliix V2 — parallel integration alongside V1.
--
-- V1 (ShippingProvider, Order.coliixTrackingId, Order.coliixRawState, …) is
-- left untouched. New orders that opt into V2 get a Shipment row instead of
-- flipping Order.labelSent. The Shipment is the unit of carrier work; events
-- are append-only so the timeline is forensically complete.
--
-- All DDL is idempotent (IF NOT EXISTS) so a partial-then-rolled-back run
-- can be re-applied cleanly.

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "ShipmentState" AS ENUM (
    'pending',
    'push_failed',
    'pushed',
    'picked_up',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'refused',
    'returned',
    'lost',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ShipmentEventSource" AS ENUM ('webhook', 'poll', 'push', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Carrier ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Carrier" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "code"      TEXT NOT NULL,
  "label"     TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Carrier_code_key" ON "Carrier"("code");

-- Seed the one carrier we ship today. Idempotent: re-running this migration
-- is a no-op thanks to ON CONFLICT.
INSERT INTO "Carrier" ("id", "code", "label")
VALUES ('clx2-carrier-coliix', 'coliix_v2', 'Coliix')
ON CONFLICT ("code") DO NOTHING;

-- ── CarrierAccount ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CarrierAccount" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "carrierId"     TEXT NOT NULL,
  "storeId"       TEXT,
  "hubLabel"      TEXT NOT NULL,
  "apiBaseUrl"    TEXT NOT NULL,
  "apiKey"        TEXT NOT NULL,
  "webhookSecret" TEXT NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT FALSE,
  "lastHealthAt"  TIMESTAMP(3),
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CarrierAccount_carrierId_fkey"
    FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CarrierAccount_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CarrierAccount_carrierId_hubLabel_key"
  ON "CarrierAccount"("carrierId", "hubLabel");
CREATE INDEX IF NOT EXISTS "CarrierAccount_carrierId_isActive_idx"
  ON "CarrierAccount"("carrierId", "isActive");
CREATE INDEX IF NOT EXISTS "CarrierAccount_storeId_idx"
  ON "CarrierAccount"("storeId");

-- ── CarrierCity (ville cache) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CarrierCity" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "accountId"   TEXT NOT NULL,
  "ville"       TEXT NOT NULL,
  "zone"        TEXT,
  "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CarrierCity_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "CarrierAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "CarrierCity_accountId_ville_key"
  ON "CarrierCity"("accountId", "ville");
CREATE INDEX IF NOT EXISTS "CarrierCity_accountId_ville_idx"
  ON "CarrierCity"("accountId", "ville");

-- ── Shipment ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "Shipment" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "orderId"        TEXT NOT NULL,
  "accountId"      TEXT NOT NULL,
  "trackingCode"   TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "state"          "ShipmentState" NOT NULL DEFAULT 'pending',
  "rawState"       TEXT,
  "cod"            DECIMAL(12, 2) NOT NULL,
  "city"           TEXT NOT NULL,
  "zone"           TEXT,
  "address"        TEXT NOT NULL,
  "recipientName"  TEXT NOT NULL,
  "recipientPhone" TEXT NOT NULL,
  "goodsLabel"     TEXT NOT NULL,
  "goodsQty"       INTEGER NOT NULL,
  "note"           TEXT,
  "labelPdfUrl"    TEXT,
  "pushAttempts"   INTEGER NOT NULL DEFAULT 0,
  "lastPushError"  TEXT,
  "pushedAt"       TIMESTAMP(3),
  "deliveredAt"    TIMESTAMP(3),
  "returnedAt"     TIMESTAMP(3),
  "nextPollAt"     TIMESTAMP(3),
  "lastPolledAt"   TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shipment_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Shipment_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "CarrierAccount"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_trackingCode_key"
  ON "Shipment"("trackingCode");
CREATE UNIQUE INDEX IF NOT EXISTS "Shipment_idempotencyKey_key"
  ON "Shipment"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Shipment_orderId_idx" ON "Shipment"("orderId");
CREATE INDEX IF NOT EXISTS "Shipment_accountId_state_idx"
  ON "Shipment"("accountId", "state");
CREATE INDEX IF NOT EXISTS "Shipment_nextPollAt_idx"
  ON "Shipment"("nextPollAt");
CREATE INDEX IF NOT EXISTS "Shipment_state_updatedAt_idx"
  ON "Shipment"("state", "updatedAt");

-- ── ShipmentEvent ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ShipmentEvent" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "shipmentId"  TEXT NOT NULL,
  "source"      "ShipmentEventSource" NOT NULL,
  "rawState"    TEXT,
  "mappedState" "ShipmentState",
  "driverNote"  TEXT,
  "occurredAt"  TIMESTAMP(3) NOT NULL,
  "receivedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload"     JSONB NOT NULL,
  "dedupeHash"  TEXT NOT NULL,
  CONSTRAINT "ShipmentEvent_shipmentId_fkey"
    FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShipmentEvent_shipmentId_dedupeHash_key"
  ON "ShipmentEvent"("shipmentId", "dedupeHash");
CREATE INDEX IF NOT EXISTS "ShipmentEvent_shipmentId_occurredAt_idx"
  ON "ShipmentEvent"("shipmentId", "occurredAt");

-- ── ColiixV2StatusMapping (parity with V1 mappings) ─────────────────────────
CREATE TABLE IF NOT EXISTS "ColiixV2StatusMapping" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "carrierCode"   TEXT NOT NULL,
  "rawWording"    TEXT NOT NULL,
  "internalState" "ShipmentState" NOT NULL,
  "isTerminal"    BOOLEAN NOT NULL DEFAULT FALSE,
  "note"          TEXT,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ColiixV2StatusMapping_carrierCode_rawWording_key"
  ON "ColiixV2StatusMapping"("carrierCode", "rawWording");
CREATE INDEX IF NOT EXISTS "ColiixV2StatusMapping_carrierCode_internalState_idx"
  ON "ColiixV2StatusMapping"("carrierCode", "internalState");

-- Seed the canonical Coliix wordings observed in production. Same shape as
-- V1's ColiixStatusMapping seed, mapped to the V2 enum and with terminal
-- flags pre-set so the poller stops calling on terminal parcels.
INSERT INTO "ColiixV2StatusMapping" ("id", "carrierCode", "rawWording", "internalState", "isTerminal") VALUES
  ('clx2-map-livre',          'coliix_v2', 'Livré',                       'delivered',        TRUE),
  ('clx2-map-retour',         'coliix_v2', 'Retour',                      'returned',         TRUE),
  ('clx2-map-retour-recu',    'coliix_v2', 'Retour reçu',                 'returned',         TRUE),
  ('clx2-map-retour-valide',  'coliix_v2', 'Retour validé',               'returned',         TRUE),
  ('clx2-map-refuse',         'coliix_v2', 'Refusé',                      'refused',          TRUE),
  ('clx2-map-perdu',          'coliix_v2', 'Perdu',                       'lost',             TRUE),
  ('clx2-map-ramasse',        'coliix_v2', 'Ramassé',                     'picked_up',        FALSE),
  ('clx2-map-attente-ram',    'coliix_v2', 'Attente De Ramassage',        'pushed',           FALSE),
  ('clx2-map-en-cours',       'coliix_v2', 'En cours',                    'in_transit',       FALSE),
  ('clx2-map-livraison',      'coliix_v2', 'En cours de livraison',       'out_for_delivery', FALSE),
  ('clx2-map-nouveau',        'coliix_v2', 'Nouveau Colis',               'pushed',           FALSE)
ON CONFLICT ("carrierCode", "rawWording") DO NOTHING;
