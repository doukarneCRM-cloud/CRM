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
  // Two synthetic buckets carry meaning the column itself can't express:
  //   - "Not Shipped" → confirmed orders that haven't been pushed to
  //                     Coliix yet (labelSent=false, confirmed). Operator
  //                     wants to see these in the shipping pipeline so a
  //                     "ready-to-ship" pile is visible at a glance.
  //   - "Label Created" → pushed to Coliix but no tracking event back yet
  //                       (labelSent=true, coliixRawState=null).
  // Anything else is matched as the literal coliixRawState wording.
  const coliixRawStates = toArray(params.coliixRawStates);
  if (coliixRawStates.length > 0) {
    const NOT_SHIPPED = 'Not Shipped';
    const LABEL_CREATED = 'Label Created';
    const includeNotShipped = coliixRawStates.includes(NOT_SHIPPED);
    const includeLabelCreated = coliixRawStates.includes(LABEL_CREATED);
    const realStates = coliixRawStates.filter(
      (s) => s !== NOT_SHIPPED && s !== LABEL_CREATED,
    );

    const orClauses: Prisma.OrderWhereInput[] = [];
    if (realStates.length > 0) {
      orClauses.push({ coliixRawState: { in: realStates } });
    }
    if (includeNotShipped) {
      orClauses.push({ labelSent: false, confirmationStatus: 'confirmed' });
    }
    if (includeLabelCreated) {
      orClauses.push({ labelSent: true, coliixRawState: null });
    }

    if (orClauses.length === 1) {
      Object.assign(where, orClauses[0]);
    } else if (orClauses.length > 1) {
      // Wrap in AND so a later `where.OR` (search clause) doesn't clobber
      // this one — Prisma supports nested logical ops via `AND`.
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { OR: orClauses },
      ];
    }
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
