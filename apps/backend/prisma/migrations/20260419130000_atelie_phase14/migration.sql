-- CreateEnum
CREATE TYPE "MaterialCategory" AS ENUM ('fabric', 'accessory', 'needle', 'thread', 'other');

-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('meter', 'piece', 'kilogram', 'spool', 'box');

-- CreateEnum
CREATE TYPE "MaterialMovementType" AS ENUM ('in', 'out', 'adjustment');

-- CreateEnum
CREATE TYPE "AtelieTaskStatus" AS ENUM ('backlog', 'processing', 'done', 'forgotten', 'incomplete');

-- CreateEnum
CREATE TYPE "AtelieTaskVisibility" AS ENUM ('private', 'shared');

-- DropIndex
DROP INDEX "Order_trackingProvider_lastTrackedAt_idx";

-- DropIndex
DROP INDEX "WeeklyAttendance_employeeId_idx";

-- AlterTable
ALTER TABLE "AtelieEmployee" ADD COLUMN     "workingDays" INTEGER NOT NULL DEFAULT 6;

-- AlterTable
ALTER TABLE "SalaryPayment" DROP COLUMN "month",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "weekStart" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "WeeklyAttendance" ADD COLUMN     "daysMask" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "daysWorked" SET DEFAULT 0;

-- CreateTable
CREATE TABLE "AtelieMaterial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MaterialCategory" NOT NULL,
    "unit" "MaterialUnit" NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lowStockThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitCost" DOUBLE PRECISION,
    "supplier" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtelieMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialMovement" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "type" "MaterialMovementType" NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelieTask" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AtelieTaskStatus" NOT NULL DEFAULT 'backlog',
    "visibility" "AtelieTaskVisibility" NOT NULL DEFAULT 'private',
    "color" TEXT,
    "position" DOUBLE PRECISION NOT NULL,
    "incompleteReason" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtelieTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelieTaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtelieTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelieTaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtelieTaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelieTaskHide" (
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtelieTaskHide_pkey" PRIMARY KEY ("userId","taskId")
);

-- CreateIndex
CREATE INDEX "AtelieMaterial_category_idx" ON "AtelieMaterial"("category");

-- CreateIndex
CREATE INDEX "MaterialMovement_materialId_createdAt_idx" ON "MaterialMovement"("materialId", "createdAt");

-- CreateIndex
CREATE INDEX "AtelieTask_ownerId_status_position_idx" ON "AtelieTask"("ownerId", "status", "position");

-- CreateIndex
CREATE INDEX "AtelieTask_visibility_status_position_idx" ON "AtelieTask"("visibility", "status", "position");

-- CreateIndex
CREATE INDEX "AtelieTaskComment_taskId_createdAt_idx" ON "AtelieTaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "AtelieTaskAttachment_taskId_idx" ON "AtelieTaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "AtelieTaskHide_taskId_idx" ON "AtelieTaskHide"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_employeeId_weekStart_key" ON "SalaryPayment"("employeeId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyAttendance_weekStart_idx" ON "WeeklyAttendance"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAttendance_employeeId_weekStart_key" ON "WeeklyAttendance"("employeeId", "weekStart");

-- AddForeignKey
ALTER TABLE "MaterialMovement" ADD CONSTRAINT "MaterialMovement_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "AtelieMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieTask" ADD CONSTRAINT "AtelieTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieTaskComment" ADD CONSTRAINT "AtelieTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AtelieTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieTaskComment" ADD CONSTRAINT "AtelieTaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieTaskAttachment" ADD CONSTRAINT "AtelieTaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AtelieTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieTaskHide" ADD CONSTRAINT "AtelieTaskHide_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AtelieTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

