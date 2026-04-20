/**
 * Test data seed — adds 10 realistic orders for UI smoke-testing.
 * Idempotent: upserts by reference / phone / sku.
 *
 * Run: npx ts-node -r tsconfig-paths/register src/prisma/seed-test-orders.ts
 */
import { PrismaClient, type ConfirmationStatus, type ShippingStatus, type OrderSource, type DiscountType } from '@prisma/client';
import { normalizePhone } from '../utils/phoneNormalize';

const prisma = new PrismaClient();

// ─── Reference data ──────────────────────────────────────────────────────────

const CITIES = [
  { name: 'Casablanca', price: 25, zone: 'A' },
  { name: 'Rabat',      price: 30, zone: 'A' },
  { name: 'Marrakech',  price: 40, zone: 'B' },
  { name: 'Tanger',     price: 45, zone: 'B' },
  { name: 'Fès',        price: 35, zone: 'B' },
  { name: 'Agadir',     price: 50, zone: 'C' },
  { name: 'Meknès',     price: 35, zone: 'B' },
];

const PRODUCTS = [
  {
    name: 'Caftan Royal',
    sku: 'CAF-ROYAL',
    basePrice: 650,
    imageUrl: null,
    variants: [
      { color: 'Ivoire',  size: 'M', sku: 'CAF-ROYAL-IV-M', stock: 12, price: 650 },
      { color: 'Ivoire',  size: 'L', sku: 'CAF-ROYAL-IV-L', stock: 8,  price: 650 },
      { color: 'Bordeaux',size: 'M', sku: 'CAF-ROYAL-BD-M', stock: 5,  price: 680 },
      { color: 'Bordeaux',size: 'L', sku: 'CAF-ROYAL-BD-L', stock: 0,  price: 680 },
    ],
  },
  {
    name: 'Jellaba Moderne',
    sku: 'JEL-MOD',
    basePrice: 420,
    imageUrl: null,
    variants: [
      { color: 'Beige', size: 'S', sku: 'JEL-MOD-BG-S', stock: 10, price: 420 },
      { color: 'Beige', size: 'M', sku: 'JEL-MOD-BG-M', stock: 7,  price: 420 },
      { color: 'Noir',  size: 'M', sku: 'JEL-MOD-NR-M', stock: 4,  price: 450 },
    ],
  },
];

// 10 customers — Moroccan names, realistic phones (06xxx), varied cities + tags
const CUSTOMERS = [
  { fullName: 'Fatima Zahra Benali',    phoneRaw: '0661234501', city: 'Casablanca', address: 'Rue des Orangers, Maarif',        tag: 'normal'      as const },
  { fullName: 'Youssef El Amrani',      phoneRaw: '0678912302', city: 'Rabat',      address: 'Avenue Mohammed V, Agdal',        tag: 'vip'         as const },
  { fullName: 'Khadija Alaoui',         phoneRaw: '0612345603', city: 'Marrakech',  address: 'Derb Sidi Bouloukat, Médina',     tag: 'normal'      as const },
  { fullName: 'Mehdi Tazi',             phoneRaw: '0699876504', city: 'Tanger',     address: 'Quartier Californie',             tag: 'vip'         as const },
  { fullName: 'Sara Bennani',           phoneRaw: '0655123405', city: 'Fès',        address: 'Rue Ibn Khaldoun, Fès El Bali',   tag: 'normal'      as const },
  { fullName: 'Omar El Fassi',          phoneRaw: '0644778806', city: 'Agadir',     address: 'Hay Mohammadi',                   tag: 'normal'      as const },
  { fullName: 'Nadia Idrissi',          phoneRaw: '0633556607', city: 'Casablanca', address: 'Boulevard Ghandi, Racine',        tag: 'blacklisted' as const },
  { fullName: 'Rachid Chaoui',          phoneRaw: '0666112208', city: 'Meknès',     address: 'Avenue des FAR',                  tag: 'normal'      as const },
  { fullName: 'Imane Berrada',          phoneRaw: '0611223309', city: 'Rabat',      address: 'Hay Riad',                        tag: 'normal'      as const },
  { fullName: 'Hamza Bouzidi',          phoneRaw: '0622334410', city: 'Casablanca', address: 'Sidi Maarouf',                    tag: 'vip'         as const },
];

// 10 orders — hand-tuned to exercise every status/source combo the UI must render
interface OrderSpec {
  customerIdx: number;
  source: OrderSource;
  confirmationStatus: ConfirmationStatus;
  shippingStatus: ShippingStatus;
  productIdx: number;
  variantIdx: number;
  quantity: number;
  discountType?: DiscountType;
  discountAmount?: number;
  confirmationNote?: string;
  shippingInstruction?: string;
  agentIdx?: number; // 0 = admin, undefined = unassigned
  labelSent?: boolean;
  createdDaysAgo: number;
}

