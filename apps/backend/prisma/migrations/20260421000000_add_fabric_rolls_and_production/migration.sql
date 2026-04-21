-- CreateEnum
CREATE TYPE "ProductionRunStatus" AS ENUM ('draft', 'active', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "ConsumptionSourceType" AS ENUM ('fabric_roll', 'accessory');

-- CreateTable
CREATE TABLE "FabricType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FabricType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FabricRoll" (
    "id" TEXT NOT NULL,
    "fabricTypeId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "widthCm" DOUBLE PRECISION,
    "initialLength" DOUBLE PRECISION NOT NULL,
    "remainingLength" DOUBLE PRECISION NOT NULL,
    "unitCostPerMeter" DOUBLE PRECISION NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "supplier" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "isDepleted" BOOLEAN NOT NULL DEFAULT false,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FabricRoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT,
    "videoUrl" TEXT,
    "estimatedCostPerPiece" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTestFabric" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "fabricTypeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ProductTestFabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTestSize" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "tracingMeters" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductTestSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTestAccessory" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityPerPiece" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProductTestAccessory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRun" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "testId" TEXT,
    "productId" TEXT,
    "status" "ProductionRunStatus" NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "expectedPieces" INTEGER NOT NULL DEFAULT 0,
    "actualPieces" INTEGER NOT NULL DEFAULT 0,
    "materialsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costPerPiece" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRunFabric" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "fabricTypeId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "ProductionRunFabric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRunSize" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "tracingMeters" DOUBLE PRECISION NOT NULL,
    "expectedPieces" INTEGER NOT NULL,
    "actualPieces" INTEGER NOT NULL DEFAULT 0,
    "variantId" TEXT,

    CONSTRAINT "ProductionRunSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionConsumption" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceType" "ConsumptionSourceType" NOT NULL,
    "fabricRollId" TEXT,
    "materialId" TEXT,
    "movementId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProductionConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionRunWorker" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" TEXT,

    CONSTRAINT "ProductionRunWorker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FabricType_name_key" ON "FabricType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FabricRoll_expenseId_key" ON "FabricRoll"("expenseId");

-- CreateIndex
CREATE INDEX "FabricRoll_fabricTypeId_color_idx" ON "FabricRoll"("fabricTypeId", "color");

-- CreateIndex
CREATE INDEX "FabricRoll_isDepleted_idx" ON "FabricRoll"("isDepleted");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTestFabric_testId_fabricTypeId_role_key" ON "ProductTestFabric"("testId", "fabricTypeId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTestSize_testId_size_key" ON "ProductTestSize"("testId", "size");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTestAccessory_testId_materialId_key" ON "ProductTestAccessory"("testId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRun_reference_key" ON "ProductionRun"("reference");

-- CreateIndex
CREATE INDEX "ProductionRun_status_startDate_idx" ON "ProductionRun"("status", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRunFabric_runId_fabricTypeId_role_key" ON "ProductionRunFabric"("runId", "fabricTypeId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRunSize_runId_size_key" ON "ProductionRunSize"("runId", "size");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionConsumption_movementId_key" ON "ProductionConsumption"("movementId");

-- CreateIndex
CREATE INDEX "ProductionConsumption_runId_idx" ON "ProductionConsumption"("runId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRunWorker_runId_employeeId_key" ON "ProductionRunWorker"("runId", "employeeId");

-- AddForeignKey
ALTER TABLE "FabricRoll" ADD CONSTRAINT "FabricRoll_fabricTypeId_fkey" FOREIGN KEY ("fabricTypeId") REFERENCES "FabricType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricRoll" ADD CONSTRAINT "FabricRoll_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTest" ADD CONSTRAINT "ProductTest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestFabric" ADD CONSTRAINT "ProductTestFabric_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProductTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestFabric" ADD CONSTRAINT "ProductTestFabric_fabricTypeId_fkey" FOREIGN KEY ("fabricTypeId") REFERENCES "FabricType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestSize" ADD CONSTRAINT "ProductTestSize_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProductTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestAccessory" ADD CONSTRAINT "ProductTestAccessory_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProductTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestAccessory" ADD CONSTRAINT "ProductTestAccessory_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "AtelieMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProductTest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunFabric" ADD CONSTRAINT "ProductionRunFabric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunFabric" ADD CONSTRAINT "ProductionRunFabric_fabricTypeId_fkey" FOREIGN KEY ("fabricTypeId") REFERENCES "FabricType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunSize" ADD CONSTRAINT "ProductionRunSize_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunSize" ADD CONSTRAINT "ProductionRunSize_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_fabricRollId_fkey" FOREIGN KEY ("fabricRollId") REFERENCES "FabricRoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "AtelieMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsumption" ADD CONSTRAINT "ProductionConsumption_movementId_fkey" FOREIGN KEY ("movementId") REFERENCES "MaterialMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunWorker" ADD CONSTRAINT "ProductionRunWorker_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionRunWorker" ADD CONSTRAINT "ProductionRunWorker_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AtelieEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

