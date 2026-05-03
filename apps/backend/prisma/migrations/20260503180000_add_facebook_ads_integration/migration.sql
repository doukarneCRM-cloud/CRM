-- AlterTable: tag every Expense with where it came from. Defaults to "manual"
-- so existing rows are unaffected. Auto-imported integration rows use
-- "facebook" / "tiktok" / "google".
ALTER TABLE "Expense" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX "Expense_source_idx" ON "Expense"("source");

-- CreateTable: AdAccount — one per connected Facebook (or future TikTok /
-- Google) ad account. AccessToken is stored AES-256-GCM encrypted.
CREATE TABLE "AdAccount" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'facebook',
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessId" TEXT,
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdAccount_provider_externalId_key" ON "AdAccount"("provider", "externalId");
CREATE INDEX "AdAccount_provider_isActive_idx" ON "AdAccount"("provider", "isActive");

-- CreateTable: AdSpendDay — one row per ad account per day. The sync job
-- upserts on (accountId, date). expenseId points at the auto-created
-- Expense row so disconnect can cascade-clean the Money page.
CREATE TABLE "AdSpendDay" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdSpendDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdSpendDay_expenseId_key" ON "AdSpendDay"("expenseId");
CREATE UNIQUE INDEX "AdSpendDay_accountId_date_key" ON "AdSpendDay"("accountId", "date");
CREATE INDEX "AdSpendDay_date_idx" ON "AdSpendDay"("date");

ALTER TABLE "AdSpendDay" ADD CONSTRAINT "AdSpendDay_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdSpendDay" ADD CONSTRAINT "AdSpendDay_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: AdCampaign — cached so the table renders without per-row
-- API calls. Refreshed by the sync worker.
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "spendCached" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdCampaign_accountId_externalId_key" ON "AdCampaign"("accountId", "externalId");
CREATE INDEX "AdCampaign_accountId_status_idx" ON "AdCampaign"("accountId", "status");

ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AdAdset
CREATE TABLE "AdAdset" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "spendCached" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAdset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdAdset_campaignId_externalId_key" ON "AdAdset"("campaignId", "externalId");
CREATE INDEX "AdAdset_campaignId_status_idx" ON "AdAdset"("campaignId", "status");

ALTER TABLE "AdAdset" ADD CONSTRAINT "AdAdset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: AdInvoice — read-only mirror of Meta Business Manager
-- monthly invoices. Operators see them in the Facebook tab without
-- logging into Meta's billing portal.
CREATE TABLE "AdInvoice" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdInvoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdInvoice_accountId_externalId_key" ON "AdInvoice"("accountId", "externalId");
CREATE INDEX "AdInvoice_periodEnd_idx" ON "AdInvoice"("periodEnd");

ALTER TABLE "AdInvoice" ADD CONSTRAINT "AdInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AdAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
