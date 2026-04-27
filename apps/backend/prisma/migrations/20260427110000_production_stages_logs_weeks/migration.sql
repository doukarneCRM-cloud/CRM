-- Production stages, audit log, and weekly cost-split groups.
-- Net-additive on ProductionRun; three new tables.

-- ─── New enums ──────────────────────────────────────────────────────────────
CREATE TYPE "ProductionStage" AS ENUM ('cut', 'sew', 'finish', 'qc', 'packed');
CREATE TYPE "ProductionLogType" AS ENUM ('system', 'stage', 'consumption', 'labor', 'note', 'status');
CREATE TYPE "LaborAllocationMode" AS ENUM ('by_pieces', 'by_complexity', 'manual');

-- ─── ProductionWeek (created first so ProductionRun.weekId FK works) ─────────
CREATE TABLE "ProductionWeek" (
  "id"         TEXT NOT NULL,
  "weekStart"  TIMESTAMP(3) NOT NULL,
  "laborTotal" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "closed"     BOOLEAN NOT NULL DEFAULT false,
  "closedAt"   TIMESTAMP(3),
  "closedById" TEXT,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionWeek_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionWeek_weekStart_key" ON "ProductionWeek" ("weekStart");

-- ─── Extend ProductionRun ────────────────────────────────────────────────────
ALTER TABLE "ProductionRun"
  ADD COLUMN "weekId"           TEXT,
  ADD COLUMN "laborAllocation"  "LaborAllocationMode" NOT NULL DEFAULT 'by_pieces',
  ADD COLUMN "laborManualShare" DECIMAL(5, 2);

ALTER TABLE "ProductionRun"
  ADD CONSTRAINT "ProductionRun_weekId_fkey"
  FOREIGN KEY ("weekId") REFERENCES "ProductionWeek"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ProductionRun_weekId_idx" ON "ProductionRun" ("weekId");

-- ─── ProductionRunStage ──────────────────────────────────────────────────────
CREATE TABLE "ProductionRunStage" (
  "id"             TEXT NOT NULL,
  "runId"          TEXT NOT NULL,
  "stage"          "ProductionStage" NOT NULL,
  "startedAt"      TIMESTAMP(3),
  "completedAt"    TIMESTAMP(3),
  "inputPieces"    INTEGER NOT NULL DEFAULT 0,
  "outputPieces"   INTEGER NOT NULL DEFAULT 0,
  "rejectedPieces" INTEGER NOT NULL DEFAULT 0,
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductionRunStage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionRunStage_runId_stage_key" ON "ProductionRunStage" ("runId", "stage");
CREATE INDEX "ProductionRunStage_runId_stage_idx" ON "ProductionRunStage" ("runId", "stage");

ALTER TABLE "ProductionRunStage"
  ADD CONSTRAINT "ProductionRunStage_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ProductionLog ───────────────────────────────────────────────────────────
CREATE TABLE "ProductionLog" (
  "id"            TEXT NOT NULL,
  "runId"         TEXT NOT NULL,
  "type"          "ProductionLogType" NOT NULL,
  "action"        TEXT NOT NULL,
  "performedBy"   TEXT,
  "performedById" TEXT,
  "meta"          JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductionLog_runId_createdAt_idx" ON "ProductionLog" ("runId", "createdAt");

ALTER TABLE "ProductionLog"
  ADD CONSTRAINT "ProductionLog_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
