-- CreateTable
CREATE TABLE "ColiixStateTemplate" (
    "id" TEXT NOT NULL,
    "coliixRawState" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColiixStateTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ColiixStateTemplate_coliixRawState_key" ON "ColiixStateTemplate"("coliixRawState");

-- CreateIndex
CREATE INDEX "ColiixStateTemplate_enabled_idx" ON "ColiixStateTemplate"("enabled");
