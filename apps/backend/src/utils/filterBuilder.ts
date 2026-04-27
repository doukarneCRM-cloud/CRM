import type { ConfirmationStatus, ShippingStatus, OrderSource, Prisma } from '@prisma/client';

export interface OrderFilterParams {
  agentIds?: string | string[];
  productIds?: string | string[];
  cities?: string | string[];
  confirmationStatuses?: string | string[];
  shippingStatuses?: string | string[];
  // New: filter by Coliix's literal status wording (the user-facing label
  // that drives the shipping pipeline + admin chip dropdown). Distinct
  // from shippingStatuses, which is our internal enum and stays for
  // backward-compat with anywhere that still binds to the enum.
  coliixRawStates?: string | string[];
  sources?: string | string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  isArchived?: string;
}

function toArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  return Array.isArray(val) ? val : val.split(',').filter(Boolean);
}

/**
 * Converts URL query params → Prisma `where` clause for Order queries.
 * Used by every KPI, dashboard, and order list query.
 */
export function buildOrderWhereClause(
  params: OrderFilterParams,
): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};

  // Archive filter (default: show only non-archived)
  if (params.isArchived === 'true') {
    where.isArchived = true;
  } else if (params.isArchived === 'all') {
    // no filter — show everything
  } else {
    where.isArchived = false;
  }

  // Agent filter
  const agentIds = toArray(params.agentIds);
  if (agentIds.length > 0) {
    where.agentId = { in: agentIds };
  }

  // City filter (on customer)
  const cities = toArray(params.cities);
  if (cities.length > 0) {
    where.customer = { city: { in: cities } };
  }

  // Confirmation status filter
  const confirmationStatuses = toArray(params.confirmationStatuses) as ConfirmationStatus[];
  if (confirmationStatuses.length > 0) {
    where.confirmationStatus = { in: confirmationStatuses };
  }

  // Shipping status filter (internal enum)
  const shippingStatuses = toArray(params.shippingStatuses) as ShippingStatus[];
  if (shippingStatuses.length > 0) {
    where.shippingStatus = { in: shippingStatuses };
  }

  // Coliix literal-state filter — drives the user-facing chip dropdown.
  // Compared as plain strings since coliixRawState is a free-form column.
  const coliixRawStates = toArray(params.coliixRawStates);
  if (coliixRawStates.length > 0) {
    where.coliixRawState = { in: coliixRawStates };
  }

  // Source filter
  const sources = toArray(params.sources) as OrderSource[];
  if (sources.length > 0) {
    where.source = { in: sources };
  }

  // Date range filter
  if (params.dateFrom || params.dateTo) {
    where.createdAt = {};
    if (params.dateFrom) {
      (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.dateFrom);
    }
    if (params.dateTo) {
      const to = new Date(params.dateTo);
      to.setHours(23, 59, 59, 999);
      (where.createdAt as Prisma.DateTimeFilter).lte = to;
    }
  }

  // Product filter (via orderItems → variant → product)
  const productIds = toArray(params.productIds);
  if (productIds.length > 0) {
    where.items = {
      some: {
        variant: { productId: { in: productIds } },
      },
    };
  }

  if (params.search) {
    const q = params.search.trim();
    where.OR = [
      { reference: { contains: q, mode: 'insensitive' } },
      { coliixTrackingId: { contains: q, mode: 'insensitive' } },
      { customer: { fullName: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q, mode: 'insensitive' } } },
      { customer: { phoneDisplay: { contains: q, mode: 'insensitive' } } },
      { customer: { city: { contains: q, mode: 'insensitive' } } },
    ];
  }

  return where;
}
