import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import { Suspense, lazy } from 'react';
import { theme, GlobalStyles } from '@a64core/shared';
import { queryClient } from './config/react-query.config';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import { UnsavedChangesDialog } from './components/common/UnsavedChangesDialog';

// Loading component for suspense fallback
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '1.2rem',
    color: '#666'
  }}>
    Loading...
  </div>
);

// Lazy load all page components for code splitting
// Auth pages (small, load immediately for login)
const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/auth/Register').then(m => ({ default: m.Register })));

// Core pages
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard').then(m => ({ default: m.Dashboard })));
const Profile = lazy(() => import('./pages/profile/Profile').then(m => ({ default: m.Profile })));
const Settings = lazy(() => import('./pages/settings/Settings').then(m => ({ default: m.Settings })));

// Farm module (heavy - maps and charts)
const FarmManager = lazy(() => import('./pages/farm/FarmManager').then(m => ({ default: m.FarmManager })));

// Operations module
const OperationsDashboard = lazy(() => import('./pages/operations/OperationsDashboard').then(m => ({ default: m.OperationsDashboard })));
const FarmBlocksView = lazy(() => import('./pages/operations/FarmBlocksView').then(m => ({ default: m.FarmBlocksView })));
const BlockTaskList = lazy(() => import('./pages/operations/BlockTaskList').then(m => ({ default: m.BlockTaskList })));

// AI Analytics (loads Gemini client)
const AIAnalytics = lazy(() => import('./pages/ai/AIAnalytics').then(m => ({ default: m.AIAnalytics })));

// Inventory module
const InventoryDashboard = lazy(() => import('./pages/inventory/InventoryDashboard').then(m => ({ default: m.InventoryDashboard })));

// CRM module
const CRMPage = lazy(() => import('./pages/crm/CRMPage').then(m => ({ default: m.CRMPage })));
const CustomerDetailPage = lazy(() => import('./pages/crm/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));

// HR module
const HRDashboardPage = lazy(() => import('./pages/hr/HRDashboardPage').then(m => ({ default: m.HRDashboardPage })));
const EmployeeListPage = lazy(() => import('./pages/hr/EmployeeListPage').then(m => ({ default: m.EmployeeListPage })));
const EmployeeDetailPage = lazy(() => import('./pages/hr/EmployeeDetailPage').then(m => ({ default: m.EmployeeDetailPage })));

// Logistics module
const LogisticsDashboardPage = lazy(() => import('./pages/logistics/LogisticsDashboardPage').then(m => ({ default: m.LogisticsDashboardPage })));
const VehicleManagementPage = lazy(() => import('./pages/logistics/VehicleManagementPage').then(m => ({ default: m.VehicleManagementPage })));
const RouteManagementPage = lazy(() => import('./pages/logistics/RouteManagementPage').then(m => ({ default: m.RouteManagementPage })));
const ShipmentTrackingPage = lazy(() => import('./pages/logistics/ShipmentTrackingPage').then(m => ({ default: m.ShipmentTrackingPage })));

// Sales module
const SalesDashboardPage = lazy(() => import('./pages/sales/SalesDashboardPage').then(m => ({ default: m.SalesDashboardPage })));
const SalesOrdersPage = lazy(() => import('./pages/sales/SalesOrdersPage').then(m => ({ default: m.SalesOrdersPage })));
const InventoryPage = lazy(() => import('./pages/sales/InventoryPage').then(m => ({ default: m.InventoryPage })));
const PurchaseOrdersPage = lazy(() => import('./pages/sales/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const ReturnsPage = lazy(() => import('./pages/sales/ReturnsPage').then(m => ({ default: m.ReturnsPage })));

// Waste Inventory (default export)
const WasteInventoryList = lazy(() => import('./pages/inventory/WasteInventoryList'));

// Marketing module
const MarketingDashboardPage = lazy(() => import('./pages/marketing/MarketingDashboardPage').then(m => ({ default: m.MarketingDashboardPage })));
const CampaignManagementPage = lazy(() => import('./pages/marketing/CampaignManagementPage').then(m => ({ default: m.CampaignManagementPage })));
const BudgetManagementPage = lazy(() => import('./pages/marketing/BudgetManagementPage').then(m => ({ default: m.BudgetManagementPage })));
const EventManagementPage = lazy(() => import('./pages/marketing/EventManagementPage').then(m => ({ default: m.EventManagementPage })));
const ChannelManagementPage = lazy(() => import('./pages/marketing/ChannelManagementPage').then(m => ({ default: m.ChannelManagementPage })));

// Debug pages
const ClearCache = lazy(() => import('./pages/debug/ClearCache').then(m => ({ default: m.ClearCache })));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <GlobalStyles />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
        <UnsavedChangesProvider>
        <UnsavedChangesDialog />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Debug routes (development only) */}
            <Route path="/debug/clear-cache" element={<ClearCache />} />

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              <Route element={<MainLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/farm/*" element={<FarmManager />} />
                <Route path="/operations" element={<OperationsDashboard />} />
                <Route path="/operations/:farmId" element={<FarmBlocksView />} />
                <Route path="/operations/:farmId/:blockId" element={<BlockTaskList />} />
                <Route path="/inventory/*" element={<InventoryDashboard />} />
                <Route path="/crm/customers" element={<CRMPage />} />
                <Route path="/crm/customers/:customerId" element={<CustomerDetailPage />} />
                <Route path="/hr" element={<HRDashboardPage />} />
                <Route path="/hr/employees" element={<EmployeeListPage />} />
                <Route path="/hr/employees/:employeeId" element={<EmployeeDetailPage />} />
                <Route path="/logistics" element={<LogisticsDashboardPage />} />
                <Route path="/logistics/vehicles" element={<VehicleManagementPage />} />
                <Route path="/logistics/routes" element={<RouteManagementPage />} />
                <Route path="/logistics/shipments" element={<ShipmentTrackingPage />} />
                <Route path="/sales" element={<SalesDashboardPage />} />
                <Route path="/sales/orders" element={<SalesOrdersPage />} />
                <Route path="/sales/inventory" element={<InventoryPage />} />
                <Route path="/sales/purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="/sales/returns" element={<ReturnsPage />} />
                <Route path="/inventory/waste" element={<WasteInventoryList />} />
                <Route path="/marketing" element={<MarketingDashboardPage />} />
                <Route path="/marketing/campaigns" element={<CampaignManagementPage />} />
                <Route path="/marketing/budgets" element={<BudgetManagementPage />} />
                <Route path="/marketing/events" element={<EventManagementPage />} />
                <Route path="/marketing/channels" element={<ChannelManagementPage />} />
                <Route path="/ai-analytics" element={<AIAnalytics />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
        </UnsavedChangesProvider>
      </BrowserRouter>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
