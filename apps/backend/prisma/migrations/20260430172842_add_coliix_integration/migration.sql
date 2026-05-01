-- CreateEnum
CREATE TYPE "ShipmentState" AS ENUM ('pending', 'pushed', 'picked_up', 'in_transit', 'out_for_delivery', 'failed_delivery', 'reported', 'delivered', 'returned');

-- CreateEnum
CREATE TYPE "ShipmentEventSource" AS ENUM ('webhook', 'poll', 'manual');

-- CreateEnum
CREATE TYPE "ColiixErrorType" AS ENUM ('webhook_invalid_secret', 'webhook_invalid_payload', 'webhook_unknown_tracking', 'mapping_unknown_wording', 'city_unknown', 'api_credential_invalid', 'api_timeout', 'api_unknown');

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierAccount" (
    "id" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "hubLabel" TEXT NOT NULL,
    "apiBaseUrl" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastHealthAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarrierCity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "zone" TEXT,
    "deliveryPrice" DECIMAL(12,2),
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarrierCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "trackingCode" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "state" "ShipmentState" NOT NULL DEFAULT 'pushed',
    "rawState" TEXT,
    "cod" DECIMAL(12,2) NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "goodsLabel" TEXT NOT NULL,
    "goodsQty" INTEGER NOT NULL,
    "comment" TEXT,
    "pushedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "nextPollAt" TIMESTAMP(3),
    "lastPolledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" TEXT NOT NULL,
    "shipmentId" TEXT NOT NULL,
    "source" "ShipmentEventSource" NOT NULL,
    "rawState" TEXT,
    "mappedState" "ShipmentState",
    "driverNote" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "dedupeHash" TEXT NOT NULL,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColiixStatusMapping" (
    "id" TEXT NOT NULL,
    "rawWording" TEXT NOT NULL,
    "internalState" "ShipmentState",
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColiixStatusMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColiixIntegrationError" (
    "id" TEXT NOT NULL,
    "type" "ColiixErrorType" NOT NULL,
    "shipmentId" TEXT,
    "orderId" TEXT,
    "accountId" TEXT,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ColiixIntegrationError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_code_key" ON "Carrier"("code");

-- CreateIndex
CREATE INDEX "CarrierAccount_carrierId_isActive_idx" ON "CarrierAccount"("carrierId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierAccount_carrierId_hubLabel_key" ON "CarrierAccount"("carrierId", "hubLabel");

-- CreateIndex
CREATE INDEX "CarrierCity_accountId_ville_idx" ON "CarrierCity"("accountId", "ville");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierCity_accountId_ville_key" ON "CarrierCity"("accountId", "ville");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_orderId_key" ON "Shipment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_trackingCode_key" ON "Shipment"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_idempotencyKey_key" ON "Shipment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Shipment_state_updatedAt_idx" ON "Shipment"("state", "updatedAt");

-- CreateIndex
CREATE INDEX "Shipment_nextPollAt_idx" ON "Shipment"("nextPollAt");

-- CreateIndex
CREATE INDEX "ShipmentEvent_shipmentId_occurredAt_idx" ON "ShipmentEvent"("shipmentId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentEvent_shipmentId_dedupeHash_key" ON "ShipmentEvent"("shipmentId", "dedupeHash");

-- CreateIndex
CREATE UNIQUE INDEX "ColiixStatusMapping_rawWording_key" ON "ColiixStatusMapping"("rawWording");

-- CreateIndex
CREATE INDEX "ColiixStatusMapping_internalState_idx" ON "ColiixStatusMapping"("internalState");

-- CreateIndex
CREATE INDEX "ColiixIntegrationError_type_resolved_createdAt_idx" ON "ColiixIntegrationError"("type", "resolved", "createdAt");

-- CreateIndex
CREATE INDEX "ColiixIntegrationError_shipmentId_idx" ON "ColiixIntegrationError"("shipmentId");

-- CreateIndex
CREATE INDEX "ColiixIntegrationError_orderId_idx" ON "ColiixIntegrationError"("orderId");

-- AddForeignKey
ALTER TABLE "CarrierAccount" ADD CONSTRAINT "CarrierAccount_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarrierCity" ADD CONSTRAINT "CarrierCity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CarrierAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CarrierAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
