import { Routes, Route, Navigate } from 'react-router-dom';
import { ROUTES } from '@/constants/routes';
import { PERMISSIONS } from '@/constants/permissions';

// Guards & Layout
import { AuthGuard } from '@/app/guards/AuthGuard';
import { PermissionGuard } from '@/app/guards/PermissionGuard';
import AppLayout from '@/app/AppLayout';

// Auth pages
import LoginPage from '@/pages/auth/LoginPage';

// App pages
import DashboardPage from '@/pages/dashboard/DashboardPage';
import OrdersPage from '@/pages/orders/OrdersPage';
import CallCenterPage from '@/pages/call-center/CallCenterPage';
import ProductsListPage from '@/pages/products/ProductsListPage';
import StockMatrixPage from '@/pages/products/StockMatrixPage';
import ClientsPage from '@/pages/clients/ClientsPage';
import AgentsPage from '@/pages/team/AgentsPage';
import RolesPage from '@/pages/team/RolesPage';
import AssignmentPage from '@/pages/team/AssignmentPage';
import BroadcastsPage from '@/pages/team/BroadcastsPage';
import AnalyticsPage from '@/pages/analytics/AnalyticsPage';
import MoneyPage from '@/pages/money/MoneyPage';
import ReturnsPage from '@/pages/returns/ReturnsPage';
import PhoneScanPage from '@/pages/returns/PhoneScanPage';
import IntegrationsPage from '@/pages/integrations/IntegrationsPage';
import OAuthCallbackPage from '@/pages/integrations/OAuthCallbackPage';
import AteliePage from '@/pages/atelie/AteliePage';
import ProductionDashboardPage from '@/pages/production/ProductionDashboardPage';
import ProductTestsListPage from '@/pages/production/ProductTestsListPage';
import ProductTestDetailPage from '@/pages/production/ProductTestDetailPage';
import ProductionRunsListPage from '@/pages/production/ProductionRunsListPage';
import ProductionRunDetailPage from '@/pages/production/ProductionRunDetailPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import AutomationPage from '@/pages/automation/AutomationPage';

// Dev
import ComponentsPage from '@/pages/dev/ComponentsPage';

export default function App() {
  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────────── */}
      <Route path={ROUTES.LOGIN} element={<LoginPage />} />
      <Route path={ROUTES.DEV_COMPONENTS} element={<ComponentsPage />} />
      {/* OAuth popup callback — no layout, auth is handled via axios + api service */}
      <Route path={ROUTES.INTEGRATIONS_STORE_CALLBACK} element={<OAuthCallbackPage />} />

      {/* ── Authenticated ───────────────────────────────────────────────── */}
      <Route element={<AuthGuard />}>
        {/* Phone-side scanner — no sidebar, fullscreen mobile-first UI */}
        <Route
          path={ROUTES.RETURNS_PHONE_SCAN}
          element={
            <PermissionGuard requires={PERMISSIONS.RETURNS_VERIFY}>
              <PhoneScanPage />
            </PermissionGuard>
          }
        />

        <Route element={<AppLayout />}>

          <Route
            path={ROUTES.DASHBOARD}
            element={
              <PermissionGuard requires={PERMISSIONS.DASHBOARD_VIEW}>
                <DashboardPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.ORDERS}
            element={
              <PermissionGuard requires={PERMISSIONS.ORDERS_VIEW}>
                <OrdersPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.CALL_CENTER}
            element={
              <PermissionGuard requires={PERMISSIONS.CALL_CENTER_VIEW}>
                <CallCenterPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.PRODUCTS_LIST}
            element={
              <PermissionGuard requires={PERMISSIONS.PRODUCTS_VIEW}>
                <ProductsListPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.PRODUCTS_STOCK}
            element={
              <PermissionGuard requires={PERMISSIONS.PRODUCTS_VIEW}>
                <StockMatrixPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.CLIENTS}
            element={
              <PermissionGuard requires={PERMISSIONS.CLIENTS_VIEW}>
                <ClientsPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.TEAM_AGENTS}
            element={
              <PermissionGuard requires={PERMISSIONS.TEAM_VIEW}>
                <AgentsPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.TEAM_ROLES}
            element={
              <PermissionGuard requires={PERMISSIONS.TEAM_VIEW}>
                <RolesPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.TEAM_ASSIGNMENT}
            element={
              <PermissionGuard requires={PERMISSIONS.TEAM_VIEW}>
                <AssignmentPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.TEAM_BROADCASTS}
            element={
              <PermissionGuard requires={PERMISSIONS.BROADCASTS_MANAGE}>
                <BroadcastsPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.ANALYTICS}
            element={
              <PermissionGuard requires={PERMISSIONS.ANALYTICS_VIEW}>
                <AnalyticsPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.MONEY}
            element={
              <PermissionGuard requires={PERMISSIONS.MONEY_VIEW}>
                <MoneyPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.RETURNS}
            element={
              <PermissionGuard requires={PERMISSIONS.RETURNS_VERIFY}>
                <ReturnsPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.INTEGRATIONS_STORE}
            element={
              <PermissionGuard requires={PERMISSIONS.INTEGRATIONS_VIEW}>
                <IntegrationsPage />
              </PermissionGuard>
            }
          />

          {[
            ROUTES.ATELIE_EMPLOYEES,
            ROUTES.ATELIE_SALARY,
            ROUTES.ATELIE_STOCK,
            ROUTES.ATELIE_TASKS,
          ].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                <PermissionGuard requires={PERMISSIONS.ATELIE_VIEW}>
                  <AteliePage />
                </PermissionGuard>
              }
            />
          ))}

          <Route
            path={ROUTES.PRODUCTION_DASHBOARD}
            element={
              <PermissionGuard requires={PERMISSIONS.PRODUCTION_VIEW}>
                <ProductionDashboardPage />
              </PermissionGuard>
            }
          />
          <Route
            path={ROUTES.PRODUCTION_TESTS}
            element={
              <PermissionGuard requires={PERMISSIONS.ATELIE_TESTS_VIEW}>
                <ProductTestsListPage />
              </PermissionGuard>
            }
          />
          <Route
            path={ROUTES.PRODUCTION_TEST_DETAIL}
            element={
              <PermissionGuard requires={PERMISSIONS.ATELIE_TESTS_VIEW}>
                <ProductTestDetailPage />
              </PermissionGuard>
            }
          />
          <Route
            path={ROUTES.PRODUCTION_RUNS}
            element={
              <PermissionGuard requires={PERMISSIONS.PRODUCTION_VIEW}>
                <ProductionRunsListPage />
              </PermissionGuard>
            }
          />
          <Route
            path={ROUTES.PRODUCTION_RUN_DETAIL}
            element={
              <PermissionGuard requires={PERMISSIONS.PRODUCTION_VIEW}>
                <ProductionRunDetailPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.AUTOMATION}
            element={
              <PermissionGuard requires={PERMISSIONS.AUTOMATION_VIEW}>
                <AutomationPage />
              </PermissionGuard>
            }
          />

          <Route
            path={ROUTES.SETTINGS}
            element={
              <PermissionGuard requires={PERMISSIONS.SETTINGS_VIEW}>
                <SettingsPage />
              </PermissionGuard>
            }
          />

          {/* Default inside app → dashboard */}
          <Route index element={<Navigate to={ROUTES.DASHBOARD} replace />} />
        </Route>
      </Route>

      {/* ── Fallback ────────────────────────────────────────────────────── */}
      <Route path="/" element={<Navigate to={ROUTES.DASHBOARD} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
    </Routes>
  );
}
