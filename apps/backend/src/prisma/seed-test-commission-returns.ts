/**
 * Test data for Commission + Returns flows.
 *
 *  - Ensures admin has commission rules (onConfirm=10, onDeliver=25 → 35/order).
 *  - Adds delivered orders (agent=admin) so the Money → Commission tab shows
 *    pending and paid buckets side by side.
 *  - Adds returned orders across every scope the Returns page surfaces:
 *    pending (returned / attempted / lost) and already verified
 *    (return_validated / return_refused).
 *
 * Idempotent. Re-running is safe — customers upsert by phone, orders dedupe
 * on (customerId, createdAt).
 *
 * Run: npx ts-node -r tsconfig-paths/register src/prisma/seed-test-commission-returns.ts
 */
import {
  PrismaClient,
  type ConfirmationStatus,
  type ShippingStatus,
  type OrderSource,
} from '@prisma/client';
import { normalizePhone } from '../utils/phoneNormalize';

const prisma = new PrismaClient();

// ─── Products + cities are reused from the main test-orders seed ────────────

const CITIES = [
  { name: 'Casablanca', price: 25, zone: 'A' },
  { name: 'Rabat', price: 30, zone: 'A' },
  { name: 'Marrakech', price: 40, zone: 'B' },
  { name: 'Tanger', price: 45, zone: 'B' },
  { name: 'Fès', price: 35, zone: 'B' },
  { name: 'Agadir', price: 50, zone: 'C' },
];

const PRODUCTS = [
  {
    name: 'Caftan Royal',
    sku: 'CAF-ROYAL',
    basePrice: 650,
    variants: [
      { color: 'Ivoire', size: 'M', sku: 'CAF-ROYAL-IV-M', stock: 12, price: 650 },
      { color: 'Ivoire', size: 'L', sku: 'CAF-ROYAL-IV-L', stock: 8, price: 650 },
      { color: 'Bordeaux', size: 'M', sku: 'CAF-ROYAL-BD-M', stock: 5, price: 680 },
      { color: 'Bordeaux', size: 'L', sku: 'CAF-ROYAL-BD-L', stock: 3, price: 680 },
    ],
  },
  {
    name: 'Jellaba Moderne',
    sku: 'JEL-MOD',
    basePrice: 420,
    variants: [
      { color: 'Beige', size: 'S', sku: 'JEL-MOD-BG-S', stock: 10, price: 420 },
      { color: 'Beige', size: 'M', sku: 'JEL-MOD-BG-M', stock: 7, price: 420 },
      { color: 'Noir', size: 'M', sku: 'JEL-MOD-NR-M', stock: 4, price: 450 },
    ],
  },
];

// Fresh customers so this seed doesn't fight the other one on references.
const CUSTOMERS = [
  { fullName: 'Aïcha Lahlou', phoneRaw: '0661334421', city: 'Casablanca', address: 'Bd Zerktouni, Gauthier' },
  { fullName: 'Karim Mansouri', phoneRaw: '0677889922', city: 'Rabat', address: 'Agdal, Avenue France' },
  { fullName: 'Laïla Ouaziz', phoneRaw: '0612458833', city: 'Marrakech', address: 'Gueliz, Rue Ibn Aïcha' },
  { fullName: 'Tariq Benhaddou', phoneRaw: '0699445566', city: 'Tanger', address: 'Iberia, Rue de Belgique' },
  { fullName: 'Salma Rifi', phoneRaw: '0655667788', city: 'Fès', address: 'Route d\'Imouzzer' },
  { fullName: 'Yassine El Kadi', phoneRaw: '0644332211', city: 'Agadir', address: 'Founty, Bloc J' },
  { fullName: 'Noha Sebti', phoneRaw: '0633998877', city: 'Casablanca', address: 'Anfa Supérieur' },
  { fullName: 'Hicham Boukhriss', phoneRaw: '0666554433', city: 'Rabat', address: 'Souissi, Avenue Imam Malik' },
  { fullName: 'Meryem Zniber', phoneRaw: '0611778899', city: 'Marrakech', address: 'Hivernage, Rue des Temples' },
  { fullName: 'Othmane Cherkaoui', phoneRaw: '0622883344', city: 'Casablanca', address: 'Bourgogne, Rue Moulay Ismail' },
  { fullName: 'Asmaa El Haddaoui', phoneRaw: '0688112233', city: 'Tanger', address: 'Malabata' },
  { fullName: 'Anas Berrechid', phoneRaw: '0699001122', city: 'Fès', address: 'Narjiss' },
];

interface OrderSpec {
  customerIdx: number;
  source: OrderSource;
  confirmationStatus: ConfirmationStatus;
  shippingStatus: ShippingStatus;
  productIdx: number;
  variantIdx: number;
  quantity: number;
  deliveredDaysAgo?: number; // set deliveredAt relative to today
  commissionPaid?: boolean; // if true, lock the row into the "paid" bucket
  returnVerifiedDaysAgo?: number; // for return_validated / return_refused
  returnNote?: string;
  createdDaysAgo: number;
}

