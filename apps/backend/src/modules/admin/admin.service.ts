import { prisma } from '../../shared/prisma';

// ─── Reset-CRM confirmation code ─────────────────────────────────────────────
// The code is checked server-side as well as client-side — a compromised
// frontend (or a direct curl to the endpoint) still needs this string. Kept
// as a plain constant because the primary gate is the `settings:reset_crm`
// RBAC permission; the code is just a "are you sure?" typing exercise.
const RESET_CODE = 'Newlifebb123';

export type ResetCRMSummary = Record<string, number>;

// Destructive — empties every business-data table while preserving the auth
// core (User, Role, Permission, RolePermission, RefreshToken, Setting,
// ShippingProvider). Runs inside a single transaction so a partial failure
// rolls the whole thing back, leaving the DB in its original state.
//
// Order matters for tables that don't have onDelete: Cascade in the Prisma
// schema — children must be deleted before their parents. Tables that DO
// cascade (OrderItem, OrderLog, ImportLog, AtelieTaskComment, …) are still
// listed explicitly so the returned summary reports an accurate per-table
// count for audit purposes.
export async function resetCRM(code: string): Promise<ResetCRMSummary> {
  if (code !== RESET_CODE) {
    const err = new Error('Invalid confirmation code') as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'INVALID_CONFIRMATION_CODE';
    throw err;
  }

  const summary: ResetCRMSummary = {};

  await prisma.$transaction(
    async (tx) => {
      // ─── WhatsApp / automation / messaging ─────────────────────────────
      summary.whatsAppMessage = (await tx.whatsAppMessage.deleteMany({})).count;
      summary.whatsAppThread = (await tx.whatsAppThread.deleteMany({})).count;
      summary.whatsAppSession = (await tx.whatsAppSession.deleteMany({})).count;
      summary.messageLog = (await tx.messageLog.deleteMany({})).count;
      summary.automationRule = (await tx.automationRule.deleteMany({})).count;
      summary.messageTemplate = (await tx.messageTemplate.deleteMany({})).count;

      // ─── Notifications (per-user bell feed) ────────────────────────────
      summary.notification = (await tx.notification.deleteMany({})).count;

      // ─── Orders + descendants (OrderItem & OrderLog cascade, but we
      //     delete explicitly for the count). Delete children first. ─────
      summary.orderLog = (await tx.orderLog.deleteMany({})).count;
      summary.orderItem = (await tx.orderItem.deleteMany({})).count;
      summary.order = (await tx.order.deleteMany({})).count;

      // ─── Commerce (variants cascade from product on some schemas; we
      //     do them manually to be schema-agnostic) ────────────────────
      summary.productVariant = (await tx.productVariant.deleteMany({})).count;
      summary.product = (await tx.product.deleteMany({})).count;

      // ─── Customers ─────────────────────────────────────────────────────
      summary.customer = (await tx.customer.deleteMany({})).count;

      // ─── Integrations (Store → ImportLog cascade) ──────────────────────
      summary.importLog = (await tx.importLog.deleteMany({})).count;
      summary.store = (await tx.store.deleteMany({})).count;

      // ─── Operational config tied to business data ──────────────────────
      summary.assignmentRule = (await tx.assignmentRule.deleteMany({})).count;
      summary.shippingCity = (await tx.shippingCity.deleteMany({})).count;

      // ─── Money ─────────────────────────────────────────────────────────
      summary.commissionPayment = (await tx.commissionPayment.deleteMany({})).count;
      summary.commissionRule = (await tx.commissionRule.deleteMany({})).count;
      summary.expense = (await tx.expense.deleteMany({})).count;

      // ─── Atelie Tasks (child tables cascade — explicit for counts) ─────
      summary.atelieTaskHide = (await tx.atelieTaskHide.deleteMany({})).count;
      summary.atelieTaskAttachment = (await tx.atelieTaskAttachment.deleteMany({})).count;
      summary.atelieTaskComment = (await tx.atelieTaskComment.deleteMany({})).count;
      summary.atelieTask = (await tx.atelieTask.deleteMany({})).count;

      // ─── Atelie Production (children first) ────────────────────────────
      summary.productionConsumption = (await tx.productionConsumption.deleteMany({})).count;
      summary.productionRunWorker = (await tx.productionRunWorker.deleteMany({})).count;
      summary.productionRunSize = (await tx.productionRunSize.deleteMany({})).count;
      summary.productionRunFabric = (await tx.productionRunFabric.deleteMany({})).count;
      summary.productionRun = (await tx.productionRun.deleteMany({})).count;

      // ─── Atelie Tests ──────────────────────────────────────────────────
      summary.productTestAccessory = (await tx.productTestAccessory.deleteMany({})).count;
      summary.productTestSize = (await tx.productTestSize.deleteMany({})).count;
      summary.productTestFabric = (await tx.productTestFabric.deleteMany({})).count;
      summary.productTest = (await tx.productTest.deleteMany({})).count;

      // ─── Atelie Fabric & Material ──────────────────────────────────────
      summary.fabricRoll = (await tx.fabricRoll.deleteMany({})).count;
      summary.fabricType = (await tx.fabricType.deleteMany({})).count;
      summary.materialMovement = (await tx.materialMovement.deleteMany({})).count;
      summary.atelieMaterial = (await tx.atelieMaterial.deleteMany({})).count;

      // ─── Atelie HR (SalaryPayment + WeeklyAttendance reference
      //     AtelieEmployee — children first) ────────────────────────────
      summary.salaryPayment = (await tx.salaryPayment.deleteMany({})).count;
      summary.weeklyAttendance = (await tx.weeklyAttendance.deleteMany({})).count;
      summary.atelieEmployee = (await tx.atelieEmployee.deleteMany({})).count;

      // ─── Counters (order ref sequence etc.) — reset so refs start
      //     fresh after the wipe ─────────────────────────────────────────
      summary.counter = (await tx.counter.deleteMany({})).count;
    },
    // Large tables + cross-table cascades can take a while over slow
    // connections; 5-minute ceiling is safe because this endpoint is
    // gated behind a typed confirmation code and an admin permission.
    { maxWait: 10_000, timeout: 300_000 },
  );

  return summary;
}
