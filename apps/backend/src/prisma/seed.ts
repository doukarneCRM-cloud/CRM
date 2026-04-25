import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ALL_PERMISSIONS = [
  { key: 'orders:view', label: 'View Orders' },
  { key: 'orders:create', label: 'Create Orders' },
  { key: 'orders:edit', label: 'Edit Orders' },
  { key: 'orders:delete', label: 'Delete Orders' },
  { key: 'orders:export', label: 'Export Orders' },
  { key: 'orders:assign', label: 'Assign Orders' },
  { key: 'confirmation:view', label: 'View Confirmation' },
  { key: 'confirmation:update_status', label: 'Update Confirmation Status' },
  { key: 'confirmation:add_note', label: 'Add Confirmation Note' },
  { key: 'shipping:view', label: 'View Shipping' },
  { key: 'shipping:push', label: 'Push to Shipping' },
  { key: 'shipping:return_validate', label: 'Validate Return' },
  { key: 'products:view', label: 'View Products' },
  { key: 'products:create', label: 'Create Products' },
  { key: 'products:edit', label: 'Edit Products' },
  { key: 'products:delete', label: 'Delete Products' },
  { key: 'stock:adjust', label: 'Adjust Stock' },
  { key: 'clients:view', label: 'View Clients' },
  { key: 'clients:edit', label: 'Edit Clients' },
  { key: 'clients:delete', label: 'Delete Clients' },
  { key: 'team:view', label: 'View Team' },
  { key: 'team:create', label: 'Create Team Members' },
  { key: 'team:edit', label: 'Edit Team Members' },
  { key: 'team:delete', label: 'Delete Team Members' },
  { key: 'team:manage_roles', label: 'Manage Roles' },
  { key: 'analytics:view', label: 'View Analytics' },
  { key: 'dashboard:view', label: 'View Dashboard' },
  { key: 'integrations:view', label: 'View Integrations' },
  { key: 'integrations:manage', label: 'Manage Integrations' },
  { key: 'settings:view', label: 'View Settings' },
  { key: 'settings:edit', label: 'Edit Settings' },
  { key: 'atelie:view', label: 'View Atelie' },
  { key: 'atelie:manage', label: 'Manage Atelie' },
  { key: 'atelie:fabric:view', label: 'View Fabric Rolls' },
  { key: 'atelie:fabric:manage', label: 'Manage Fabric Rolls' },
  { key: 'atelie:tests:view', label: 'View Product Tests' },
  { key: 'atelie:tests:manage', label: 'Manage Product Tests' },
  { key: 'atelie:tests:view_video', label: 'View Product Test Video' },
  { key: 'production:view', label: 'View Production Runs' },
  { key: 'production:manage', label: 'Manage Production Runs' },
  { key: 'production:finish', label: 'Finish Production Runs (locks cost)' },
  { key: 'production:cost:view', label: 'View Production Cost Breakdown' },
  { key: 'call_center:view', label: 'View Call Center' },
  { key: 'money:view', label: 'View Money' },
  { key: 'money:manage', label: 'Manage Money (record payments, mark paid)' },
  { key: 'returns:verify', label: 'Verify Physical Returns' },
  { key: 'automation:view', label: 'View Automation Board' },
  { key: 'automation:manage', label: 'Manage Automation Templates' },
  { key: 'whatsapp:view', label: 'View WhatsApp Sessions' },
  { key: 'whatsapp:connect', label: 'Connect WhatsApp Sessions (QR)' },
  { key: 'shipping_groups:manage', label: 'Manage Shipping Status Groups' },
  { key: 'broadcasts:manage', label: 'Manage Push Notifications' },
];

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  admin: ALL_PERMISSIONS.map((p) => p.key),
  supervisor: [
    'orders:view', 'orders:edit', 'orders:assign', 'orders:export',
    'confirmation:view', 'confirmation:update_status', 'confirmation:add_note',
    'shipping:view', 'products:view', 'clients:view',
    'team:view', 'analytics:view', 'dashboard:view', 'call_center:view',
    'money:view', 'returns:verify',
  ],
  agent: [
    'call_center:view', 'confirmation:view', 'confirmation:update_status',
    'confirmation:add_note', 'products:view',
    // Agents may pair their personal WhatsApp via the Sessions tab. Grants
    // access to the focused self-view in SessionsTab — no admin-level
    // session list (whatsapp:view) included.
    'whatsapp:connect',
  ],
  shipping: [
    'shipping:view', 'shipping:push', 'shipping:return_validate',
    'orders:view', 'products:view', 'returns:verify',
  ],
  atelie: [
    'atelie:view',
    'atelie:manage',
    'atelie:fabric:view',
    'atelie:fabric:manage',
    'atelie:tests:view',
    'atelie:tests:manage',
    'production:view',
    'production:manage',
  ],
};

const ROLES = [
  { name: 'admin', label: 'Administrator' },
  { name: 'supervisor', label: 'Supervisor' },
  { name: 'agent', label: 'Confirmation Agent' },
  { name: 'shipping', label: 'Shipping Agent' },
  { name: 'atelie', label: 'Atelie Staff' },
];

async function main() {
  console.log('🌱 Seeding database...');

  // ── Permissions ────────────────────────────────────────────────────────
  for (const perm of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { label: perm.label },
      create: perm,
    });
  }
  console.log(`✅ ${ALL_PERMISSIONS.length} permissions seeded`);

  // ── Roles ──────────────────────────────────────────────────────────────
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { label: role.label },
      create: role,
    });
  }
  console.log(`✅ ${ROLES.length} roles seeded`);

  // ── Role-Permission links ──────────────────────────────────────────────
  for (const [roleName, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;

    for (const key of permKeys) {
      const perm = await prisma.permission.findUnique({ where: { key } });
      if (!perm) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        update: {},
        create: { roleId: role.id, permissionId: perm.id },
      });
    }
  }
  console.log('✅ Role-permission links seeded');

  // ── Admin user ─────────────────────────────────────────────────────────
  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) throw new Error('Admin role not found');

  const passwordHash = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { email: 'admin@anaqatoki.ma' },
    update: {},
    create: {
      email: 'admin@anaqatoki.ma',
      name: 'Admin User',
      passwordHash,
      roleId: adminRole.id,
      isActive: true,
    },
  });
  console.log('✅ Admin user seeded (admin@anaqatoki.ma / admin123)');

  // ── Default assignment rule ────────────────────────────────────────────
  const existing = await prisma.assignmentRule.findFirst();
  if (!existing) {
    await prisma.assignmentRule.create({
      data: { name: 'Round Robin Default', priority: 0, isActive: true },
    });
    console.log('✅ Default assignment rule seeded');
  }

  // ── Default settings ───────────────────────────────────────────────────
  const defaults = [
    { key: 'currency', value: 'MAD' },
    { key: 'orderSound', value: 'true' },
    { key: 'callbackSound', value: 'true' },
  ];
  for (const s of defaults) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log('✅ Default settings seeded');

  console.log('\n🎉 Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
