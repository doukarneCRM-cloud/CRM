ALTER TABLE "Product" ADD COLUMN "assignedAgentId" TEXT;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_assignedAgentId_fkey"
  FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_assignedAgentId_idx" ON "Product"("assignedAgentId");
