/*
  Warnings:

  - You are about to drop the `ShippingStatusGroup` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ShippingStatusGroup" DROP CONSTRAINT "ShippingStatusGroup_createdById_fkey";

-- DropTable
DROP TABLE "ShippingStatusGroup";
