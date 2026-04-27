-- CreateTable
CREATE TABLE "WebhookEventLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "secretMatched" BOOLEAN NOT NULL DEFAULT false,
    "statusCode" INTEGER NOT NULL,
    "tracking" TEXT,
    "rawState" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookEventLog_provider_createdAt_idx" ON "WebhookEventLog"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEventLog_createdAt_idx" ON "WebhookEventLog"("createdAt");
