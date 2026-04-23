import { prisma } from './prisma';
import { invalidateRbacForUsers } from './redis';

// Permissions the seed file knows about. We mirror the list here so that
// deploys that never re-run the seed still pick up new permission keys and
// grant them to the admin role. Keep in sync with prisma/seed.ts ALL_PERMISSIONS.
const CANONICAL_PERMISSIONS: Array<{ key: string; label: string }> = [
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
  { key: 'settings:reset_crm', label: 'Reset Full CRM (destructive)' },
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
  { key: 'automation:monitor', label: 'Monitor Automation (admin overview, live feed)' },
  { key: 'whatsapp:view', label: 'View WhatsApp Sessions' },
  { key: 'whatsapp:connect', label: 'Connect WhatsApp Sessions (QR)' },
];

// Runs on every boot. Upserts every canonical permission, grants all of them
// to the admin role, then busts the Redis RBAC cache for all admin users so
// the next request reads fresh permissions from the DB. Safe to re-run: every
// step is idempotent.
export async function ensureAdminPermissions(): Promise<void> {
  for (const perm of CANONICAL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: { label: perm.label },
      create: perm,
    });
  }

  const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
  if (!adminRole) return;

  const allPerms = await prisma.permission.findMany({ select: { id: true, key: true } });
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id },
    });
  }

  const adminUsers = await prisma.user.findMany({
    where: { roleId: adminRole.id },
    select: { id: true },
  });
  await invalidateRbacForUsers(adminUsers.map((u) => u.id));
}
