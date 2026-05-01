/**
 * Test data seed — populates the CRM with a realistic mix of orders so the
 * dashboard cards / charts / pipeline tables have something to render.
 *
 * Idempotency: re-runnable. Wipes existing test orders and customers (any
 * customer whose phone starts with +21260000) before re-inserting, so the
 * dashboard is deterministic between runs. Real customers / agents you've
 * created through the UI are untouched.
 *
 * Run:
 *   npx ts-node -r tsconfig-paths/register src/prisma/seed-test-data.ts
 */

import {
  PrismaClient,
  type ConfirmationStatus,
  type ShippingStatus,
  type ReturnOutcome,
  type OrderSource,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const TEST_PHONE_PREFIX = '+21260000'; // marker we use to find + nuke test customers

const CITIES = [
  { name: 'Casablanca', price: 25, zone: 'A' },
  { name: 'Rabat', price: 30, zone: 'A' },
  { name: 'Marrakech', price: 35, zone: 'B' },
  { name: 'Tanger', price: 40, zone: 'B' },
  { name: 'Fes', price: 35, zone: 'B' },
  { name: 'Agadir', price: 45, zone: 'C' },
  { name: 'Oujda', price: 50, zone: 'C' },
];

const PRODUCTS = [
  { name: 'Kaftan Soirée', sku: 'KAF-001', basePrice: 1200, variants: ['Rouge/M', 'Rouge/L', 'Bleu/M', 'Bleu/L'] },
  { name: 'Djellaba Brodée', sku: 'DJE-002', basePrice: 850, variants: ['Beige/M', 'Beige/L', 'Vert/L'] },
  { name: 'Robe Caftan', sku: 'ROB-003', basePrice: 950, variants: ['Noir/S', 'Noir/M', 'Or/M'] },
  { name: 'Takchita Mariage', sku: 'TAK-004', basePrice: 2400, variants: ['Blanc/M', 'Blanc/L'] },
  { name: 'Jabador Homme', sku: 'JAB-005', basePrice: 600, variants: ['Beige/L', 'Marron/XL'] },
  { name: 'Tenue Enfant', sku: 'ENF-006', basePrice: 350, variants: ['Rose/8ans', 'Bleu/10ans'] },
];

const AGENTS = [
  { email: 'fatima@anaqatoki.ma',  name: 'Fatima El Idrissi'  },
  { email: 'youssef@anaqatoki.ma', name: 'Youssef Benali'      },
  { email: 'amina@anaqatoki.ma',   name: 'Amina Tahiri'        },
  { email: 'karim@anaqatoki.ma',   name: 'Karim Boukhari'      },
];

const CUSTOMER_FIRST_NAMES = [
  'Mohamed', 'Aicha', 'Omar', 'Salma', 'Hassan', 'Zineb', 'Said', 'Nadia',
  'Ahmed', 'Lamia', 'Mehdi', 'Sara', 'Anas', 'Khadija', 'Younes', 'Hajar',
];
const CUSTOMER_LAST_NAMES = [
  'Alaoui', 'Bennani', 'Cherkaoui', 'Drissi', 'Fassi', 'Gharbi', 'Hassani',
  'Jebli', 'Kabbaj', 'Lahlou', 'Mansouri', 'Naciri', 'Ouazzani', 'Saidi',
];

const SOURCES: OrderSource[] = ['youcan', 'whatsapp', 'instagram', 'manual'];

// Distribution targets for the 80 generated orders. Counts sum to 80.
const CONFIRMATION_DISTRIBUTION: Array<[ConfirmationStatus, number]> = [
  ['confirmed',    44], // 55% — most orders end up confirmed
  ['pending',      10], // 12% — fresh, agent hasn't acted yet
  ['callback',      6], // 7%  — client asked to be called back
  ['cancelled',     6], // 7%  — agent cancelled
  ['unreachable',   5], // 6%  — couldn't reach the client
  ['reported',      4], // 5%  — client wants on a future date
  ['out_of_stock',  3], // 4%  — variant ran out
  ['fake',          2], // 3%  — spam / fake
];

// Of the 44 confirmed orders, where are they in the shipping pipeline?
const SHIPPING_DISTRIBUTION: Array<[ShippingStatus, number]> = [
  ['delivered',         22], // half delivered
  ['in_transit',         5],
  ['out_for_delivery',   3],
  ['picked_up',          3],
  ['returned',           5], // some bounced back
  ['failed_delivery',    3],
  ['reported',           2], // courier asked to come back later
  ['not_shipped',        1], // confirmed but agent hasn't pushed yet
];

// ─── Helpers ────────────────────────────────────────────────────────────────

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const phone = (i: number) => {
  // Predictable, unique-per-test-customer. Index zero-padded to 4.
  const padded = String(i).padStart(4, '0');
  return {
    e164: `${TEST_PHONE_PREFIX}${padded}`,
    display: `06${padded.slice(0, 2)}${padded.slice(2)}00`,
  };
};

function daysAgo(days: number, hour = randInt(8, 22), minute = randInt(0, 59)): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function pickByDistribution<T>(dist: Array<[T, number]>, total: number): T[] {
  const out: T[] = [];
  let sum = 0;
  for (const [v, n] of dist) {
    for (let i = 0; i < n; i++) out.push(v);
    sum += n;
  }
  if (sum !== total) {
    // Pad with the most common bucket if rounding doesn't match.
    while (out.length < total) out.push(dist[0][0]);
    while (out.length > total) out.pop();
  }
  // Shuffle so distribution is mixed across days/agents, not clumped.
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function nextRef(year: number, seq: number): string {
  return `ORD-${String(year).slice(-2)}-${String(seq).padStart(5, '0')}`;
}

// ─── Wipe previous test data ────────────────────────────────────────────────

async function wipePrevious() {
  // Delete orders + customers we created on a previous run, identified by
  // the customer phone marker. OrderItem + OrderLog cascade-delete via FK.
  const testCustomers = await prisma.customer.findMany({
    where: { phone: { startsWith: TEST_PHONE_PREFIX } },
    select: { id: true },
  });
  if (testCustomers.length > 0) {
    const ids = testCustomers.map((c) => c.id);
    await prisma.order.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  }
  // Test products are identified by their SKU. Any other order (manual
  // Coliix smoke tests, etc.) that referenced these variants would block
  // the product delete via OrderItem.variantId FK — drop those orders too.
  const testProducts = await prisma.product.findMany({
    where: { sku: { in: PRODUCTS.map((p) => p.sku) } },
    select: { id: true, variants: { select: { id: true } } },
  });
  if (testProducts.length > 0) {
    const pids = testProducts.map((p) => p.id);
    const variantIds = testProducts.flatMap((p) => p.variants.map((v) => v.id));
    if (variantIds.length > 0) {
      const orphanOrders = await prisma.orderItem.findMany({
        where: { variantId: { in: variantIds } },
        select: { orderId: true },
      });
      const orphanOrderIds = Array.from(new Set(orphanOrders.map((o) => o.orderId)));
      if (orphanOrderIds.length > 0) {
        await prisma.order.deleteMany({ where: { id: { in: orphanOrderIds } } });
      }
    }
    await prisma.product.deleteMany({ where: { id: { in: pids } } });
  }
  console.log(`🧹 Wiped ${testCustomers.length} test customers + ${testProducts.length} test products`);
}

// ─── Seed building blocks ───────────────────────────────────────────────────

async function ensureCities() {
  for (const c of CITIES) {
    await prisma.shippingCity.upsert({
      where: { name: c.name },
      update: { price: c.price, zone: c.zone, isActive: true },
      create: { name: c.name, price: c.price, zone: c.zone, isActive: true },
    });
  }
  console.log(`✅ ${CITIES.length} cities ready`);
}

async function ensureAgents() {
  const agentRole = await prisma.role.findUnique({ where: { name: 'agent' } });
  if (!agentRole) throw new Error('Agent role missing — run npm run db:seed first');

  const passwordHash = await bcrypt.hash('agent123', 12);
  const created: { id: string; name: string }[] = [];
  for (const a of AGENTS) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: { name: a.name, isActive: true },
      create: {
        email: a.email,
        name: a.name,
        passwordHash,
        roleId: agentRole.id,
        isActive: true,
      },
    });
    created.push({ id: user.id, name: user.name });
  }
  console.log(`✅ ${created.length} agents ready (password "agent123")`);
  return created;
}

