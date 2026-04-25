import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';

/**
 * The route to send a user to after login (or as a redirect target when a
 * PermissionGuard denies access). Walked top-down — the first permission the
 * user actually owns wins, so each role lands on a page they can see:
 *   admin / supervisor → Dashboard
 *   agent              → Call Center
 *   shipping           → Orders
 *   atelie             → Atelie tasks
 *   production-only    → Production dashboard
 *
 * Falls back to LOGIN if the user has no permissions at all (which only
 * happens for an unauthenticated caller — AuthGuard kicks those to /login
 * before this code is reached, but we keep the fallback for safety).
 */
export function getLandingRoute(hasPermission: (p: string) => boolean): string {
  if (hasPermission(PERMISSIONS.DASHBOARD_VIEW))     return ROUTES.DASHBOARD;
  if (hasPermission(PERMISSIONS.CALL_CENTER_VIEW))   return ROUTES.CALL_CENTER;
  if (hasPermission(PERMISSIONS.ORDERS_VIEW))        return ROUTES.ORDERS;
  if (hasPermission(PERMISSIONS.ATELIE_VIEW))        return ROUTES.ATELIE_TASKS;
  if (hasPermission(PERMISSIONS.PRODUCTION_VIEW))    return ROUTES.PRODUCTION_DASHBOARD;
  if (hasPermission(PERMISSIONS.RETURNS_VERIFY))     return ROUTES.RETURNS;
  if (hasPermission(PERMISSIONS.PRODUCTS_VIEW))      return ROUTES.PRODUCTS_LIST;
  if (hasPermission(PERMISSIONS.MONEY_VIEW))         return ROUTES.MONEY;
  if (hasPermission(PERMISSIONS.ANALYTICS_VIEW))     return ROUTES.ANALYTICS;
  if (hasPermission(PERMISSIONS.TEAM_VIEW))          return ROUTES.TEAM_AGENTS;
  if (hasPermission(PERMISSIONS.INTEGRATIONS_VIEW))  return ROUTES.INTEGRATIONS_STORE;
  if (hasPermission(PERMISSIONS.AUTOMATION_VIEW))    return ROUTES.AUTOMATION;
  if (hasPermission(PERMISSIONS.SETTINGS_VIEW))      return ROUTES.SETTINGS;
  return ROUTES.LOGIN;
}
