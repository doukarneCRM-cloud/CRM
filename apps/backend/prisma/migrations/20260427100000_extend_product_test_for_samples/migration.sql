-- Sample lifecycle + cost-calc + photos.
-- Net-additive on existing tables; one new table.

-- ─── New enum ────────────────────────────────────────────────────────────────
CREATE TYPE "SampleStatus" AS ENUM ('draft', 'tested', 'approved', 'archived');

-- ─── Extend ProductTest ──────────────────────────────────────────────────────
ALTER TABLE "ProductTest"
  ADD COLUMN "description"      TEXT,
  ADD COLUMN "status"           "SampleStatus" NOT NULL DEFAULT 'draft',
  ADD COLUMN "approvedAt"       TIMESTAMP(3),
  ADD COLUMN "approvedById"     TEXT,
  ADD COLUMN "laborMadPerPiece" DECIMAL(12, 2),
  ADD COLUMN "confirmationFee"  DECIMAL(12, 2),
  ADD COLUMN "deliveryFee"      DECIMAL(12, 2),
  ADD COLUMN "markupPercent"    DECIMAL(5, 2),
  ADD COLUMN "suggestedPrice"   DECIMAL(12, 2);

CREATE INDEX "ProductTest_status_createdAt_idx" ON "ProductTest" ("status", "createdAt");

ALTER TABLE "ProductTest"
  ADD CONSTRAINT "ProductTest_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Extend ProductTestAccessory ─────────────────────────────────────────────
ALTER TABLE "ProductTestAccessory"
  ADD COLUMN "unitCostSnapshot" DECIMAL(12, 2);

-- ─── New ProductTestPhoto ────────────────────────────────────────────────────
CREATE TABLE "ProductTestPhoto" (
  "id"        TEXT NOT NULL,
  "testId"    TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "caption"   TEXT,
  "position"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductTestPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductTestPhoto_testId_position_idx" ON "ProductTestPhoto" ("testId", "position");

ALTER TABLE "ProductTestPhoto"
  ADD CONSTRAINT "ProductTestPhoto_testId_fkey"
  FOREIGN KEY ("testId") REFERENCES "ProductTest"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
