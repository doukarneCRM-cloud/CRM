export const PERMISSIONS = {
  // Orders
  ORDERS_VIEW: 'orders:view',
  ORDERS_CREATE: 'orders:create',
  ORDERS_EDIT: 'orders:edit',
  ORDERS_DELETE: 'orders:delete',
  ORDERS_EXPORT: 'orders:export',
  ORDERS_ASSIGN: 'orders:assign',

  // Confirmation
  CONFIRMATION_VIEW: 'confirmation:view',
  CONFIRMATION_UPDATE_STATUS: 'confirmation:update_status',
  CONFIRMATION_ADD_NOTE: 'confirmation:add_note',

  // Shipping
  SHIPPING_VIEW: 'shipping:view',
  SHIPPING_PUSH: 'shipping:push',
  SHIPPING_RETURN_VALIDATE: 'shipping:return_validate',

  // Products
  PRODUCTS_VIEW: 'products:view',
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_EDIT: 'products:edit',
  PRODUCTS_DELETE: 'products:delete',
  STOCK_ADJUST: 'stock:adjust',

  // Clients
  CLIENTS_VIEW: 'clients:view',
  CLIENTS_EDIT: 'clients:edit',
  CLIENTS_DELETE: 'clients:delete',

  // Team
  TEAM_VIEW: 'team:view',
  TEAM_CREATE: 'team:create',
  TEAM_EDIT: 'team:edit',
  TEAM_DELETE: 'team:delete',
  TEAM_MANAGE_ROLES: 'team:manage_roles',

  // Analytics
  ANALYTICS_VIEW: 'analytics:view',

  // Dashboard
  DASHBOARD_VIEW: 'dashboard:view',

  // Integrations
  INTEGRATIONS_VIEW: 'integrations:view',
  INTEGRATIONS_MANAGE: 'integrations:manage',

  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_EDIT: 'settings:edit',

  // Atelie
  ATELIE_VIEW: 'atelie:view',
  ATELIE_MANAGE: 'atelie:manage',
  ATELIE_FABRIC_VIEW: 'atelie:fabric:view',
  ATELIE_FABRIC_MANAGE: 'atelie:fabric:manage',
  ATELIE_TESTS_VIEW: 'atelie:tests:view',
  ATELIE_TESTS_MANAGE: 'atelie:tests:manage',
  ATELIE_TESTS_VIEW_VIDEO: 'atelie:tests:view_video',

  // Production
  PRODUCTION_VIEW: 'production:view',
  PRODUCTION_MANAGE: 'production:manage',
  PRODUCTION_FINISH: 'production:finish',
  PRODUCTION_COST_VIEW: 'production:cost:view',

  // Call Center
  CALL_CENTER_VIEW: 'call_center:view',

  // Money
  MONEY_VIEW: 'money:view',
  MONEY_MANAGE: 'money:manage',

  // Returns
  RETURNS_VERIFY: 'returns:verify',

  // Automation
  AUTOMATION_VIEW: 'automation:view',
  AUTOMATION_MANAGE: 'automation:manage',
  AUTOMATION_MONITOR: 'automation:monitor',
  WHATSAPP_VIEW: 'whatsapp:view',
  WHATSAPP_CONNECT: 'whatsapp:connect',

  // Broadcasts (admin push notifications)
  BROADCASTS_MANAGE: 'broadcasts:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Expected permission set per role. Source of truth is the DB (seeded from
// these lists); the frontend consults this map for the role-summary UI and as
// a safety net when a user has no permissions attached yet.
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: Object.values(PERMISSIONS) as Permission[],
  supervisor: [
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.ORDERS_EDIT,
    PERMISSIONS.ORDERS_ASSIGN,
    PERMISSIONS.ORDERS_EXPORT,
    PERMISSIONS.CONFIRMATION_VIEW,
    PERMISSIONS.CONFIRMATION_UPDATE_STATUS,
    PERMISSIONS.CONFIRMATION_ADD_NOTE,
    PERMISSIONS.SHIPPING_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.CLIENTS_VIEW,
    PERMISSIONS.CLIENTS_EDIT,
    PERMISSIONS.TEAM_VIEW,
    PERMISSIONS.ANALYTICS_VIEW,
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.CALL_CENTER_VIEW,
    PERMISSIONS.MONEY_VIEW,
    PERMISSIONS.RETURNS_VERIFY,
    PERMISSIONS.AUTOMATION_VIEW,
    PERMISSIONS.AUTOMATION_MONITOR,
    PERMISSIONS.WHATSAPP_VIEW,
  ],
  agent: [
    PERMISSIONS.CALL_CENTER_VIEW,
    PERMISSIONS.CONFIRMATION_VIEW,
    PERMISSIONS.CONFIRMATION_UPDATE_STATUS,
    PERMISSIONS.CONFIRMATION_ADD_NOTE,
    PERMISSIONS.PRODUCTS_VIEW,
    // Pair their personal WhatsApp from the Sessions tab. Doesn't grant
    // access to the admin session list (whatsapp:view).
    PERMISSIONS.WHATSAPP_CONNECT,
  ],
  shipping: [
    PERMISSIONS.SHIPPING_VIEW,
    PERMISSIONS.SHIPPING_PUSH,
    PERMISSIONS.SHIPPING_RETURN_VALIDATE,
    PERMISSIONS.ORDERS_VIEW,
    PERMISSIONS.PRODUCTS_VIEW,
    PERMISSIONS.RETURNS_VERIFY,
  ],
  atelie: [
    PERMISSIONS.ATELIE_VIEW,
    PERMISSIONS.ATELIE_MANAGE,
    PERMISSIONS.ATELIE_FABRIC_VIEW,
    PERMISSIONS.ATELIE_FABRIC_MANAGE,
    PERMISSIONS.ATELIE_TESTS_VIEW,
    PERMISSIONS.ATELIE_TESTS_MANAGE,
    PERMISSIONS.PRODUCTION_VIEW,
    PERMISSIONS.PRODUCTION_MANAGE,
  ],
};

export function expectedPermissionsForRole(roleName: string): Permission[] {
  return ROLE_PERMISSIONS[roleName.toLowerCase()] ?? [];
}
