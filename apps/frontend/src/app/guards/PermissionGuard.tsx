import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { getLandingRoute } from '@/lib/landingRoute';

interface PermissionGuardProps {
  requires: string | string[];
  requireAll?: boolean; // true = must have ALL permissions, false = any one
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function PermissionGuard({
  requires,
  requireAll = false,
  children,
  fallback,
}: PermissionGuardProps) {
  const { hasPermission } = useAuthStore();

  const permissions = Array.isArray(requires) ? requires : [requires];

  const allowed = requireAll
    ? permissions.every((p) => hasPermission(p))
    : permissions.some((p) => hasPermission(p));

  if (!allowed) {
    if (fallback) return <>{fallback}</>;
    // Send the user to whatever page they CAN open — sending agents back to
    // the Dashboard creates a redirect loop because they lack `dashboard:view`.
    return <Navigate to={getLandingRoute(hasPermission)} replace />;
  }

  return <>{children}</>;
}

export function IfPermission({
  requires,
  children,
}: {
  requires: string;
  children: React.ReactNode;
}) {
  const { hasPermission } = useAuthStore();
  if (!hasPermission(requires)) return null;
  return <>{children}</>;
}
