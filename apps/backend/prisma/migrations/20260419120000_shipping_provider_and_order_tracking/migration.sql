-- ShippingProvider: one row per external shipping integration (Coliix, etc.).
-- Idempotent so partial re-runs of this migration do not blow up.
CREATE TABLE IF NOT EXISTS "ShippingProvider" (
  "id"            TEXT PRIMARY KEY,
  "name"          TEXT NOT NULL UNIQUE,
  "apiBaseUrl"    TEXT NOT NULL,
  "apiKey"        TEXT,
  "webhookSecret" TEXT NOT NULL,
  "isActive"      BOOLEAN NOT NULL DEFAULT false,
  "lastCheckedAt" TIMESTAMP(3),
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

-- Per-order tracking provider + last-tracked timestamp (polling throttle).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "lastTrackedAt"    TIMESTAMP(3);

-- Index so the Coliix tracker can pull in-flight orders quickly.
CREATE INDEX IF NOT EXISTS "Order_trackingProvider_lastTrackedAt_idx"
  ON "Order"("trackingProvider", "lastTrackedAt");
