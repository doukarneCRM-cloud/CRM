export const ROUTES = {
  // Auth
  LOGIN: '/login',

  // Dashboard
  DASHBOARD: '/dashboard',

  // Orders
  ORDERS: '/orders',

  // Call Center
  CALL_CENTER: '/call-center',

  // Products
  PRODUCTS_LIST: '/products/list',
  PRODUCTS_STOCK: '/products/stock',

  // Clients
  CLIENTS: '/clients',

  // Team
  TEAM_AGENTS: '/team/agents',
  TEAM_ROLES: '/team/roles',
  TEAM_ASSIGNMENT: '/team/assignment',
  TEAM_BROADCASTS: '/team/broadcasts',

  // Analytics
  ANALYTICS: '/analytics',

  // Money
  MONEY: '/money',

  // Returns
  RETURNS: '/returns',
  RETURNS_PHONE_SCAN: '/returns/phone-scan',

  // Integrations
  INTEGRATIONS_STORE: '/integrations/store',
  INTEGRATIONS_STORE_CALLBACK: '/integrations/store/callback',
  INTEGRATIONS_SHIPPING: '/integrations/shipping',

  // Atelie
  ATELIE_EMPLOYEES: '/atelie/employees',
  ATELIE_SALARY: '/atelie/salary',
  ATELIE_STOCK: '/atelie/stock',
  ATELIE_TASKS: '/atelie/tasks',

  // Production
  PRODUCTION_DASHBOARD: '/production',
  PRODUCTION_TESTS: '/production/tests',
  PRODUCTION_TEST_DETAIL: '/production/tests/:id',
  PRODUCTION_RUNS: '/production/runs',
  PRODUCTION_RUN_DETAIL: '/production/runs/:id',
  PRODUCTION_WEEKS: '/production/weeks',
  PRODUCTION_WEEK_DETAIL: '/production/weeks/:weekStart',

  // Automation
  AUTOMATION: '/automation',

  // Settings
  SETTINGS: '/settings',

  // Dev
  DEV_COMPONENTS: '/dev/components',
} as const;

export type Route = (typeof ROUTES)[keyof typeof ROUTES];
