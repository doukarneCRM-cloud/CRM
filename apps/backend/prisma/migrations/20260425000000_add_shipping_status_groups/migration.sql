-- CreateTable
CREATE TABLE "ShippingStatusGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "statusKeys" TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ShippingStatusGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShippingStatusGroup_name_key" ON "ShippingStatusGroup"("name");

-- CreateIndex
CREATE INDEX "ShippingStatusGroup_position_idx" ON "ShippingStatusGroup"("position");

-- AddForeignKey
ALTER TABLE "ShippingStatusGroup" ADD CONSTRAINT "ShippingStatusGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
