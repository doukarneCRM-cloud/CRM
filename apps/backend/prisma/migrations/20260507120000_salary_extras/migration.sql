-- Pay-envelope extras on SalaryPayment.
-- `commission` is added on top of the computed weekly amount; `supplementHours`
-- records hours worked beyond the regular schedule. Both are edited via the
-- (+) button on the salary row and printed onto the 100×100mm envelope label.

ALTER TABLE "SalaryPayment"
  ADD COLUMN "commission" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "supplementHours" DOUBLE PRECISION NOT NULL DEFAULT 0;
