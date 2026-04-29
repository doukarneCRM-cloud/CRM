-- Make ColiixV2StatusMapping.internalState NULLABLE — auto-discovered
-- wordings should NOT default to a real state (the previous default of
-- 'pushed' was downgrading shipments back from 'picked_up' whenever Coliix
-- reported a wording we hadn't seeded, e.g. "Expédié" / "Reçu" / "Reporté").
-- Null means "store raw, don't change enum" — admin re-buckets later.

ALTER TABLE "ColiixV2StatusMapping" ALTER COLUMN "internalState" DROP NOT NULL;

-- Reset previously auto-discovered rows so they no longer downgrade. We
-- recognise them by the seed note we wrote in upsertUnknownWording.
UPDATE "ColiixV2StatusMapping"
   SET "internalState" = NULL
 WHERE "note" = '(auto-discovered — please review)';

-- Add proper seeds for the wordings we observed in production but missed
-- in the original migration. Same upsert pattern.
INSERT INTO "ColiixV2StatusMapping" ("id", "carrierCode", "rawWording", "internalState", "isTerminal") VALUES
  ('clx2-map-expedie',    'coliix_v2', 'Expédié',          'in_transit',       FALSE),
  ('clx2-map-recu',       'coliix_v2', 'Reçu',             'in_transit',       FALSE),
  ('clx2-map-recu-hub',   'coliix_v2', 'Reçu Au Hub',      'in_transit',       FALSE),
  ('clx2-map-reporte',    'coliix_v2', 'Reporté',          'out_for_delivery', FALSE),
  ('clx2-map-tentative',  'coliix_v2', 'Tentative De Livraison', 'out_for_delivery', FALSE),
  ('clx2-map-injoignable','coliix_v2', 'Injoignable',      'out_for_delivery', FALSE),
  ('clx2-map-annule',     'coliix_v2', 'Annulé',           'cancelled',        TRUE)
ON CONFLICT ("carrierCode", "rawWording") DO NOTHING;

-- Re-bucket any shipments whose rawState now has a proper mapping. This
-- corrects the downgrades the previous defaults caused.
UPDATE "Shipment" s
   SET "state" = m."internalState"
  FROM "ColiixV2StatusMapping" m
 WHERE m."carrierCode" = 'coliix_v2'
   AND m."internalState" IS NOT NULL
   AND s."rawState" = m."rawWording"
   AND s."state" <> m."internalState";
