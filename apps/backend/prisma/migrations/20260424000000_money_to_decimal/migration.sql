-- Migrate all money fields from double precision (Float) to numeric(12,2).
-- Storing money as IEEE-754 double causes silent 10^-10 drift on every
-- arithmetic operation; numeric is exact. The 12,2 range covers up to
-- 9,999,999,999.99 — comfortable for MAD at this scale. Casts are explicit
-- (::numeric) so existing values are preserved and rounded to 2 decimals.

-- Products / variants
ALTER TABLE "Product" ALTER COLUMN "basePrice" TYPE numeric(12, 2) USING "basePrice"::numeric;
ALTER TABLE "ProductVariant" ALTER COLUMN "price" TYPE numeric(12, 2) USING "price"::numeric;
ALTER TABLE "ProductVariant" ALTER COLUMN "costPrice" TYPE numeric(12, 2) USING "costPrice"::numeric;

-- Orders / items
ALTER TABLE "Order" ALTER COLUMN "subtotal" TYPE numeric(12, 2) USING "subtotal"::numeric;
ALTER TABLE "Order" ALTER COLUMN "discountAmount" TYPE numeric(12, 2) USING "discountAmount"::numeric;
ALTER TABLE "Order" ALTER COLUMN "total" TYPE numeric(12, 2) USING "total"::numeric;
ALTER TABLE "Order" ALTER COLUMN "shippingPrice" TYPE numeric(12, 2) USING "shippingPrice"::numeric;
ALTER TABLE "Order" ALTER COLUMN "commissionAmount" TYPE numeric(12, 2) USING "commissionAmount"::numeric;
ALTER TABLE "OrderItem" ALTER COLUMN "unitPrice" TYPE numeric(12, 2) USING "unitPrice"::numeric;
ALTER TABLE "OrderItem" ALTER COLUMN "total" TYPE numeric(12, 2) USING "total"::numeric;

-- Shipping cities
ALTER TABLE "ShippingCity" ALTER COLUMN "price" TYPE numeric(12, 2) USING "price"::numeric;

-- Atelie — employees / salary
ALTER TABLE "AtelieEmployee" ALTER COLUMN "baseSalary" TYPE numeric(12, 2) USING "baseSalary"::numeric;
ALTER TABLE "SalaryPayment" ALTER COLUMN "amount" TYPE numeric(12, 2) USING "amount"::numeric;
ALTER TABLE "SalaryPayment" ALTER COLUMN "paidAmount" TYPE numeric(12, 2) USING "paidAmount"::numeric;

-- Atelie — materials / fabric / tests / production
ALTER TABLE "AtelieMaterial" ALTER COLUMN "unitCost" TYPE numeric(12, 2) USING "unitCost"::numeric;
ALTER TABLE "FabricRoll" ALTER COLUMN "unitCostPerMeter" TYPE numeric(12, 2) USING "unitCostPerMeter"::numeric;
ALTER TABLE "ProductTest" ALTER COLUMN "estimatedCostPerPiece" TYPE numeric(12, 2) USING "estimatedCostPerPiece"::numeric;
ALTER TABLE "ProductionRun" ALTER COLUMN "materialsCost" TYPE numeric(12, 2) USING "materialsCost"::numeric;
ALTER TABLE "ProductionRun" ALTER COLUMN "laborCost" TYPE numeric(12, 2) USING "laborCost"::numeric;
ALTER TABLE "ProductionRun" ALTER COLUMN "totalCost" TYPE numeric(12, 2) USING "totalCost"::numeric;
ALTER TABLE "ProductionRun" ALTER COLUMN "costPerPiece" TYPE numeric(12, 2) USING "costPerPiece"::numeric;
ALTER TABLE "ProductionConsumption" ALTER COLUMN "unitCost" TYPE numeric(12, 2) USING "unitCost"::numeric;

-- Expenses / commission ledger
ALTER TABLE "Expense" ALTER COLUMN "amount" TYPE numeric(12, 2) USING "amount"::numeric;
ALTER TABLE "CommissionPayment" ALTER COLUMN "amount" TYPE numeric(12, 2) USING "amount"::numeric;
ALTER TABLE "CommissionRule" ALTER COLUMN "value" TYPE numeric(12, 2) USING "value"::numeric;
