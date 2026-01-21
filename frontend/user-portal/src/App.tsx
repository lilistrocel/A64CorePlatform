import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { theme, GlobalStyles } from '@a64core/shared';
import { Login } from './pages/auth/Login';
import { Register } from './pages/auth/Register';
import { Dashboard } from './pages/dashboard/Dashboard';
import { Profile } from './pages/profile/Profile';
import { Settings } from './pages/settings/Settings';
import { FarmManager } from './pages/farm/FarmManager';
import { OperationsDashboard } from './pages/operations/OperationsDashboard';
import { FarmBlocksView } from './pages/operations/FarmBlocksView';
import { BlockTaskList } from './pages/operations/BlockTaskList';
import { AIAnalytics } from './pages/ai/AIAnalytics';
import { ClearCache } from './pages/debug/ClearCache';
import { InventoryDashboard } from './pages/inventory/InventoryDashboard';
import { CRMPage } from './pages/crm/CRMPage';
import { CustomerDetailPage } from './pages/crm/CustomerDetailPage';
import { HRDashboardPage } from './pages/hr/HRDashboardPage';
import { EmployeeListPage } from './pages/hr/EmployeeListPage';
import { EmployeeDetailPage } from './pages/hr/EmployeeDetailPage';
import { LogisticsDashboardPage } from './pages/logistics/LogisticsDashboardPage';
import { VehicleManagementPage } from './pages/logistics/VehicleManagementPage';
import { RouteManagementPage } from './pages/logistics/RouteManagementPage';
import { ShipmentTrackingPage } from './pages/logistics/ShipmentTrackingPage';
import { SalesDashboardPage } from './pages/sales/SalesDashboardPage';
import { SalesOrdersPage } from './pages/sales/SalesOrdersPage';
import { InventoryPage } from './pages/sales/InventoryPage';
import { PurchaseOrdersPage } from './pages/sales/PurchaseOrdersPage';
import { MarketingDashboardPage } from './pages/marketing/MarketingDashboardPage';
import { CampaignManagementPage } from './pages/marketing/CampaignManagementPage';
import { BudgetManagementPage } from './pages/marketing/BudgetManagementPage';
import { EventManagementPage } from './pages/marketing/EventManagementPage';
import { ChannelManagementPage } from './pages/marketing/ChannelManagementPage';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyles />
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
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
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
