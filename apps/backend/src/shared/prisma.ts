import { PrismaClient, Prisma } from '@prisma/client';

// Postgres has a hard cap on connections (Railway's managed pg = 100 total,
// shared across every process). Prisma's default `num_cpus * 2 + 1` plus any
// Promise.all fan-out can exhaust that cap and trigger P2037 "too many clients".
// Force a modest ceiling and a wait-timeout so queries queue instead of failing.
function buildDatasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30');
    return url.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = buildDatasourceUrl();

// Money fields are stored as numeric(12,2) in Postgres (exact, no IEEE-754
// drift) but the rest of the codebase still expects JS `number`. This helper
// converts Prisma.Decimal | number | null → number | null so every service
// + API response keeps working without a mass refactor. JS arithmetic on
// 2-decimal values inside the safe-integer range is exact enough for
// day-to-day use; exact math (e.g. big sums) should use Postgres SUM() and
// pull a single Decimal out.
function toNum(v: Prisma.Decimal | number | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  return v.toNumber();
}

function toNumReq(v: Prisma.Decimal | number): number {
  if (typeof v === 'number') return v;
  return v.toNumber();
}

// Every money column listed here gets its type coerced from Decimal → number
// at read time via $extends. Keep this list in sync with @db.Decimal(12, 2)
// fields in schema.prisma. Non-money Floats (stock, measurements) stay as-is.
function buildClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
  });

  return base.$extends({
    result: {
      product: {
        basePrice: { needs: { basePrice: true }, compute: (r) => toNumReq(r.basePrice) },
      },
      productVariant: {
        price: { needs: { price: true }, compute: (r) => toNumReq(r.price) },
        costPrice: { needs: { costPrice: true }, compute: (r) => toNumReq(r.costPrice) },
      },
      order: {
        subtotal: { needs: { subtotal: true }, compute: (r) => toNumReq(r.subtotal) },
        discountAmount: { needs: { discountAmount: true }, compute: (r) => toNum(r.discountAmount) },
        total: { needs: { total: true }, compute: (r) => toNumReq(r.total) },
        shippingPrice: { needs: { shippingPrice: true }, compute: (r) => toNumReq(r.shippingPrice) },
        commissionAmount: {
          needs: { commissionAmount: true },
          compute: (r) => toNum(r.commissionAmount),
        },
      },
      orderItem: {
        unitPrice: { needs: { unitPrice: true }, compute: (r) => toNumReq(r.unitPrice) },
        total: { needs: { total: true }, compute: (r) => toNumReq(r.total) },
      },
      shippingCity: {
        price: { needs: { price: true }, compute: (r) => toNumReq(r.price) },
      },
      atelieEmployee: {
        baseSalary: { needs: { baseSalary: true }, compute: (r) => toNumReq(r.baseSalary) },
      },
      salaryPayment: {
        amount: { needs: { amount: true }, compute: (r) => toNumReq(r.amount) },
        paidAmount: { needs: { paidAmount: true }, compute: (r) => toNumReq(r.paidAmount) },
      },
      atelieMaterial: {
        unitCost: { needs: { unitCost: true }, compute: (r) => toNum(r.unitCost) },
      },
      fabricRoll: {
        unitCostPerMeter: {
          needs: { unitCostPerMeter: true },
          compute: (r) => toNumReq(r.unitCostPerMeter),
        },
      },
      productTest: {
        estimatedCostPerPiece: {
          needs: { estimatedCostPerPiece: true },
          compute: (r) => toNum(r.estimatedCostPerPiece),
        },
      },
      productionRun: {
        materialsCost: { needs: { materialsCost: true }, compute: (r) => toNumReq(r.materialsCost) },
        laborCost: { needs: { laborCost: true }, compute: (r) => toNumReq(r.laborCost) },
        totalCost: { needs: { totalCost: true }, compute: (r) => toNumReq(r.totalCost) },
        costPerPiece: { needs: { costPerPiece: true }, compute: (r) => toNumReq(r.costPerPiece) },
      },
      productionConsumption: {
        unitCost: { needs: { unitCost: true }, compute: (r) => toNumReq(r.unitCost) },
      },
      expense: {
        amount: { needs: { amount: true }, compute: (r) => toNumReq(r.amount) },
      },
      commissionPayment: {
        amount: { needs: { amount: true }, compute: (r) => toNumReq(r.amount) },
      },
      commissionRule: {
        value: { needs: { value: true }, compute: (r) => toNumReq(r.value) },
      },
    },
  });
}

type ExtendedPrisma = ReturnType<typeof buildClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrisma };

export const prisma: ExtendedPrisma = globalForPrisma.prisma ?? buildClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Extended-client-aware payload helpers. `Prisma.OrderGetPayload<>` refers
// to the unextended schema types where money fields are still Decimal — but
// the extended client's queries return them coerced to number. Use these
// helpers instead of Prisma.*GetPayload when the result flows through the
// extended `prisma` client, so TS sees the post-extension number type.
export type OrderPayload<Args> = Prisma.Result<
  typeof prisma.order,
  Args,
  'findFirstOrThrow'
>;
export type OrderItemPayload<Args> = Prisma.Result<
  typeof prisma.orderItem,
  Args,
  'findFirstOrThrow'
>;
export type ProductPayload<Args> = Prisma.Result<
  typeof prisma.product,
  Args,
  'findFirstOrThrow'
>;
export type ProductVariantPayload<Args> = Prisma.Result<
  typeof prisma.productVariant,
  Args,
  'findFirstOrThrow'
>;
