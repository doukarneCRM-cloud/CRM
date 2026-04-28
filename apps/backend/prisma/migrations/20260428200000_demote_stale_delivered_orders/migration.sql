-- One-shot cleanup: demote orders that are currently shippingStatus='delivered'
-- but whose Coliix raw wording no longer belongs to the delivered bucket.
--
-- Background: earlier mapping rules accepted "Reçu" / "Reçue" /
-- "Livraison effectuée" / etc. as delivered. The operator confirmed only
-- "Livré" / "Livrée" should count, so the application-level
-- mapColiixState was narrowed to ['livre', 'livree', 'delivered'].
-- Without this migration, previously-imported orders carrying the old
-- wordings would stay shippingStatus='delivered' forever and the
-- dashboard delivered KPI would never agree with the Coliix-wording
-- breakdown ("operator complaint: Livré count and delivered KPI don't
-- match").
--
-- Demotes to 'picked_up' (the most conservative truth: Coliix has the
-- parcel, exact phase unknown) and clears deliveredAt so revenue
-- analytics drop those rows. The kept-as-delivered set matches the
-- lowercased, trimmed raw wording against the same set of strings the
-- app's coliixStateMap currently recognises.
--
-- This migration is the audit trail; we deliberately don't INSERT
-- per-order OrderLog rows here to avoid depending on pgcrypto /
-- gen_random_uuid() and to keep the migration trivially re-runnable
-- against environments that have already absorbed it.

UPDATE "Order"
SET "shippingStatus" = 'picked_up',
    "deliveredAt"     = NULL,
    "lastTrackedAt"   = NOW()
WHERE "shippingStatus" = 'delivered'
  AND "coliixRawState" IS NOT NULL
  AND lower(trim("coliixRawState")) NOT IN (
    'livré',
    'livre',
    'livrée',
    'livree',
    'delivered'
  );
