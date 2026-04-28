-- Admin-editable Coliix → ShippingStatus mapping. Replaces the hard-coded
-- RULES array previously living in coliixStateMap.ts.
--
-- Behaviour at deploy time matches the prior hard-coded rules byte-for-byte:
-- the seed below inserts the same Livré→delivered and Retour*→returned
-- pairs the code used to define. Then we auto-discover every coliixRawState
-- already observed on Order rows so the editor lists everything in
-- production from day one.

CREATE TABLE "ColiixStatusMapping" (
    "coliixWording"  TEXT NOT NULL PRIMARY KEY,
    "internalStatus" "ShippingStatus",
    "note"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById"    TEXT
);

CREATE INDEX "ColiixStatusMapping_internalStatus_idx"
  ON "ColiixStatusMapping"("internalStatus");

-- Parity with the previous hard-coded rules. Conflict-safe so re-running
-- the migration locally never explodes.
INSERT INTO "ColiixStatusMapping" ("coliixWording", "internalStatus") VALUES
  ('Livré',           'delivered'),
  ('Livrée',          'delivered'),
  ('Delivered',       'delivered'),
  ('Retour',          'returned'),
  ('Retourné',        'returned'),
  ('Retournée',       'returned'),
  ('En retour',       'returned'),
  ('Retour en cours', 'returned'),
  ('Returned',        'returned')
ON CONFLICT ("coliixWording") DO NOTHING;

-- Auto-discover: insert a row (with NULL = "stay raw") for every distinct
-- coliixRawState already on production orders. Trimmed so trailing
-- whitespace doesn't create duplicates. Anything already inserted above
-- (e.g. an order whose rawState is exactly "Livré") is left alone.
INSERT INTO "ColiixStatusMapping" ("coliixWording", "internalStatus")
SELECT DISTINCT trim("coliixRawState"), NULL
FROM "Order"
WHERE "coliixRawState" IS NOT NULL
  AND trim("coliixRawState") <> ''
ON CONFLICT ("coliixWording") DO NOTHING;
