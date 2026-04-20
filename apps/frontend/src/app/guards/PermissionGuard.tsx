import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { ROUTES } from '@/constants/routes';

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
    return <Navigate to={ROUTES.DASHBOARD} replace />;
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
