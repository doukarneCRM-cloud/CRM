-- CreateEnum
CREATE TYPE "ConfirmationStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'unreachable', 'callback', 'fake', 'out_of_stock', 'reported');

-- CreateEnum
CREATE TYPE "ShippingStatus" AS ENUM ('not_shipped', 'picked_up', 'in_transit', 'out_for_delivery', 'failed_delivery', 'reported', 'delivered', 'returned');

-- CreateEnum
CREATE TYPE "ReturnOutcome" AS ENUM ('good', 'damaged');

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
CREATE TYPE "ProductionRunStatus" AS ENUM ('draft', 'active', 'finished', 'cancelled');

-- CreateEnum
CREATE TYPE "ConsumptionSourceType" AS ENUM ('fabric_roll', 'accessory');

-- CreateEnum
CREATE TYPE "ProductionStage" AS ENUM ('cut', 'sew', 'finish', 'qc', 'packed');

-- CreateEnum
CREATE TYPE "ProductionLogType" AS ENUM ('system', 'stage', 'consumption', 'labor', 'note', 'status');

-- CreateEnum
CREATE TYPE "LaborAllocationMode" AS ENUM ('by_pieces', 'by_complexity', 'manual');

-- CreateEnum
CREATE TYPE "SampleStatus" AS ENUM ('draft', 'tested', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "AtelieTaskStatus" AS ENUM ('backlog', 'processing', 'done', 'forgotten', 'incomplete');

-- CreateEnum
CREATE TYPE "AtelieTaskVisibility" AS ENUM ('private', 'shared');

-- CreateEnum
CREATE TYPE "AutomationTrigger" AS ENUM ('confirmation_confirmed', 'confirmation_cancelled', 'confirmation_unreachable', 'confirmation_callback', 'confirmation_reported', 'shipping_picked_up', 'shipping_in_transit', 'shipping_out_for_delivery', 'shipping_failed_delivery', 'shipping_reported', 'shipping_delivered', 'shipping_returned', 'commission_paid');

-- CreateEnum
CREATE TYPE "WhatsAppSessionStatus" AS ENUM ('disconnected', 'connecting', 'connected', 'error');

-- CreateEnum
CREATE TYPE "MessageLogStatus" AS ENUM ('queued', 'sending', 'sent', 'delivered', 'failed', 'dead');

-- CreateEnum
CREATE TYPE "WhatsAppThreadStatus" AS ENUM ('open', 'closed', 'snoozed');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "BroadcastKind" AS ENUM ('POPUP', 'BAR');

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
    "whatsappOptOut" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOptOutAt" TIMESTAMP(3),
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
    "basePrice" DECIMAL(12,2) NOT NULL,
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
    "price" DECIMAL(12,2) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
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
    "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
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
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountType" "DiscountType",
    "discountAmount" DECIMAL(12,2),
    "total" DECIMAL(12,2) NOT NULL,
    "shippingPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "confirmationNote" TEXT,
    "shippingInstruction" TEXT,
    "cancellationReason" TEXT,
    "callbackAt" TIMESTAMP(3),
    "reportedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "unreachableAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "labelSentAt" TIMESTAMP(3),
    "unreachableCount" INTEGER NOT NULL DEFAULT 0,
    "labelSent" BOOLEAN NOT NULL DEFAULT false,
    "youcanOrderId" TEXT,
    "storeId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "mergedIntoId" TEXT,
    "commissionAmount" DECIMAL(12,2),
    "commissionPaid" BOOLEAN NOT NULL DEFAULT false,
    "commissionPaidAt" TIMESTAMP(3),
    "returnNote" TEXT,
    "returnOutcome" "ReturnOutcome",
    "returnVerifiedAt" TIMESTAMP(3),
    "returnVerifiedById" TEXT,
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
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,

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
    "price" DECIMAL(12,2) NOT NULL,
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
    "baseSalary" DECIMAL(12,2) NOT NULL DEFAULT 0,
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
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
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
    "unitCost" DECIMAL(12,2),
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
    "unitCostPerMeter" DECIMAL(12,2) NOT NULL,
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
    "description" TEXT,
    "status" "SampleStatus" NOT NULL DEFAULT 'draft',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "laborMadPerPiece" DECIMAL(12,2),
    "confirmationFee" DECIMAL(12,2),
    "deliveryFee" DECIMAL(12,2),
    "markupPercent" DECIMAL(5,2),
    "suggestedPrice" DECIMAL(12,2),
    "estimatedCostPerPiece" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTestPhoto" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTestPhoto_pkey" PRIMARY KEY ("id")
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
    "unitCostSnapshot" DECIMAL(12,2),

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
    "materialsCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costPerPiece" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "weekId" TEXT,
    "laborAllocation" "LaborAllocationMode" NOT NULL DEFAULT 'by_pieces',
    "laborManualShare" DECIMAL(5,2),
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
    "unitCost" DECIMAL(12,2) NOT NULL,
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

-- CreateTable
CREATE TABLE "ProductionRunStage" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stage" "ProductionStage" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "inputPieces" INTEGER NOT NULL DEFAULT 0,
    "outputPieces" INTEGER NOT NULL DEFAULT 0,
    "rejectedPieces" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionRunStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLog" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "ProductionLogType" NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "performedById" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionWeek" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "laborTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionWeek_pkey" PRIMARY KEY ("id")
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
    "amount" DECIMAL(12,2) NOT NULL,
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
    "amount" DECIMAL(12,2) NOT NULL,
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
    "value" DECIMAL(12,2) NOT NULL,
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

-- CreateTable
CREATE TABLE "MessageTemplate" (
    "id" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "overlap" TEXT NOT NULL DEFAULT 'first',
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "templateId" TEXT NOT NULL,
    "sendFromSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "instanceName" TEXT NOT NULL,
    "status" "WhatsAppSessionStatus" NOT NULL DEFAULT 'disconnected',
    "phoneNumber" TEXT,
    "lastHeartbeat" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL,
    "trigger" "AutomationTrigger" NOT NULL,
    "ruleId" TEXT,
    "orderId" TEXT,
    "agentId" TEXT,
    "recipientPhone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageLogStatus" NOT NULL DEFAULT 'queued',
    "providerId" TEXT,
    "error" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "MessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppThread" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "assignedAgentId" TEXT,
    "customerPhone" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WhatsAppThreadStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "mediaType" TEXT,
    "mediaMime" TEXT,
    "fromPhone" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "providerId" TEXT,
    "messageLogId" TEXT,
    "authorUserId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "kind" "BroadcastKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastRecipient" (
    "id" TEXT NOT NULL,
    "broadcastId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "clickCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BroadcastRecipient_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "Order_mergedIntoId_idx" ON "Order"("mergedIntoId");

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
CREATE INDEX "Order_callbackAt_idx" ON "Order"("callbackAt");

-- CreateIndex
CREATE INDEX "Order_reportedAt_idx" ON "Order"("reportedAt");

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
CREATE UNIQUE INDEX "FabricType_name_key" ON "FabricType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FabricRoll_expenseId_key" ON "FabricRoll"("expenseId");

-- CreateIndex
CREATE INDEX "FabricRoll_fabricTypeId_color_idx" ON "FabricRoll"("fabricTypeId", "color");

-- CreateIndex
CREATE INDEX "FabricRoll_isDepleted_idx" ON "FabricRoll"("isDepleted");

-- CreateIndex
CREATE INDEX "ProductTest_status_createdAt_idx" ON "ProductTest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductTestPhoto_testId_position_idx" ON "ProductTestPhoto"("testId", "position");

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

-- CreateIndex
CREATE INDEX "ProductionRunStage_runId_stage_idx" ON "ProductionRunStage"("runId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionRunStage_runId_stage_key" ON "ProductionRunStage"("runId", "stage");

-- CreateIndex
CREATE INDEX "ProductionLog_runId_createdAt_idx" ON "ProductionLog"("runId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionWeek_weekStart_key" ON "ProductionWeek"("weekStart");

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

-- CreateIndex
CREATE UNIQUE INDEX "MessageTemplate_trigger_key" ON "MessageTemplate"("trigger");

-- CreateIndex
CREATE INDEX "AutomationRule_trigger_enabled_priority_idx" ON "AutomationRule"("trigger", "enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_userId_key" ON "WhatsAppSession"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppSession_instanceName_key" ON "WhatsAppSession"("instanceName");

-- CreateIndex
CREATE UNIQUE INDEX "MessageLog_dedupeKey_key" ON "MessageLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "MessageLog_status_createdAt_idx" ON "MessageLog"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MessageLog_orderId_idx" ON "MessageLog"("orderId");

-- CreateIndex
CREATE INDEX "MessageLog_trigger_createdAt_idx" ON "MessageLog"("trigger", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppThread_assignedAgentId_status_lastMessageAt_idx" ON "WhatsAppThread"("assignedAgentId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "WhatsAppThread_customerId_idx" ON "WhatsAppThread"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppThread_customerPhone_assignedAgentId_key" ON "WhatsAppThread"("customerPhone", "assignedAgentId");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_threadId_createdAt_idx" ON "WhatsAppMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppMessage_providerId_idx" ON "WhatsAppMessage"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingStatusGroup_name_key" ON "ShippingStatusGroup"("name");

-- CreateIndex
CREATE INDEX "ShippingStatusGroup_position_idx" ON "ShippingStatusGroup"("position");

-- CreateIndex
CREATE INDEX "Broadcast_kind_isActive_createdAt_idx" ON "Broadcast"("kind", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "BroadcastRecipient_userId_ackedAt_idx" ON "BroadcastRecipient"("userId", "ackedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastRecipient_broadcastId_userId_key" ON "BroadcastRecipient"("broadcastId", "userId");

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
ALTER TABLE "Order" ADD CONSTRAINT "Order_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "FabricRoll" ADD CONSTRAINT "FabricRoll_fabricTypeId_fkey" FOREIGN KEY ("fabricTypeId") REFERENCES "FabricType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FabricRoll" ADD CONSTRAINT "FabricRoll_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTest" ADD CONSTRAINT "ProductTest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTest" ADD CONSTRAINT "ProductTest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTestPhoto" ADD CONSTRAINT "ProductTestPhoto_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ProductTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "ProductionWeek"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "ProductionRunStage" ADD CONSTRAINT "ProductionRunStage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLog" ADD CONSTRAINT "ProductionLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppSession" ADD CONSTRAINT "WhatsAppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageLog" ADD CONSTRAINT "MessageLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppThread" ADD CONSTRAINT "WhatsAppThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppThread" ADD CONSTRAINT "WhatsAppThread_assignedAgentId_fkey" FOREIGN KEY ("assignedAgentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "WhatsAppThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_messageLogId_fkey" FOREIGN KEY ("messageLogId") REFERENCES "MessageLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessage" ADD CONSTRAINT "WhatsAppMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShippingStatusGroup" ADD CONSTRAINT "ShippingStatusGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_broadcastId_fkey" FOREIGN KEY ("broadcastId") REFERENCES "Broadcast"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BroadcastRecipient" ADD CONSTRAINT "BroadcastRecipient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