// Commission test cases — admin is the agent on every row so the per-agent
// card on the Commission tab lights up.
const COMMISSION_ORDERS: OrderSpec[] = [
  { customerIdx: 0, source: 'youcan',    confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 0, variantIdx: 0, quantity: 1, deliveredDaysAgo: 6,  createdDaysAgo: 9 },
  { customerIdx: 1, source: 'whatsapp',  confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 0, variantIdx: 1, quantity: 2, deliveredDaysAgo: 5,  createdDaysAgo: 8 },
  { customerIdx: 2, source: 'manual',    confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 1, variantIdx: 0, quantity: 1, deliveredDaysAgo: 4,  createdDaysAgo: 7 },
  { customerIdx: 3, source: 'instagram', confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 1, variantIdx: 1, quantity: 1, deliveredDaysAgo: 3,  createdDaysAgo: 6 },
  { customerIdx: 4, source: 'youcan',    confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 0, variantIdx: 2, quantity: 1, deliveredDaysAgo: 2,  createdDaysAgo: 5 },
  // Already paid — lands in the "Paid" bucket
  { customerIdx: 5, source: 'whatsapp',  confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 1, variantIdx: 2, quantity: 1, deliveredDaysAgo: 20, commissionPaid: true, createdDaysAgo: 25 },
  { customerIdx: 6, source: 'youcan',    confirmationStatus: 'confirmed', shippingStatus: 'delivered', productIdx: 0, variantIdx: 0, quantity: 2, deliveredDaysAgo: 18, commissionPaid: true, createdDaysAgo: 23 },
];