async function seedProducts() {
  const products: { id: string; basePrice: number; variants: { id: string; price: number }[] }[] = [];
  for (const p of PRODUCTS) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        sku: p.sku,
        basePrice: p.basePrice,
        isActive: true,
        variants: {
          create: p.variants.map((v, i) => {
            const [color, size] = v.split('/');
            return {
              color,
              size,
              sku: `${p.sku}-${i + 1}`,
              stock: randInt(20, 80),
              price: p.basePrice + randInt(-50, 100),
              costPrice: Math.round(p.basePrice * 0.4),
            };
          }),
        },
      },
      include: { variants: true },
    });
    products.push({
      id: product.id,
      basePrice: Number(product.basePrice),
      variants: product.variants.map((v) => ({ id: v.id, price: Number(v.price) })),
    });
  }
  console.log(`✅ ${products.length} products with ${products.reduce((s, p) => s + p.variants.length, 0)} variants`);
  return products;
}

async function seedCustomers(count: number) {
  const customers: { id: string; city: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const p = phone(i);
    const fullName = `${rand(CUSTOMER_FIRST_NAMES)} ${rand(CUSTOMER_LAST_NAMES)}`;
    const city = rand(CITIES).name;
    const c = await prisma.customer.create({
      data: {
        fullName,
        phone: p.e164,
        phoneDisplay: p.display,
        city,
        address: `Rue ${randInt(1, 200)}, ${city}`,
      },
    });
    customers.push({ id: c.id, city });
  }
  console.log(`✅ ${customers.length} test customers`);
  return customers;
}

