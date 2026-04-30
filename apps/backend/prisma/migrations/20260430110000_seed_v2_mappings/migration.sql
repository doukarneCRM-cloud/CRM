-- The auto-discovered rows had note='(auto-discovered — please review)' and
-- the previous "make internalState NULLable" migration reset all of those to
-- NULL — including wordings the original seed had filled (Nouveau Colis,
-- Attente De Ramassage, etc.) because they had been auto-discovered BEFORE
-- the seed migration ran (ON CONFLICT DO NOTHING skipped them at seed time).
--
-- Result observed in production: every Coliix wording is unmapped, so
-- shipments stay stuck on whatever state the FIRST mapped event landed.
-- Fix: force-update each known wording to its correct internalState +
-- terminal flag, regardless of the note column. Idempotent — same UPDATE
-- can run any number of times safely.

UPDATE "ColiixV2StatusMapping"
   SET "internalState" = data."state"::"ShipmentState",
       "isTerminal"    = data."terminal"
  FROM (VALUES
    -- (rawWording, internalState, isTerminal)
    ('Nouveau Colis',          'pushed',           FALSE),
    ('Attente De Ramassage',   'pushed',           FALSE),
    ('Ramassé',                'picked_up',        FALSE),
    ('Expédié',                'in_transit',       FALSE),
    ('Reçu',                   'in_transit',       FALSE),
    ('Reçu Au Hub',            'in_transit',       FALSE),
    ('Mise en distribution',   'out_for_delivery', FALSE),
    ('Tentative De Livraison', 'out_for_delivery', FALSE),
    ('Reporté',                'out_for_delivery', FALSE),
    ('Injoignable',            'out_for_delivery', FALSE),
    ('Livré',                  'delivered',        TRUE),
    ('Refusé',                 'refused',          TRUE),
    ('Retour',                 'returned',         TRUE),
    ('Retour reçu',            'returned',         TRUE),
    ('Retour validé',          'returned',         TRUE),
    ('Annulé',                 'cancelled',        TRUE),
    ('Perdu',                  'lost',             TRUE)
  ) AS data("wording", "state", "terminal")
 WHERE "ColiixV2StatusMapping"."carrierCode" = 'coliix_v2'
   AND "ColiixV2StatusMapping"."rawWording" = data."wording";

-- Insert the same rows in case any wording isn't yet present in the table
-- (e.g. on a fresh install). ON CONFLICT DO NOTHING keeps the UPDATE above
-- as the source of truth for existing rows.
INSERT INTO "ColiixV2StatusMapping" ("id", "carrierCode", "rawWording", "internalState", "isTerminal")
SELECT
  'clx2-map-' || md5(data."wording"),
  'coliix_v2',
  data."wording",
  data."state"::"ShipmentState",
  data."terminal"
FROM (VALUES
  ('Nouveau Colis',          'pushed',           FALSE),
  ('Attente De Ramassage',   'pushed',           FALSE),
  ('Ramassé',                'picked_up',        FALSE),
  ('Expédié',                'in_transit',       FALSE),
  ('Reçu',                   'in_transit',       FALSE),
  ('Reçu Au Hub',            'in_transit',       FALSE),
  ('Mise en distribution',   'out_for_delivery', FALSE),
  ('Tentative De Livraison', 'out_for_delivery', FALSE),
  ('Reporté',                'out_for_delivery', FALSE),
  ('Injoignable',            'out_for_delivery', FALSE),
  ('Livré',                  'delivered',        TRUE),
  ('Refusé',                 'refused',          TRUE),
  ('Retour',                 'returned',         TRUE),
  ('Retour reçu',            'returned',         TRUE),
  ('Retour validé',          'returned',         TRUE),
  ('Annulé',                 'cancelled',        TRUE),
  ('Perdu',                  'lost',             TRUE)
) AS data("wording", "state", "terminal")
ON CONFLICT ("carrierCode", "rawWording") DO NOTHING;

-- Re-bucket every shipment whose rawState now has a concrete mapping. This
-- pulls "Mise en distribution" parcels into out_for_delivery, "Expédié" /
-- "Reçu" into in_transit, etc. — fixing the existing fleet without waiting
-- for the next webhook to fire.
UPDATE "Shipment" s
   SET "state" = m."internalState"
  FROM "ColiixV2StatusMapping" m
 WHERE m."carrierCode"   = 'coliix_v2'
   AND m."internalState" IS NOT NULL
   AND s."rawState"      = m."rawWording"
   AND s."state"         <> m."internalState";

-- Bridge to the legacy Order columns so the call-center / orders list
-- KPIs and badges (which still read shippingStatus / coliixRawState) reflect
-- the corrected V2 state immediately. Same V2→V1 mapping the V2 ingest path
-- uses at runtime.
UPDATE "Order" o
   SET "shippingStatus" = (
     CASE m."internalState"
       WHEN 'pending'          THEN 'not_shipped'::"ShippingStatus"
       WHEN 'push_failed'      THEN 'not_shipped'::"ShippingStatus"
       WHEN 'pushed'           THEN 'label_created'::"ShippingStatus"
       WHEN 'picked_up'        THEN 'picked_up'::"ShippingStatus"
       WHEN 'in_transit'       THEN 'in_transit'::"ShippingStatus"
       WHEN 'out_for_delivery' THEN 'out_for_delivery'::"ShippingStatus"
       WHEN 'delivered'        THEN 'delivered'::"ShippingStatus"
       WHEN 'refused'          THEN 'return_refused'::"ShippingStatus"
       WHEN 'returned'         THEN 'returned'::"ShippingStatus"
       WHEN 'lost'             THEN 'lost'::"ShippingStatus"
       WHEN 'cancelled'        THEN 'not_shipped'::"ShippingStatus"
     END
   )
  FROM "Shipment" s, "ColiixV2StatusMapping" m
 WHERE s."orderId"       = o."id"
   AND m."carrierCode"   = 'coliix_v2'
   AND m."internalState" IS NOT NULL
   AND s."rawState"      = m."rawWording"
   AND o."trackingProvider" = 'coliix_v2';
