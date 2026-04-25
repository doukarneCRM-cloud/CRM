-- Default to FALSE: existing stores stop auto-syncing on this deploy.
-- Admin must explicitly turn on the toggle in the store config to resume
-- background polling / webhook auto-import.
ALTER TABLE "Store" ADD COLUMN "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
