-- Per-metric status timestamps so KPI cards can answer "confirmed today",
-- "cancelled this week", "unreachable yesterday" by the date the transition
-- actually happened — not by createdAt (which is when the order arrived,
-- not when the agent acted on it).
--
-- The columns are nullable: rows with the matching state get a value,
-- rows that never reached that state stay null. Backfill below is
-- best-effort — uses the OrderLog history when available, falls back to
-- updatedAt otherwise.

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "confirmedAt"   TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelledAt"   TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "unreachableAt" TIMESTAMP(3);

-- Indexes — every KPI query date-filters on these.
CREATE INDEX IF NOT EXISTS "Order_confirmedAt_idx"   ON "Order"("confirmedAt");
CREATE INDEX IF NOT EXISTS "Order_cancelledAt_idx"   ON "Order"("cancelledAt");
CREATE INDEX IF NOT EXISTS "Order_unreachableAt_idx" ON "Order"("unreachableAt");

-- ── Backfill ────────────────────────────────────────────────────────────────
-- For each transition we look for the most recent OrderLog row mentioning
-- that transition and use its createdAt. If no log exists, fall back to
-- the order's own updatedAt (best estimate). Only applies to orders
-- currently sitting in that state — historical churn (confirmed → unreach
-- → confirmed again) is preserved on the latest log row.

UPDATE "Order" o SET "confirmedAt" = COALESCE(
  (SELECT MAX(l."createdAt") FROM "OrderLog" l
    WHERE l."orderId" = o.id
      AND l."type" = 'confirmation'
      AND l."action" ILIKE '%→ confirmed%'),
  o."updatedAt"
)
WHERE o."confirmationStatus" = 'confirmed' AND o."confirmedAt" IS NULL;

UPDATE "Order" o SET "cancelledAt" = COALESCE(
  (SELECT MAX(l."createdAt") FROM "OrderLog" l
    WHERE l."orderId" = o.id
      AND l."type" = 'confirmation'
      AND l."action" ILIKE '%→ cancelled%'),
  o."updatedAt"
)
WHERE o."confirmationStatus" = 'cancelled' AND o."cancelledAt" IS NULL;

UPDATE "Order" o SET "unreachableAt" = COALESCE(
  (SELECT MAX(l."createdAt") FROM "OrderLog" l
    WHERE l."orderId" = o.id
      AND l."type" = 'confirmation'
      AND l."action" ILIKE '%→ unreachable%'),
  o."updatedAt"
)
WHERE o."confirmationStatus" = 'unreachable' AND o."unreachableAt" IS NULL;
