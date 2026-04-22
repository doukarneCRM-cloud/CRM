-- Adds conditional automation rules, customer WhatsApp opt-out, DLQ status,
-- label_created trigger, and the inbox (threads + messages) tables.

-- ── Enum extensions ──────────────────────────────────────────────────────
ALTER TYPE "AutomationTrigger" ADD VALUE IF NOT EXISTS 'shipping_label_created';
ALTER TYPE "MessageLogStatus" ADD VALUE IF NOT EXISTS 'dead';

CREATE TYPE "WhatsAppThreadStatus" AS ENUM ('open', 'closed', 'snoozed');
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('in', 'out');

-- ── Customer opt-out ─────────────────────────────────────────────────────
ALTER TABLE "Customer"
  ADD COLUMN "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "whatsappOptOutAt" TIMESTAMP(3);

-- ── MessageLog extensions ────────────────────────────────────────────────
ALTER TABLE "MessageLog"
  ADD COLUMN "ruleId" TEXT,
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- ── AutomationRule ───────────────────────────────────────────────────────
CREATE TABLE "AutomationRule" (
  "id"             TEXT NOT NULL,
  "trigger"        "AutomationTrigger" NOT NULL,
  "name"           TEXT NOT NULL,
  "priority"       INTEGER NOT NULL DEFAULT 0,
  "enabled"        BOOLEAN NOT NULL DEFAULT true,
  "overlap"        TEXT NOT NULL DEFAULT 'first',
  "conditions"     JSONB NOT NULL DEFAULT '{}',
  "templateId"     TEXT NOT NULL,
  "sendFromSystem" BOOLEAN NOT NULL DEFAULT false,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRule_trigger_enabled_priority_idx"
  ON "AutomationRule" ("trigger", "enabled", "priority");

ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationRule"
  ADD CONSTRAINT "AutomationRule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageLog"
  ADD CONSTRAINT "MessageLog_ruleId_fkey"
  FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── WhatsAppThread ───────────────────────────────────────────────────────
CREATE TABLE "WhatsAppThread" (
  "id"              TEXT NOT NULL,
  "customerId"      TEXT,
  "assignedAgentId" TEXT,
  "customerPhone"   TEXT NOT NULL,
  "lastMessageAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unreadCount"     INTEGER NOT NULL DEFAULT 0,
  "status"          "WhatsAppThreadStatus" NOT NULL DEFAULT 'open',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppThread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppThread_customerPhone_assignedAgentId_key"
  ON "WhatsAppThread" ("customerPhone", "assignedAgentId");
CREATE INDEX "WhatsAppThread_assignedAgentId_status_lastMessageAt_idx"
  ON "WhatsAppThread" ("assignedAgentId", "status", "lastMessageAt");
CREATE INDEX "WhatsAppThread_customerId_idx" ON "WhatsAppThread" ("customerId");

ALTER TABLE "WhatsAppThread"
  ADD CONSTRAINT "WhatsAppThread_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppThread"
  ADD CONSTRAINT "WhatsAppThread_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── WhatsAppMessage ──────────────────────────────────────────────────────
CREATE TABLE "WhatsAppMessage" (
  "id"           TEXT NOT NULL,
  "threadId"     TEXT NOT NULL,
  "direction"    "WhatsAppMessageDirection" NOT NULL,
  "body"         TEXT NOT NULL,
  "mediaUrl"     TEXT,
  "fromPhone"    TEXT NOT NULL,
  "toPhone"      TEXT NOT NULL,
  "providerId"   TEXT,
  "messageLogId" TEXT,
  "authorUserId" TEXT,
  "readAt"       TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppMessage_threadId_createdAt_idx"
  ON "WhatsAppMessage" ("threadId", "createdAt");
CREATE INDEX "WhatsAppMessage_providerId_idx" ON "WhatsAppMessage" ("providerId");

ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "WhatsAppThread"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_messageLogId_fkey"
  FOREIGN KEY ("messageLogId") REFERENCES "MessageLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_authorUserId_fkey"
  FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
