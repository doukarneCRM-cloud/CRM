-- Add deliveryPrice (MAD) to CarrierCity for V2. Optional — null = unknown,
-- UI prompts the operator to fill before pushing.

ALTER TABLE "CarrierCity"
  ADD COLUMN IF NOT EXISTS "deliveryPrice" DECIMAL(12, 2);
