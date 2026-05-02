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
];

// Older test seeds created amina+karim — when we re-seed, deactivate
// them rather than delete (their order history may have been mutated by
// the user). They no longer get new orders assigned to them.
const RETIRED_TEST_AGENT_EMAILS = ['amina@anaqatoki.ma', 'karim@anaqatoki.ma'];

const CUSTOMER_FIRST_NAMES = [
  'Mohamed', 'Aicha', 'Omar', 'Salma', 'Hassan', 'Zineb', 'Said', 'Nadia',
  'Ahmed', 'Lamia', 'Mehdi', 'Sara', 'Anas', 'Khadija', 'Younes', 'Hajar',
];
const CUSTOMER_LAST_NAMES = [
  'Alaoui', 'Bennani', 'Cherkaoui', 'Drissi', 'Fassi', 'Gharbi', 'Hassani',
  'Jebli', 'Kabbaj', 'Lahlou', 'Mansouri', 'Naciri', 'Ouazzani', 'Saidi',
];

const SOURCES: OrderSource[] = ['youcan', 'whatsapp', 'instagram', 'manual'];

// Per-agent order allocation. Each of 2 agents gets 50 orders broken
// down explicitly — replaces the old distribution-shuffle logic. Total
// across both agents: 100 orders.
//
// Per agent (50):
//   25 confirmed:
//      5 delivered          (terminal happy path)
//     10 shipped/in-flight  (mix of in_transit/picked_up/out_for_delivery)
//     10 confirmed-other    (not_shipped, pushed, returned, failed, reported)
//   25 other confirmation   (pending/callback/cancelled/unreachable/...)

const PER_AGENT = 50;
const CONFIRMED_PER_AGENT = 25;
const NON_CONFIRMED_PER_AGENT = 25;

// Within the 25 confirmed orders for each agent, exactly this shipping
// breakdown — sums to 25.
const PER_AGENT_SHIPPING: Array<[ShippingStatus, number]> = [
  ['delivered',         5],   // user spec: 5 delivered
  ['in_transit',        4],   // user spec: 10 shipped (in-flight) ↓
  ['picked_up',         3],
  ['out_for_delivery',  3],   // 4+3+3 = 10 ✓
  ['not_shipped',       4],   // user spec: 10 "other status" on confirmed ↓
  ['pushed',            3],
  ['returned',          2],
  ['failed_delivery',   1],
  ['reported',          0],   // 4+3+2+1+0 = 10 ✓
];

// Within the 25 non-confirmed for each agent — sums to 25.
const PER_AGENT_NON_CONFIRMED: Array<[ConfirmationStatus, number]> = [
  ['pending',      6],
  ['callback',     5],
  ['unreachable',  4],
  ['cancelled',    4],
  ['reported',     3],
  ['out_of_stock', 2],
  ['fake',         1],
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

  // Retire old test agents from previous seeds (amina, karim) — leave the
  // user rows in place since their commission/order history may still be
  // referenced, just deactivate so they no longer take new assignments
  // and disappear from the active agent picker.
  const retired = await prisma.user.updateMany({
    where: { email: { in: RETIRED_TEST_AGENT_EMAILS } },
    data: { isActive: false },
  });
  if (retired.count > 0) {
    console.log(`🪦 Deactivated ${retired.count} retired test agents (${RETIRED_TEST_AGENT_EMAILS.join(', ')})`);
  }
}

// ─── Commission rules — flat 10 MAD per delivered ───────────────────────────
//
// Two CommissionRule rows per agent (type 'onConfirm' = 0, 'onDeliver' = 10).
// commission.service.ts adds them together to derive perOrderRate. Wiping
// existing rules first keeps the seed idempotent across re-runs.
async function setupCommissionRules(agents: { id: string; name: string }[]) {
  for (const a of agents) {
    await prisma.commissionRule.deleteMany({ where: { agentId: a.id } });
    await prisma.commissionRule.createMany({
      data: [
        { agentId: a.id, type: 'onConfirm', value: 0 },
        { agentId: a.id, type: 'onDeliver', value: 10 },
      ],
    });
  }
  console.log(`✅ Commission rules set: 10 MAD per delivered for ${agents.length} agents`);
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

  // Commission: flat 10 MAD per delivered order (matches the per-agent
  // CommissionRule we set in setupCommissionRules). 30% pre-paid so the
  // "Commission unpaid" card has both buckets to display.
  const commissionAmount = isDelivered ? 10 : null;
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
  if (agents.length < 2) throw new Error('Need at least 2 agents for the per-agent split');

  const year = new Date().getFullYear();
  // Start sequence ABOVE the highest existing reference so we never
  // collide with manual orders the user created between seed runs.
  // Old refs are like 'ORD-26-00012' — we strip prefix + parse.
  const maxRef = await prisma.order.findFirst({
    where: { reference: { startsWith: `ORD-${String(year).slice(-2)}-` } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const seqStart = maxRef
    ? Number(maxRef.reference.split('-').pop() ?? 0) + 1
    : 1;
  let seq = seqStart;
  let custIdx = 0;
  let totalCreated = 0;
  console.log(`   (sequence starts at ${seqStart} to avoid colliding with existing orders)`);

  // Per-agent: deterministic 50 orders each — 25 confirmed + 25 not.
  for (const agent of agents) {
    // Build the explicit shipping plan for the 25 confirmed orders.
    const shippingPlan: ShippingStatus[] = [];
    for (const [s, n] of PER_AGENT_SHIPPING) for (let i = 0; i < n; i++) shippingPlan.push(s);
    // Shuffle so the dashboard daily-trend chart isn't lumpy by status.
    for (let i = shippingPlan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shippingPlan[i], shippingPlan[j]] = [shippingPlan[j], shippingPlan[i]];
    }

    const nonConfirmedPlan: ConfirmationStatus[] = [];
    for (const [c, n] of PER_AGENT_NON_CONFIRMED) for (let i = 0; i < n; i++) nonConfirmedPlan.push(c);
    for (let i = nonConfirmedPlan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nonConfirmedPlan[i], nonConfirmedPlan[j]] = [nonConfirmedPlan[j], nonConfirmedPlan[i]];
    }

    // 25 confirmed orders.
    for (let i = 0; i < CONFIRMED_PER_AGENT; i++) {
      const shipping = shippingPlan[i] ?? 'not_shipped';
      await createOrder({
        customer: customers[custIdx++ % customers.length],
        agent,
        product: rand(products),
        confirmation: 'confirmed',
        shipping,
        reference: nextRef(year, seq++),
        daysSinceCreated: randInt(0, 13),
        source: rand(SOURCES),
      });
      totalCreated++;
    }

    // 25 non-confirmed orders.
    for (let i = 0; i < NON_CONFIRMED_PER_AGENT; i++) {
      const confirmation = nonConfirmedPlan[i] ?? 'pending';
      await createOrder({
        customer: customers[custIdx++ % customers.length],
        agent,
        product: rand(products),
        confirmation,
        shipping: 'not_shipped',
        reference: nextRef(year, seq++),
        daysSinceCreated: randInt(0, 13),
        source: rand(SOURCES),
      });
      totalCreated++;
    }

    console.log(`   • ${agent.name}: ${PER_AGENT} orders (${CONFIRMED_PER_AGENT} confirmed)`);
  }

  console.log(`✅ ${totalCreated} orders across ${agents.length} agents`);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱 Seeding test data...\n');

  await wipePrevious();
  await ensureCities();
  const agents = await ensureAgents();
  await setupCommissionRules(agents);
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
