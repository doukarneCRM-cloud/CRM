import crypto from 'node:crypto';
import { prisma } from '../../shared/prisma';

// ─── Reset-CRM confirmation code ─────────────────────────────────────────────
// Primary gate is the `settings:reset_crm` RBAC permission; this code is
// just the "are you sure?" typing exercise. Production requires
// CRM_RESET_CODE (validated at boot in shared/env.ts). Dev auto-generates
// a random per-process code printed to the console so no literal ever
// ships in the git repo.
function resolveResetCode(): string {
  const fromEnv = process.env.CRM_RESET_CODE;
  if (fromEnv && fromEnv.length >= 6) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRM_RESET_CODE must be set to a string of at least 6 chars in production');
  }
  const generated = crypto.randomBytes(6).toString('hex');
  // eslint-disable-next-line no-console
  console.warn(
    `[admin] CRM_RESET_CODE not set — generated dev code: ${generated} ` +
      `(set CRM_RESET_CODE in .env to pin it across restarts).`,
  );
  return generated;
}

const RESET_CODE = resolveResetCode();

export function getResetCode(): string {
  return RESET_CODE;
}

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
//
// Pass `keepUserId` to also wipe every other user account (keeping only
// that one). Most user-FK rows are already gone after the body of the
// transaction, but a few config tables — Broadcast, ShippingStatusGroup —
// reference users and aren't business data, so we delete those too in
// that mode.
export async function resetCRM(
  code: string,
  options: { keepUserId?: string } = {},
): Promise<ResetCRMSummary> {
  if (code !== RESET_CODE) {
    const err = new Error('Invalid confirmation code') as Error & {
      statusCode: number;
      code: string;
    };
    err.statusCode = 400;
    err.code = 'INVALID_CONFIRMATION_CODE';
    throw err;
  }

  const { keepUserId } = options;

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

      // ─── Wipe other users (opt-in) ─────────────────────────────────────
      // Most user-FK rows have already been deleted above. Two config
      // tables reference users and aren't business data, so we drop them
      // here before the users themselves: Broadcast (createdById is
      // required, no SetNull) and ShippingStatusGroup (has a createdBy
      // relation we'd rather not orphan). RefreshTokens cascade from
      // User automatically, so we don't have to clear them explicitly.
      if (keepUserId) {
        summary.broadcastRecipient = (await tx.broadcastRecipient.deleteMany({})).count;
        summary.broadcast = (await tx.broadcast.deleteMany({})).count;
        summary.shippingStatusGroup = (await tx.shippingStatusGroup.deleteMany({})).count;
        summary.user = (await tx.user.deleteMany({
          where: { id: { not: keepUserId } },
        })).count;
      }
    },
    // Large tables + cross-table cascades can take a while over slow
    // connections; 5-minute ceiling is safe because this endpoint is
    // gated behind a typed confirmation code and an admin permission.
    { maxWait: 10_000, timeout: 300_000 },
  );

  return summary;
}

// Targeted wipe — clears only the orders + customers subgraph and the
// rows that reference them (conversations, message logs, notifications,
// commission payments, import logs, the ref counter). Everything else
// stays: products, stores, agents/roles, automation rules, atelie data,
// commission rules, expenses, settings.
//
// Use case: admin linked YouCan, customers + orders auto-imported, admin
// wants to start fresh on the order side without re-doing every other
// piece of setup.
export async function resetOrdersAndCustomers(code: string): Promise<ResetCRMSummary> {
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
      // WhatsApp threads reference customers; messages cascade from the
      // thread, but we count them explicitly for an honest summary.
      summary.whatsAppMessage = (await tx.whatsAppMessage.deleteMany({})).count;
      summary.whatsAppThread = (await tx.whatsAppThread.deleteMany({})).count;
      summary.messageLog = (await tx.messageLog.deleteMany({})).count;

      // Notifications often link to an orderId — wipe before orders so we
      // don't dangle, and so the bell starts clean.
      summary.notification = (await tx.notification.deleteMany({})).count;

      // Commission payments reference orders. Commission *rules* (the
      // per-agent rates) are deliberately preserved.
      summary.commissionPayment = (await tx.commissionPayment.deleteMany({})).count;

      // Order subgraph (children before parent so explicit counts work)
      summary.orderLog = (await tx.orderLog.deleteMany({})).count;
      summary.orderItem = (await tx.orderItem.deleteMany({})).count;
      summary.order = (await tx.order.deleteMany({})).count;

      // Now safe to drop customers — order + thread refs are gone.
      summary.customer = (await tx.customer.deleteMany({})).count;

      // YouCan import history points at deleted orders/products by id —
      // clearing keeps the integration log honest. Stores stay, so the
      // OAuth token + webhook subscription remain in place.
      summary.importLog = (await tx.importLog.deleteMany({})).count;

      // Reset the order-ref sequence so the next order starts fresh.
      summary.counter = (await tx.counter.deleteMany({})).count;
    },
    { maxWait: 10_000, timeout: 300_000 },
  );

  return summary;
}
