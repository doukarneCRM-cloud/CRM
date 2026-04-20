-- AlterTable: add deletedAt tombstone column to Product.
-- Idempotent so it works cleanly whether or not the column already exists
-- from a prior aborted attempt.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Index so list queries filtering deletedAt IS NULL stay fast
CREATE INDEX IF NOT EXISTS "Product_deletedAt_idx" ON "Product"("deletedAt");