// ─── Orders ─────────────────────────────────────────────────────────────────

interface SeedOrderArgs {
  customer: { id: string; city: string };
  agent: { id: string; name: string } | null;
  product: { id: string; basePrice: number; variants: { id: string; price: number }[] };
  confirmation: ConfirmationStatus;
  shipping: ShippingStatus;
  reference: string;
  daysSinceCreated: number;
  source: OrderSource;
  // Set when we want this order to be a "merged into another" duplicate.
  mergedIntoId?: string;
}

async function createOrder(args: SeedOrderArgs) {
  const variant = rand(args.product.variants);
  const quantity = randInt(1, 3);
  const unitPrice = variant.price;
  const itemTotal = unitPrice * quantity;
  const cityRow = await prisma.shippingCity.findUnique({ where: { name: args.customer.city } });
  const shippingPrice = Number(cityRow?.price ?? 30);
  const total = itemTotal + shippingPrice;

  const createdAt = daysAgo(args.daysSinceCreated);

  // Per-status timestamps. Only stamp the one that matches the current
  // confirmation/shipping state — kpiCalculator dates against these.
  const setConfirm =
    args.confirmation === 'confirmed' ||
    args.confirmation === 'cancelled' ||
    args.confirmation === 'unreachable';
  // Confirmation happens within ~24h of creation in our test data.
  const confirmDelayHours = randInt(2, 23);
  const transitionAt = new Date(createdAt.getTime() + confirmDelayHours * 3600 * 1000);

  const isShipped =
    args.confirmation === 'confirmed' && args.shipping !== 'not_shipped';
  const isDelivered = args.shipping === 'delivered';
  const isReturned = args.shipping === 'returned';

  // Random verification outcome on a fraction of returned orders, leaving
  // some "awaiting verification" so the operations card has something to
  // show.
  let returnOutcome: ReturnOutcome | null = null;
  let returnVerifiedAt: Date | null = null;
  if (isReturned) {
    const r = Math.random();
    if (r < 0.5) {
      returnOutcome = 'good';
      returnVerifiedAt = new Date(transitionAt.getTime() + 48 * 3600 * 1000);
    } else if (r < 0.8) {
      returnOutcome = 'damaged';
      returnVerifiedAt = new Date(transitionAt.getTime() + 48 * 3600 * 1000);
    }
    // else: leave null — "awaiting verification" bucket on the dashboard.
  }

  const labelSentAt =
    isShipped && args.shipping !== 'not_shipped'
      ? new Date(transitionAt.getTime() + randInt(1, 12) * 3600 * 1000)
      : null;
  const deliveredAt = isDelivered
    ? new Date((labelSentAt ?? transitionAt).getTime() + randInt(24, 72) * 3600 * 1000)
    : null;

  // Commission: 30% of delivered orders get marked paid; the rest sit in
  // the pending pool the "Commission unpaid" card surfaces.
  const commissionAmount = isDelivered ? Math.round(itemTotal * 0.05) : null;
  const commissionPaid = isDelivered && Math.random() < 0.3;

  await prisma.order.create({
    data: {
      reference: args.reference,
      source: args.source,
      customerId: args.customer.id,
      agentId: args.agent?.id ?? null,
      assignedAt: args.agent ? createdAt : null,
      confirmationStatus: args.confirmation,
      shippingStatus: args.shipping,
      subtotal: itemTotal,
      total,
      shippingPrice,
      confirmationNote: args.confirmation === 'callback' ? 'Client asked to be called back' : null,
      cancellationReason: args.confirmation === 'cancelled' ? 'Changed mind' : null,
      callbackAt:
        args.confirmation === 'callback'
          ? new Date(Date.now() + randInt(1, 48) * 3600 * 1000)
          : null,
      reportedAt:
        args.confirmation === 'reported'
          ? new Date(Date.now() + randInt(48, 7 * 24) * 3600 * 1000)
          : null,
      confirmedAt: setConfirm && args.confirmation === 'confirmed' ? transitionAt : null,
      cancelledAt: args.confirmation === 'cancelled' ? transitionAt : null,
      unreachableAt: args.confirmation === 'unreachable' ? transitionAt : null,
      unreachableCount: args.confirmation === 'unreachable' ? randInt(1, 5) : 0,
      labelSent: isShipped,
      labelSentAt,
      deliveredAt,
      commissionAmount,
      commissionPaid,
      commissionPaidAt: commissionPaid && deliveredAt
        ? new Date(deliveredAt.getTime() + randInt(1, 14) * 24 * 3600 * 1000)
        : null,
      returnOutcome,
      returnVerifiedAt,
      isArchived: !!args.mergedIntoId,
      mergedIntoId: args.mergedIntoId,
      createdAt,
      updatedAt: deliveredAt ?? labelSentAt ?? transitionAt ?? createdAt,
      items: {
        create: {
          variantId: variant.id,
          quantity,
          unitPrice,
          total: itemTotal,
        },
      },
    },
  });
}

