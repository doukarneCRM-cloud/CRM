-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- Seed the order-reference counter for the current year with the existing
-- order count so new references continue from where the old count-based
-- generator left off, without re-using any historical reference number.
INSERT INTO "Counter" ("key", "value")
SELECT 'order_ref_' || to_char(now(), 'YY'), (SELECT COUNT(*)::int FROM "Order")
ON CONFLICT ("key") DO NOTHING;
