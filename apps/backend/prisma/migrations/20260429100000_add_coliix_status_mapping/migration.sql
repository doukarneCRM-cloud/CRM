-- Admin-editable Coliix → ShippingStatus mapping. Replaces the hard-coded
-- RULES array previously living in coliixStateMap.ts.
--
-- Behaviour at deploy time matches the prior hard-coded rules byte-for-byte:
-- the seed below inserts the same Livré→delivered and Retour*→returned
-- pairs the code used to define. Then we auto-discover every coliixRawState
-- already observed on Order rows so the editor lists everything in
-- production from day one.
--
-- All DDL/DML is idempotent (IF NOT EXISTS, ON CONFLICT DO NOTHING) so a
-- partial-then-rolled-back run can be re-applied cleanly.

CREATE TABLE IF NOT EXISTS "ColiixStatusMapping" (
    "coliixWording"  TEXT NOT NULL PRIMARY KEY,
    "internalStatus" "ShippingStatus",
    "note"           TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById"    TEXT
);

CREATE INDEX IF NOT EXISTS "ColiixStatusMapping_internalStatus_idx"
  ON "ColiixStatusMapping"("internalStatus");

-- Parity with the previous hard-coded rules. Explicit ::"ShippingStatus"
-- casts so Postgres doesn't have to infer the enum type from a string
-- literal — that inference can fail on some setups and was the suspected
-- cause of the first deploy of this migration getting stuck in P3009.
INSERT INTO "ColiixStatusMapping" ("coliixWording", "internalStatus") VALUES
  ('Livré',           'delivered'::"ShippingStatus"),
  ('Livrée',          'delivered'::"ShippingStatus"),
  ('Delivered',       'delivered'::"ShippingStatus"),
  ('Retour',          'returned'::"ShippingStatus"),
  ('Retourné',        'returned'::"ShippingStatus"),
  ('Retournée',       'returned'::"ShippingStatus"),
  ('En retour',       'returned'::"ShippingStatus"),
  ('Retour en cours', 'returned'::"ShippingStatus"),
  ('Returned',        'returned'::"ShippingStatus")
ON CONFLICT ("coliixWording") DO NOTHING;

-- Auto-discover: insert a row (with NULL = "stay raw") for every distinct
-- coliixRawState already on production orders. NULL is cast to the enum
-- so Postgres knows the column type from a SELECT.
INSERT INTO "ColiixStatusMapping" ("coliixWording", "internalStatus")
SELECT DISTINCT trim("coliixRawState"), NULL::"ShippingStatus"
FROM "Order"
WHERE "coliixRawState" IS NOT NULL
  AND trim("coliixRawState") <> ''
ON CONFLICT ("coliixWording") DO NOTHING;
