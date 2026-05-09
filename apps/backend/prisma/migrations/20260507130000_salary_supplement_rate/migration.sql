-- Per-row MAD rate paid per supplement hour. The pay total is
-- amount + commission + supplementHours × supplementHourRate, so the
-- printed envelope label can show the breakdown clearly.

ALTER TABLE "SalaryPayment"
  ADD COLUMN "supplementHourRate" DECIMAL(12, 2) NOT NULL DEFAULT 0;