const ORDERS: OrderSpec[] = [
  // 1 — pending / unassigned / Youcan
  { customerIdx: 0, source: 'youcan',    confirmationStatus: 'pending',     shippingStatus: 'not_shipped',      productIdx: 0, variantIdx: 0, quantity: 1, createdDaysAgo: 0 },
  // 2 — awaiting / assigned / WhatsApp + discount
  { customerIdx: 1, source: 'whatsapp',  confirmationStatus: 'awaiting',    shippingStatus: 'not_shipped',      productIdx: 0, variantIdx: 1, quantity: 2, discountType: 'percentage', discountAmount: 10, confirmationNote: 'Client VIP, rappel demain 10h', agentIdx: 0, createdDaysAgo: 1 },
  // 3 — confirmed / label_created / Instagram
  { customerIdx: 2, source: 'instagram', confirmationStatus: 'confirmed',   shippingStatus: 'label_created',    productIdx: 1, variantIdx: 0, quantity: 1, agentIdx: 0, labelSent: true, createdDaysAgo: 2 },
  // 4 — confirmed / in_transit / manual + shipping note
  { customerIdx: 3, source: 'manual',    confirmationStatus: 'confirmed',   shippingStatus: 'in_transit',       productIdx: 0, variantIdx: 2, quantity: 1, discountType: 'fixed', discountAmount: 50, shippingInstruction: 'Livrer avant 18h', agentIdx: 0, labelSent: true, createdDaysAgo: 3 },
  // 5 — confirmed / out_for_delivery / Youcan
  { customerIdx: 4, source: 'youcan',    confirmationStatus: 'confirmed',   shippingStatus: 'out_for_delivery', productIdx: 1, variantIdx: 1, quantity: 1, agentIdx: 0, labelSent: true, createdDaysAgo: 4 },
  // 6 — confirmed / delivered (completed sale) / WhatsApp
  { customerIdx: 5, source: 'whatsapp',  confirmationStatus: 'confirmed',   shippingStatus: 'delivered',        productIdx: 1, variantIdx: 2, quantity: 2, agentIdx: 0, labelSent: true, createdDaysAgo: 7 },
  // 7 — cancelled / fake customer
  { customerIdx: 6, source: 'instagram', confirmationStatus: 'cancelled',   shippingStatus: 'not_shipped',      productIdx: 0, variantIdx: 0, quantity: 1, confirmationNote: 'Client blacklisté, numéro déjà frauduleux', agentIdx: 0, createdDaysAgo: 5 },
  // 8 — unreachable / callback
  { customerIdx: 7, source: 'youcan',    confirmationStatus: 'callback',    shippingStatus: 'not_shipped',      productIdx: 1, variantIdx: 0, quantity: 1, confirmationNote: 'Rappeler demain après 14h', agentIdx: 0, createdDaysAgo: 1 },
  // 9 — confirmed / returned / Instagram + full shipping note
  { customerIdx: 8, source: 'instagram', confirmationStatus: 'confirmed',   shippingStatus: 'returned',         productIdx: 0, variantIdx: 1, quantity: 1, shippingInstruction: 'Client refusé à la livraison', agentIdx: 0, labelSent: true, createdDaysAgo: 10 },
  // 10 — out_of_stock (auto-triggered) / manual
  { customerIdx: 9, source: 'manual',    confirmationStatus: 'out_of_stock',shippingStatus: 'not_shipped',      productIdx: 0, variantIdx: 3, quantity: 1, confirmationNote: 'Stock épuisé — proposer variante L', agentIdx: 0, createdDaysAgo: 2 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcTotals(unitPrice: number, qty: number, shipping: number, discountType?: DiscountType, discountAmount?: number) {
  const subtotal = unitPrice * qty;
  let discount = 0;
  if (discountType === 'fixed' && discountAmount) discount = discountAmount;
  if (discountType === 'percentage' && discountAmount) discount = (subtotal * discountAmount) / 100;
  const total = Math.max(0, subtotal - discount) + shipping;
  return { subtotal, total };
}

async function nextReference(createdAt: Date): Promise<string> {
  const yy = String(createdAt.getFullYear()).slice(-2);
  const count = await prisma.order.count({
    where: { reference: { startsWith: `ORD-${yy}-` } },
  });
  return `ORD-${yy}-${String(count + 1).padStart(5, '0')}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Test orders seed starting...\n');

  // 1) Cities
  for (const c of CITIES) {
    await prisma.shippingCity.upsert({
      where: { name: c.name },
      update: { price: c.price, zone: c.zone, isActive: true },
      create: { ...c, isActive: true },
    });
  }
  console.log(`✅ ${CITIES.length} shipping cities`);

  // 2) Products + variants
  const productMap = new Map<string, { id: string; variants: { id: string; price: number }[] }>();
  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: { name: p.name, basePrice: p.basePrice, imageUrl: p.imageUrl, isActive: true },
      create: {
        name: p.name, sku: p.sku, basePrice: p.basePrice, imageUrl: p.imageUrl, isActive: true,
      },
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
  console.log(`✅ ${PRODUCTS.length} products (${PRODUCTS.reduce((n, p) => n + p.variants.length, 0)} variants)`);

  // 3) Customers
  const customerIds: string[] = [];
  for (const c of CUSTOMERS) {
    const { normalized, display } = normalizePhone(c.phoneRaw);
    const customer = await prisma.customer.upsert({
      where: { phone: normalized },
      update: { fullName: c.fullName, city: c.city, address: c.address, tag: c.tag },
      create: {
        fullName: c.fullName,
        phone: normalized,
        phoneDisplay: display,
        city: c.city,
        address: c.address,
        tag: c.tag,
      },
    });
    customerIds.push(customer.id);
  }
  console.log(`✅ ${CUSTOMERS.length} customers`);

  // 4) Agents — lookup admin user to use as agent for pre-assigned orders
  const admin = await prisma.user.findUnique({ where: { email: 'admin@anaqatoki.ma' } });
  if (!admin) throw new Error('Admin user missing — run main seed first');
  const agents = [admin];

  // 5) Orders
  let created = 0, skipped = 0;
  const productSkus = PRODUCTS.map((p) => p.sku);

  for (const spec of ORDERS) {
    const customerId = customerIds[spec.customerIdx];
    const customer = CUSTOMERS[spec.customerIdx];
    const productEntry = productMap.get(productSkus[spec.productIdx]);
    if (!customerId || !customer || !productEntry) continue;
    const variant = productEntry.variants[spec.variantIdx];
    if (!variant) continue;

    const city = CITIES.find((c) => c.name === customer.city);
    const shippingPrice = city?.price ?? 30;

    const { subtotal, total } = calcTotals(
      variant.price,
      spec.quantity,
      shippingPrice,
      spec.discountType,
      spec.discountAmount,
    );

    const createdAt = new Date(Date.now() - spec.createdDaysAgo * 24 * 60 * 60 * 1000);

    // Dedup via customer + exact timestamp (rough idempotency for re-runs)
    const existing = await prisma.order.findFirst({
      where: { customerId, createdAt },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const reference = await nextReference(createdAt);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          reference,
          source: spec.source,
          customerId,
          agentId: spec.agentIdx !== undefined ? agents[spec.agentIdx]!.id : null,
          assignedAt: spec.agentIdx !== undefined ? createdAt : null,
          confirmationStatus: spec.confirmationStatus,
          shippingStatus: spec.shippingStatus,
          subtotal,
          discountType: spec.discountType,
          discountAmount: spec.discountAmount ?? null,
          total,
          shippingPrice,
          confirmationNote: spec.confirmationNote,
          shippingInstruction: spec.shippingInstruction,
          labelSent: spec.labelSent ?? false,
          labelSentAt: spec.labelSent ? createdAt : null,
          createdAt,
          updatedAt: createdAt,
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
      // System log trail
      await tx.orderLog.create({
        data: {
          orderId: order.id,
          type: 'system',
          action: 'order_created',
          performedBy: 'Seed',
          meta: { source: spec.source },
          createdAt,
        },
      });
      if (spec.confirmationStatus !== 'pending') {
        await tx.orderLog.create({
          data: {
            orderId: order.id,
            type: 'confirmation',
            action: `status_changed_to_${spec.confirmationStatus}`,
            performedBy: 'Admin User',
            userId: admin.id,
            meta: { status: spec.confirmationStatus, note: spec.confirmationNote },
            createdAt,
          },
        });
      }
      if (spec.shippingStatus !== 'not_shipped') {
        await tx.orderLog.create({
          data: {
            orderId: order.id,
            type: 'shipping',
            action: `status_changed_to_${spec.shippingStatus}`,
            performedBy: 'Admin User',
            userId: admin.id,
            meta: { status: spec.shippingStatus, note: spec.shippingInstruction },
            createdAt,
          },
        });
      }
    });
    created += 1;
  }
  console.log(`✅ orders created=${created} skipped=${skipped}\n🎉 Test seed complete`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
