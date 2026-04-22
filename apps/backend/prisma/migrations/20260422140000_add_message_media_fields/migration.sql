-- Adds media type + mime columns so we can persist audio / sticker /
-- video / document attachments alongside the existing mediaUrl column.

ALTER TABLE "WhatsAppMessage"
  ADD COLUMN "mediaType" TEXT,
  ADD COLUMN "mediaMime" TEXT;
