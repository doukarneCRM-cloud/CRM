import { prisma } from './prisma';
import { getCachedRbac, setCachedRbac } from './redis';
import type { JwtPayload } from './jwt';

/**
 * Returns the actor's display name for order logs. Reads from the RBAC cache
 * first (warm on every authed request), falls back to a single DB hit that
 * also populates the cache, finally falls back to the JWT email.
 */
export async function getActorName(actor: JwtPayload): Promise<string> {
  const cached = await getCachedRbac(actor.sub);
  if (cached?.name) return cached.name;

  const user = await prisma.user.findUnique({
    where: { id: actor.sub },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user) return actor.email;

  await setCachedRbac(actor.sub, {
    isActive: user.isActive,
    roleId: user.roleId,
    roleName: user.role.name,
    name: user.name,
    email: user.email,
    permissions: user.role.permissions.map((rp) => rp.permission.key),
  });

  return user.name;
}