// Returns test cases
const RETURN_ORDERS: OrderSpec[] = [
  // Pending verification (show up on the "Pending" tab of Returns page)
  { customerIdx: 7, source: 'whatsapp',  confirmationStatus: 'confirmed', shippingStatus: 'returned',  productIdx: 0, variantIdx: 1, quantity: 1, createdDaysAgo: 12 },
  { customerIdx: 8, source: 'youcan',    confirmationStatus: 'confirmed', shippingStatus: 'attempted', productIdx: 1, variantIdx: 0, quantity: 1, createdDaysAgo: 10 },
  { customerIdx: 9, source: 'instagram', confirmationStatus: 'confirmed', shippingStatus: 'lost',      productIdx: 0, variantIdx: 2, quantity: 1, createdDaysAgo: 14 },
  // Already verified — history for the "Verified" tab
  { customerIdx: 10, source: 'manual',   confirmationStatus: 'confirmed', shippingStatus: 'return_validated', productIdx: 1, variantIdx: 1, quantity: 2, returnVerifiedDaysAgo: 2, returnNote: 'Carton intact, remis en stock', createdDaysAgo: 15 },
  { customerIdx: 11, source: 'whatsapp', confirmationStatus: 'confirmed', shippingStatus: 'return_refused',   productIdx: 0, variantIdx: 0, quantity: 1, returnVerifiedDaysAgo: 1, returnNote: 'Tissu déchiré à la livraison', createdDaysAgo: 16 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function nextReference(createdAt: Date): Promise<string> {
  const yy = String(createdAt.getFullYear()).slice(-2);
  const count = await prisma.order.count({
    where: { reference: { startsWith: `ORD-${yy}-` } },
  });
  return `ORD-${yy}-${String(count + 1).padStart(5, '0')}`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Commission + Returns test seed starting...\n');

  // 1) Admin agent
  const admin = await prisma.user.findUnique({ where: { email: 'admin@anaqatoki.ma' } });
  if (!admin) throw new Error('Admin user missing — run `pnpm seed` first');

  // 2) Commission rules (idempotent)
  for (const rule of [
    { type: 'onConfirm', value: 10 },
    { type: 'onDeliver', value: 25 },
  ]) {
    const exists = await prisma.commissionRule.findFirst({
      where: { agentId: admin.id, type: rule.type },
    });
    if (!exists) {
      await prisma.commissionRule.create({ data: { agentId: admin.id, ...rule } });
    }
  }
  const perOrderRate = 35;
  console.log(`✅ commission rules (onConfirm=10 + onDeliver=25 = ${perOrderRate} MAD/order)`);

  // 3) Cities
  for (const c of CITIES) {
    await prisma.shippingCity.upsert({
      where: { name: c.name },
      update: { price: c.price, zone: c.zone, isActive: true },
      create: { ...c, isActive: true },
    });
  }

  // 4) Products + variants
  const productMap = new Map<string, { id: string; variants: { id: string; price: number }[] }>();
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, basePrice: p.basePrice, isActive: true },
      create: { name: p.name, sku: p.sku, basePrice: p.basePrice, isActive: true },
    });
    const variants: { id: string; price: number }[] = [];
    for (const v of p.variants) {
      const variant = await prisma.productVariant.upsert({
        where: { sku: v.sku },
        update: { color: v.color, size: v.size, stock: v.stock, price: v.price },
        create: { productId: product.id, ...v },
      });
      variants.push({ id: variant.id, price: v.price });
    }
    productMap.set(p.sku, { id: product.id, variants });
  }

  // 5) Customers
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const { normalized, display } = normalizePhone(c.phoneRaw);
    const customer = await prisma.customer.upsert({
      where: { phone: normalized },
      update: { fullName: c.fullName, city: c.city, address: c.address },
      create: {
        fullName: c.fullName,
        phone: normalized,
        phoneDisplay: display,
        city: c.city,
        address: c.address,
        tag: 'normal',
      },
    });
    customerIds.push(customer.id);
  }
  console.log(`✅ ${CUSTOMERS.length} customers`);

  // 6) Orders
  let created = 0;
  let skipped = 0;
  const productSkus = PRODUCTS.map((p) => p.sku);
  const allSpecs: Array<{ spec: OrderSpec; bucket: 'commission' | 'return' }> = [
    ...COMMISSION_ORDERS.map((spec) => ({ spec, bucket: 'commission' as const })),
    ...RETURN_ORDERS.map((spec) => ({ spec, bucket: 'return' as const })),
  ];

  for (const { spec, bucket } of allSpecs) {
    const customerId = customerIds[spec.customerIdx];
    const customer = CUSTOMERS[spec.customerIdx];
    const productEntry = productMap.get(productSkus[spec.productIdx]);
    if (!customerId || !customer || !productEntry) continue;
    const variant = productEntry.variants[spec.variantIdx];
    if (!variant) continue;

    const city = CITIES.find((c) => c.name === customer.city);
    const shippingPrice = city?.price ?? 30;
    const subtotal = variant.price * spec.quantity;
    const total = subtotal + shippingPrice;

    const createdAt = daysAgo(spec.createdDaysAgo);

    const existing = await prisma.order.findFirst({ where: { customerId, createdAt } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const reference = await nextReference(createdAt);
    const isDelivered = spec.shippingStatus === 'delivered';
    const deliveredAt = spec.deliveredDaysAgo != null ? daysAgo(spec.deliveredDaysAgo) : null;
    const isVerifiedReturn =
      spec.shippingStatus === 'return_validated' || spec.shippingStatus === 'return_refused';
    const returnVerifiedAt =
      spec.returnVerifiedDaysAgo != null ? daysAgo(spec.returnVerifiedDaysAgo) : null;
    const updatedAt =
      returnVerifiedAt ?? deliveredAt ?? createdAt;

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          reference,
          source: spec.source,
          customerId,
          agentId: admin.id,
          assignedAt: createdAt,
          confirmationStatus: spec.confirmationStatus,
          shippingStatus: spec.shippingStatus,
          subtotal,
          total,
          shippingPrice,
          labelSent: true,
          labelSentAt: createdAt,
          deliveredAt,
          // Lock in commissionAmount so paid/pending buckets are deterministic.
          commissionAmount: isDelivered ? perOrderRate : null,
          commissionPaid: spec.commissionPaid ?? false,
          commissionPaidAt: spec.commissionPaid ? daysAgo(1) : null,
          returnNote: spec.returnNote ?? null,
          returnVerifiedAt,
          returnVerifiedById: isVerifiedReturn ? admin.id : null,
          createdAt,
          updatedAt,
        },
      });
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          variantId: variant.id,
          quantity: spec.quantity,
          unitPrice: variant.price,
          total: variant.price * spec.quantity,
        },
      });
      await tx.orderLog.create({
        data: {
          orderId: order.id,
          type: 'system',
          action: 'order_created',
          performedBy: 'Seed',
          meta: { source: spec.source, bucket },
          createdAt,
        },
      });
      await tx.orderLog.create({
        data: {
          orderId: order.id,
          type: 'shipping',
          action: `status_changed_to_${spec.shippingStatus}`,
          performedBy: 'Admin User',
          userId: admin.id,
          meta: { status: spec.shippingStatus },
          createdAt: updatedAt,
        },
      });
      if (spec.commissionPaid) {
        await tx.orderLog.create({
          data: {
            orderId: order.id,
            type: 'system',
            action: 'Commission paid by Seed',
            performedBy: 'Seed',
            userId: admin.id,
            createdAt: daysAgo(1),
          },
        });
      }
    });
    created += 1;
  }

  // Summary
  const summary = {
    commissionPending: COMMISSION_ORDERS.filter((o) => !o.commissionPaid).length,
    commissionPaid: COMMISSION_ORDERS.filter((o) => o.commissionPaid).length,
    returnsPending: RETURN_ORDERS.filter(
      (o) => o.shippingStatus === 'returned' || o.shippingStatus === 'attempted' || o.shippingStatus === 'lost',
    ).length,
    returnsVerified: RETURN_ORDERS.filter(
      (o) => o.shippingStatus === 'return_validated' || o.shippingStatus === 'return_refused',
    ).length,
  };

  console.log(`\n✅ orders created=${created} skipped=${skipped}`);
  console.log(`   commission: ${summary.commissionPending} pending (${summary.commissionPending * perOrderRate} MAD) + ${summary.commissionPaid} paid`);
  console.log(`   returns:    ${summary.returnsPending} pending + ${summary.returnsVerified} verified`);
  console.log('🎉 Commission + Returns seed complete\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
