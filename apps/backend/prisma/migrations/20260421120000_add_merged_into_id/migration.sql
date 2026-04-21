-- AlterTable
ALTER TABLE "Order" ADD COLUMN "mergedIntoId" TEXT;

-- CreateIndex
CREATE INDEX "Order_mergedIntoId_idx" ON "Order"("mergedIntoId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