async function seedOrders(
  customers: { id: string; city: string }[],
  agents: { id: string; name: string }[],
  products: { id: string; basePrice: number; variants: { id: string; price: number }[] }[],
) {
  const TOTAL = 80;
  const confirmationPlan = pickByDistribution(CONFIRMATION_DISTRIBUTION, TOTAL);
  const shippingPlan = pickByDistribution(SHIPPING_DISTRIBUTION, 44); // only confirmed get shipped
  let shippingIdx = 0;

  const year = new Date().getFullYear();
  let seq = 1;

  // Spread orders across the last 14 days so the trend chart fills out.
  for (let i = 0; i < TOTAL; i++) {
    const customer = customers[i % customers.length];
    const agent = i % 12 === 0 ? null : agents[i % agents.length]; // ~8% unassigned
    const product = rand(products);
    const confirmation = confirmationPlan[i];
    const shipping: ShippingStatus =
      confirmation === 'confirmed' ? shippingPlan[shippingIdx++] ?? 'not_shipped' : 'not_shipped';
    const daysSince = randInt(0, 13);
    const source = rand(SOURCES);

    await createOrder({
      customer,
      agent,
      product,
      confirmation,
      shipping,
      reference: nextRef(year, seq++),
      daysSinceCreated: daysSince,
      source,
    });
  }

  // Plus 4 extra "merged duplicates" so the merged-orders card has volume.
  // Pattern: create a keeper + 1 archived merged-into-keeper. Both share
  // the same customer phone so they look like a real duplicate scenario.
  for (let i = 0; i < 4; i++) {
    const customer = customers[(TOTAL + i) % customers.length];
    const agent = agents[i % agents.length];
    const product = rand(products);
    const keeperRef = nextRef(year, seq++);
    const dupRef = nextRef(year, seq++);

    await createOrder({
      customer,
      agent,
      product,
      confirmation: 'pending',
      shipping: 'not_shipped',
      reference: keeperRef,
      daysSinceCreated: randInt(0, 7),
      source: rand(SOURCES),
    });
    const keeper = await prisma.order.findUnique({ where: { reference: keeperRef } });
    if (!keeper) continue;
    await createOrder({
      customer,
      agent,
      product,
      confirmation: 'pending',
      shipping: 'not_shipped',
      reference: dupRef,
      daysSinceCreated: randInt(0, 6),
      source: rand(SOURCES),
      mergedIntoId: keeper.id,
    });
  }

  console.log(`✅ ${TOTAL} orders + 4 merged duplicates`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Seeding test data...\n');

  await wipePrevious();
  await ensureCities();
  const agents = await ensureAgents();
  const products = await seedProducts();
  const customers = await seedCustomers(50);
  await seedOrders(customers, agents, products);

  console.log('\n🎉 Test data ready.');
  console.log('   Login: admin@anaqatoki.ma / admin123');
  console.log('   Or any agent: <name>@anaqatoki.ma / agent123\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
