-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM (
  'confirmation_confirmed',
  'confirmation_cancelled',
  'confirmation_unreachable',
  'shipping_picked_up',
  'shipping_in_transit',
  'shipping_out_for_delivery',
  'shipping_delivered',
  'shipping_returned',
  'shipping_return_validated',
  'commission_paid'
);

-- CreateEnum
CREATE TYPE "WhatsAppSessionStatus" AS ENUM ('disconnected', 'connecting', 'connected', 'error');

-- CreateEnum
CREATE TYPE "MessageLogStatus" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "MessageTemplate" (
  "id" TEXT NOT NULL,
  "trigger" "AutomationTrigger" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "body" TEXT NOT NULL,
  "updatedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_trigger_key" ON "MessageTemplate"("trigger");

-- CreateTable
CREATE TABLE "WhatsAppSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "instanceName" TEXT NOT NULL,
  "status" "WhatsAppSessionStatus" NOT NULL DEFAULT 'disconnected',
  "phoneNumber" TEXT,
  "lastHeartbeat" TIMESTAMP(3),
  "connectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_userId_key" ON "WhatsAppSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_instanceName_key" ON "WhatsAppSession"("instanceName");

-- CreateTable
CREATE TABLE "MessageLog" (
  "id" TEXT NOT NULL,
  "trigger" "AutomationTrigger" NOT NULL,
  "orderId" TEXT,
  "agentId" TEXT,
  "recipientPhone" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "status" "MessageLogStatus" NOT NULL DEFAULT 'queued',
  "providerId" TEXT,
  "error" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_dedupeKey_key" ON "MessageLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "MessageLog_status_createdAt_idx" ON "MessageLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_orderId_idx" ON "MessageLog"("orderId");

-- CreateIndex
CREATE INDEX "MessageLog_trigger_createdAt_idx" ON "MessageLog"("trigger", "createdAt");

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
