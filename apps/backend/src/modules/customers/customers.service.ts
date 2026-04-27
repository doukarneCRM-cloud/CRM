import type { Prisma } from '@prisma/client';
import { prisma } from '../../shared/prisma';
import { parsePagination, paginatedResponse } from '../../utils/pagination';
import { normalizePhone } from '../../utils/phoneNormalize';
import type { CreateCustomerInput, UpdateCustomerInput, CustomerQueryInput, HistoryQueryInput } from './customers.schema';

// ─── List ─────────────────────────────────────────────────────────────────────

export async function getCustomers(query: CustomerQueryInput) {
  const { page, pageSize, skip, take } = parsePagination(query as Record<string, unknown>);

  const where: Prisma.CustomerWhereInput = {};

  if (query.search) {
    const q = query.search.trim();
    where.OR = [
      { fullName: { contains: q, mode: 'insensitive' } },
      { phoneDisplay: { contains: q } },
      { phone: { contains: q } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (query.city) {
    where.city = { contains: query.city, mode: 'insensitive' };
  }
  if (query.tag) {
    where.tag = query.tag;
  }

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    query.sortBy === 'totalOrders'
      ? { orders: { _count: 'desc' } }
      : { createdAt: 'desc' };

  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip,
      take,
      orderBy,
      include: {
        _count: { select: { orders: true } },
        // Most recent order per customer — used to expose lastOrderAt to the UI
        orders: {
          select: { createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    }),
    prisma.customer.count({ where }),
  ]);

  // Flatten the lastOrder relation into a plain field so clients don't need to
  // dig into the orders array.
  const data = rows.map(({ orders, _count, ...rest }) => ({
    ...rest,
    totalOrders: _count.orders,
    lastOrderAt: orders[0]?.createdAt ?? null,
  }));

  return paginatedResponse(data, total, page, pageSize);
}

// ─── Single ────────────────────────────────────────────────────────────────────

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!customer) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Customer not found' };
  return customer;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createCustomer(input: CreateCustomerInput) {
  const { normalized, display } = normalizePhone(input.phone);

  const existing = await prisma.customer.findUnique({ where: { phone: normalized } });
  if (existing) {
    throw {
      statusCode: 409,
      code: 'DUPLICATE_PHONE',
      message: 'A customer with this phone number already exists',
    };
  }

  return prisma.customer.create({
    data: {
      fullName: input.fullName,
      phone: normalized,
      phoneDisplay: display,
      city: input.city,
      address: input.address,
      notes: input.notes,
      tag: input.tag,
    },
  });
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const exists = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Customer not found' };

  const { phone, ...rest } = input;
  const data: Prisma.CustomerUpdateInput = { ...rest };

  if (phone) {
    const { normalized, display } = normalizePhone(phone);
    const clash = await prisma.customer.findFirst({
      where: { phone: normalized, NOT: { id } },
      select: { id: true },
    });
    if (clash) {
      throw {
        statusCode: 409,
        code: 'DUPLICATE_PHONE',
        message: 'Another customer already uses this phone — merge the customers first',
      };
    }
    data.phone = normalized;
    data.phoneDisplay = display;
  }

  return prisma.customer.update({ where: { id }, data });
}

// ─── Order History ────────────────────────────────────────────────────────────

export async function getCustomerHistory(id: string, query: HistoryQueryInput) {
  const exists = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw { statusCode: 404, code: 'NOT_FOUND', message: 'Customer not found' };

  const { page, pageSize, skip, take } = parsePagination(query as Record<string, unknown>);

  const [data, total] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: id },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            total: true,
            // Customer-history modal renders a [COLOR] [SIZE] pill row
            // next to the product name. Without these fields the frontend
            // received `undefined` for color/size and the pills silently
            // disappeared. id+sku are picked up here too so the response
            // shape matches what the OrderItem type promises elsewhere.
            variant: {
              select: {
                id: true,
                color: true,
                size: true,
                sku: true,
                product: { select: { id: true, name: true, imageUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.order.count({ where: { customerId: id } }),
  ]);

  return paginatedResponse(data, total, page, pageSize);
}
