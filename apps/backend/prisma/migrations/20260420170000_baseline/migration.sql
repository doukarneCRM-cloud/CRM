-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('pending', 'awaiting', 'confirmed', 'cancelled', 'unreachable', 'callback', 'fake', 'out_of_stock', 'reported');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('not_shipped', 'label_created', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'attempted', 'returned', 'return_validated', 'return_refused', 'exchange', 'lost', 'destroyed');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('youcan', 'whatsapp', 'instagram', 'manual');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('fixed', 'percentage');

-- CreateEnum
CREATE TYPE "OrderLogType" AS ENUM ('confirmation', 'shipping', 'system');

-- CreateEnum
CREATE TYPE "CustomerTag" AS ENUM ('normal', 'vip', 'blacklisted');

-- CreateEnum
CREATE TYPE "ImportLogLevel" AS ENUM ('info', 'warning', 'error');

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

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "roleId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneDisplay" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "tag" "CustomerTag" NOT NULL DEFAULT 'normal',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "basePrice" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPlaceholder" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "storeId" TEXT,
    "youcanId" TEXT,
    "assignedAgentId" TEXT,
    "measurements" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "sku" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "youcanId" TEXT,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "webhookSecret" TEXT,
    "webhookId" TEXT,
    "fieldMapping" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiBaseUrl" TEXT NOT NULL,
    "apiKey" TEXT,
    "webhookSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "level" "ImportLogLevel" NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL DEFAULT 'manual',
    "customerId" TEXT NOT NULL,
    "agentId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "confirmationStatus" "ConfirmationStatus" NOT NULL DEFAULT 'pending',
    "shippingStatus" "ShippingStatus" NOT NULL DEFAULT 'not_shipped',
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountType" "DiscountType",
    "discountAmount" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "shippingPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmationNote" TEXT,
    "shippingInstruction" TEXT,
    "cancellationReason" TEXT,
    "callbackAt" TIMESTAMP(3),
    "coliixTrackingId" TEXT,
    "youcanOrderId" TEXT,
    "labelSent" BOOLEAN NOT NULL DEFAULT false,
    "labelSentAt" TIMESTAMP(3),
    "storeId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "commissionAmount" DOUBLE PRECISION,
    "commissionPaid" BOOLEAN NOT NULL DEFAULT false,
    "commissionPaidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "unreachableCount" INTEGER NOT NULL DEFAULT 0,
    "paidToCarrier" BOOLEAN NOT NULL DEFAULT false,
    "paidToCarrierAt" TIMESTAMP(3),
    "returnNote" TEXT,
    "returnVerifiedAt" TIMESTAMP(3),
    "returnVerifiedById" TEXT,
    "trackingProvider" TEXT,
    "lastTrackedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderLogType" NOT NULL DEFAULT 'system',
    "action" TEXT NOT NULL,
    "performedBy" TEXT NOT NULL,
    "userId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "cityMatch" TEXT,
    "agentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShippingCity" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "zone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShippingCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtelieEmployee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workingDays" INTEGER NOT NULL DEFAULT 6,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "AtelieEmployee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAttendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "daysMask" INTEGER NOT NULL DEFAULT 0,
    "halfDaysMask" INTEGER NOT NULL DEFAULT 0,
    "daysWorked" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPayment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "fileUrl" TEXT,
    "orderIds" TEXT[],
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "orderId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_city_idx" ON "Customer"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON "ProductVariant"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_youcanId_key" ON "ProductVariant"("youcanId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingProvider_name_key" ON "ShippingProvider"("name");

-- CreateIndex
CREATE INDEX "ImportLog_storeId_idx" ON "ImportLog"("storeId");

-- CreateIndex
CREATE INDEX "ImportLog_storeId_createdAt_idx" ON "ImportLog"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportLog_level_idx" ON "ImportLog"("level");

-- CreateIndex
CREATE UNIQUE INDEX "Order_reference_key" ON "Order"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Order_youcanOrderId_key" ON "Order"("youcanOrderId");

-- CreateIndex
CREATE INDEX "Order_confirmationStatus_idx" ON "Order"("confirmationStatus");

-- CreateIndex
CREATE INDEX "Order_shippingStatus_idx" ON "Order"("shippingStatus");

-- CreateIndex
CREATE INDEX "Order_agentId_idx" ON "Order"("agentId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- CreateIndex
CREATE INDEX "Order_isArchived_idx" ON "Order"("isArchived");

-- CreateIndex
CREATE INDEX "Order_confirmationStatus_createdAt_idx" ON "Order"("confirmationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shippingStatus_createdAt_idx" ON "Order"("shippingStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Order_agentId_confirmationStatus_idx" ON "Order"("agentId", "confirmationStatus");

-- CreateIndex
CREATE INDEX "Order_agentId_commissionPaid_idx" ON "Order"("agentId", "commissionPaid");

-- CreateIndex
CREATE INDEX "Order_agentId_deliveredAt_idx" ON "Order"("agentId", "deliveredAt");

-- CreateIndex
CREATE INDEX "Order_shippingStatus_paidToCarrier_idx" ON "Order"("shippingStatus", "paidToCarrier");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "OrderLog_orderId_idx" ON "OrderLog"("orderId");

-- CreateIndex
CREATE INDEX "OrderLog_orderId_type_idx" ON "OrderLog"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingCity_name_key" ON "ShippingCity"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AtelieEmployee_userId_key" ON "AtelieEmployee"("userId");

-- CreateIndex
CREATE INDEX "WeeklyAttendance_weekStart_idx" ON "WeeklyAttendance"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAttendance_employeeId_weekStart_key" ON "WeeklyAttendance"("employeeId", "weekStart");

-- CreateIndex
CREATE INDEX "SalaryPayment_employeeId_idx" ON "SalaryPayment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "SalaryPayment_employeeId_weekStart_key" ON "SalaryPayment"("employeeId", "weekStart");

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
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "CommissionPayment_agentId_idx" ON "CommissionPayment"("agentId");

-- CreateIndex
CREATE INDEX "CommissionPayment_paidAt_idx" ON "CommissionPayment"("paidAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportLog" ADD CONSTRAINT "ImportLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_returnVerifiedById_fkey" FOREIGN KEY ("returnVerifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLog" ADD CONSTRAINT "OrderLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLog" ADD CONSTRAINT "OrderLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtelieEmployee" ADD CONSTRAINT "AtelieEmployee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAttendance" ADD CONSTRAINT "WeeklyAttendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AtelieEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyAttendance" ADD CONSTRAINT "WeeklyAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "AtelieEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionPayment" ADD CONSTRAINT "CommissionPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

