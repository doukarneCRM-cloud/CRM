-- Payment method recorded at pay-time so the commission history can show
-- HOW the agent was paid (cash / bank transfer / card / other) alongside
-- the amount and date.

ALTER TABLE "CommissionPayment"
  ADD COLUMN "method" TEXT;
