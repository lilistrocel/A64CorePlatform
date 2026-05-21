import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'styled-components';
import { Suspense, lazy } from 'react';
import { lightTheme, darkTheme, GlobalStyles } from '@a64core/shared';
import { queryClient } from './config/react-query.config';
import { useThemeStore } from './stores/theme.store';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { MFAVerifyGuard, MFASetupGuard } from './components/common/MFARouteGuards';
import { MainLayout } from './components/layout/MainLayout';
import { UnsavedChangesProvider } from './contexts/UnsavedChangesContext';
import { UnsavedChangesDialog } from './components/common/UnsavedChangesDialog';
import { ToastContainer } from './components/common/ToastContainer';

// Loading component for suspense fallback
// Note: inline style color is a neutral gray; theme is not available outside ThemeProvider at this point
const PageLoader = () => (
  <div style={{
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontSize: '1.2rem',
    color: '#616161'
  }}>
    Loading...
  </div>
);

// Lazy load all page components for code splitting
// Auth pages (small, load immediately for login)
const Login = lazy(() => import('./pages/auth/Login').then(m => ({ default: m.Login })));
const Register = lazy(() => import('./pages/auth/Register').then(m => ({ default: m.Register })));
const MFASetupPage = lazy(() => import('./pages/auth/MFASetupPage').then(m => ({ default: m.MFASetupPage })));
const MFAVerifyPage = lazy(() => import('./pages/auth/MFAVerifyPage').then(m => ({ default: m.MFAVerifyPage })));

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

// AI Hub — full-screen, super admin only (replaces AI Analytics + AI Dashboard)
const AIHub = lazy(() => import('./pages/ai/AIHub').then(m => ({ default: m.AIHub })));

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
const StockPage = lazy(() => import('./pages/sales/StockPage').then(m => ({ default: m.StockPage })));
const PurchaseOrdersPage = lazy(() => import('./pages/sales/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const ReturnsPage = lazy(() => import('./pages/sales/ReturnsPage').then(m => ({ default: m.ReturnsPage })));

// Marketing module
const MarketingDashboardPage = lazy(() => import('./pages/marketing/MarketingDashboardPage').then(m => ({ default: m.MarketingDashboardPage })));
const CampaignManagementPage = lazy(() => import('./pages/marketing/CampaignManagementPage').then(m => ({ default: m.CampaignManagementPage })));
const BudgetManagementPage = lazy(() => import('./pages/marketing/BudgetManagementPage').then(m => ({ default: m.BudgetManagementPage })));
const EventManagementPage = lazy(() => import('./pages/marketing/EventManagementPage').then(m => ({ default: m.EventManagementPage })));
const ChannelManagementPage = lazy(() => import('./pages/marketing/ChannelManagementPage').then(m => ({ default: m.ChannelManagementPage })));

// Mushroom farming module pages
const MushroomDashboardPage = lazy(() =>
  import('./pages/mushroom/MushroomDashboardPage').then(m => ({ default: m.MushroomDashboardPage }))
);
const MushroomFacilityManager = lazy(() =>
  import('./pages/mushroom/MushroomFacilityManager').then(m => ({ default: m.MushroomFacilityManager }))
);
const MushroomStrainLibrary = lazy(() =>
  import('./pages/mushroom/MushroomStrainLibrary').then(m => ({ default: m.MushroomStrainLibrary }))
);
const MushroomRoomMonitor = lazy(() =>
  import('./pages/mushroom/MushroomRoomMonitor').then(m => ({ default: m.MushroomRoomMonitor }))
);

// Tools module (Fertilizer Cost Calculator + Chemicals Catalog)
const FertilizerCostCalculator = lazy(() =>
  import('./pages/tools/FertilizerCostCalculator').then(m => ({ default: m.FertilizerCostCalculator }))
);
const ChemicalsCatalog = lazy(() =>
  import('./pages/tools/ChemicalsCatalog').then(m => ({ default: m.ChemicalsCatalog }))
);

// Admin pages
const UserManagementPage = lazy(() => import('./pages/admin/UserManagementPage').then(m => ({ default: m.UserManagementPage })));
const TenantSetupWizardPage = lazy(() => import('./pages/admin/TenantSetupWizardPage').then(m => ({ default: m.TenantSetupWizardPage })));

// Finance module pages
const ChartOfAccountsPage = lazy(() =>
  import('./pages/finance/ChartOfAccountsPage').then(m => ({ default: m.ChartOfAccountsPage }))
);
const ApprovalRulesPage = lazy(() =>
  import('./pages/finance/ApprovalRulesPage').then(m => ({ default: m.ApprovalRulesPage }))
);
const PostingSetupPage = lazy(() =>
  import('./pages/finance/PostingSetupPage').then(m => ({ default: m.PostingSetupPage }))
);
const ItemMappingPage = lazy(() =>
  import('./pages/finance/ItemMappingPage').then(m => ({ default: m.ItemMappingPage }))
);
const IncomingPreviewPage = lazy(() =>
  import('./pages/finance/IncomingPreviewPage').then(m => ({ default: m.IncomingPreviewPage }))
);

// Purchasing module pages (Phase 1A master data)
const VendorsPage = lazy(() => import('./pages/purchasing/VendorsPage').then(m => ({ default: m.VendorsPage })));
const PurchaseItemsPage = lazy(() => import('./pages/purchasing/PurchaseItemsPage').then(m => ({ default: m.PurchaseItemsPage })));
const PaymentTermsPage = lazy(() => import('./pages/purchasing/PaymentTermsPage').then(m => ({ default: m.PaymentTermsPage })));

// Purchasing module pages (Phase 1B PR + PO + approvals)
// Reason: `PurchaseOrdersPage` (line 75) already exists from the sales module, so the
// purchasing version is aliased to `PurchasingPurchaseOrdersPage` to prevent the
// duplicate-identifier Babel crash that caused the v1.15.0+1 frontend outage.
const PurchaseRequestsPage = lazy(() => import('./pages/purchasing/PurchaseRequestsPage').then(m => ({ default: m.PurchaseRequestsPage })));
const PurchaseRequestFormPage = lazy(() => import('./pages/purchasing/PurchaseRequestFormPage').then(m => ({ default: m.PurchaseRequestFormPage })));
const PurchaseRequestDetailPage = lazy(() => import('./pages/purchasing/PurchaseRequestDetailPage').then(m => ({ default: m.PurchaseRequestDetailPage })));
const PurchasingPurchaseOrdersPage = lazy(() => import('./pages/purchasing/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const PurchaseOrderFormPage = lazy(() => import('./pages/purchasing/PurchaseOrderFormPage').then(m => ({ default: m.PurchaseOrderFormPage })));
const PurchaseOrderDetailPage = lazy(() => import('./pages/purchasing/PurchaseOrderDetailPage').then(m => ({ default: m.PurchaseOrderDetailPage })));
const ApprovalInboxPage = lazy(() => import('./pages/purchasing/ApprovalInboxPage').then(m => ({ default: m.ApprovalInboxPage })));

// Purchasing module pages (Phase B — Goods Receipts)
const GoodsReceiptsPage = lazy(() => import('./pages/purchasing/GoodsReceiptsPage').then(m => ({ default: m.GoodsReceiptsPage })));
const GoodsReceiptDetailPage = lazy(() => import('./pages/purchasing/GoodsReceiptDetailPage').then(m => ({ default: m.GoodsReceiptDetailPage })));
const GoodsReceiptFormPage = lazy(() => import('./pages/purchasing/GoodsReceiptFormPage').then(m => ({ default: m.GoodsReceiptFormPage })));

// Purchasing module pages (Phase C — AP Invoices)
const APInvoicesPage = lazy(() => import('./pages/purchasing/APInvoicesPage').then(m => ({ default: m.APInvoicesPage })));
const APInvoiceDetailPage = lazy(() => import('./pages/purchasing/APInvoiceDetailPage').then(m => ({ default: m.APInvoiceDetailPage })));
const APInvoiceFormPage = lazy(() => import('./pages/purchasing/APInvoiceFormPage').then(m => ({ default: m.APInvoiceFormPage })));

// Finance module pages (Phase B — Journal Entries)
const JournalEntriesPage = lazy(() => import('./pages/finance/JournalEntriesPage').then(m => ({ default: m.JournalEntriesPage })));

// Finance module pages (PM feedback item 5 — Trial Balance)
const TrialBalancePage = lazy(() => import('./pages/finance/TrialBalancePage').then(m => ({ default: m.TrialBalancePage })));

// Finance module pages (Phase D — Vendor Payments)
const PaymentsPage = lazy(() => import('./pages/finance/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
const PaymentDetailPage = lazy(() => import('./pages/finance/PaymentDetailPage').then(m => ({ default: m.PaymentDetailPage })));
const RecordPaymentPage = lazy(() => import('./pages/finance/RecordPaymentPage').then(m => ({ default: m.RecordPaymentPage })));

// Finance module pages (Phase D.5 — Fiscal Periods)
const PeriodsPage = lazy(() => import('./pages/finance/PeriodsPage').then(m => ({ default: m.PeriodsPage })));

// Finance module pages (Phase E — AP Aging + Vendor Sub-Ledger reports)
const APAgingPage = lazy(() => import('./pages/finance/APAgingPage').then(m => ({ default: m.APAgingPage })));
const VendorSubLedgerPage = lazy(() => import('./pages/finance/VendorSubLedgerPage').then(m => ({ default: m.VendorSubLedgerPage })));

// Division selector (shown after login when user belongs to multiple divisions)
const DivisionSelector = lazy(() =>
  import('./pages/division/DivisionSelector').then(m => ({ default: m.DivisionSelector }))
);

// Debug pages
const ClearCache = lazy(() => import('./pages/debug/ClearCache').then(m => ({ default: m.ClearCache })));

// 404 page
const NotFound = lazy(() => import('./pages/NotFound').then(m => ({ default: m.NotFound })));

function App() {
  const mode = useThemeStore((state) => state.mode);
  const activeTheme = mode === 'dark' ? darkTheme : lightTheme;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={activeTheme}>
        <GlobalStyles />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
        <UnsavedChangesProvider>
        <UnsavedChangesDialog />
        <ToastContainer />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* MFA Verify - Semi-public route with guard (requires MFA token from login) */}
            <Route element={<MFAVerifyGuard />}>
              <Route path="/mfa/verify" element={<MFAVerifyPage />} />
            </Route>

            {/* Debug routes (development only) */}
            <Route path="/debug/clear-cache" element={<ClearCache />} />

            {/* MFA Setup - Protected with special guard (allows mfaSetupRequired users, blocks if MFA already enabled) */}
            <Route element={<MFASetupGuard />}>
              <Route path="/mfa/setup" element={<MFASetupPage />} />
            </Route>

            {/* Protected routes */}
            <Route element={<ProtectedRoute />}>
              {/* Division selector - full-page, outside MainLayout */}
              <Route path="/select-division" element={<DivisionSelector />} />

              {/* AI Hub - full-screen, outside MainLayout, super admin only */}
              <Route path="/ai" element={<AIHub />} />

              <Route element={<MainLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/farm/*" element={<FarmManager />} />
                <Route path="/operations" element={<OperationsDashboard />} />
                <Route path="/operations/:farmId" element={<FarmBlocksView />} />
                <Route path="/operations/:farmId/:blockId" element={<BlockTaskList />} />
                <Route path="/inventory/*" element={<InventoryDashboard />} />
                <Route path="/crm/customers" element={<CRMPage />} />
                <Route path="/crm/customers/:customerId" element={<CustomerDetailPage />} />
                <Route path="/crm/customers/:customerId/edit" element={<CustomerDetailPage />} />
                <Route path="/hr" element={<HRDashboardPage />} />
                <Route path="/hr/employees" element={<EmployeeListPage />} />
                <Route path="/hr/employees/:employeeId" element={<EmployeeDetailPage />} />
                <Route path="/logistics" element={<LogisticsDashboardPage />} />
                <Route path="/logistics/vehicles" element={<VehicleManagementPage />} />
                <Route path="/logistics/routes" element={<RouteManagementPage />} />
                <Route path="/logistics/shipments" element={<ShipmentTrackingPage />} />
                <Route path="/sales" element={<SalesDashboardPage />} />
                <Route path="/sales/orders" element={<SalesOrdersPage />} />
                <Route path="/sales/stock" element={<StockPage />} />
                {/* Back-compat redirect: old /sales/inventory → new /sales/stock */}
                <Route path="/sales/inventory" element={<Navigate to="/sales/stock" replace />} />
                <Route path="/sales/purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="/sales/returns" element={<ReturnsPage />} />
                {/* Redirects: /inventory/harvest → /sales/stock?tab=sellable, /inventory/waste → /sales/stock?tab=waste */}
                <Route path="/inventory/harvest" element={<Navigate to="/sales/stock?tab=sellable" replace />} />
                <Route path="/inventory/waste" element={<Navigate to="/sales/stock?tab=waste" replace />} />
                <Route path="/marketing" element={<MarketingDashboardPage />} />
                <Route path="/marketing/campaigns" element={<CampaignManagementPage />} />
                <Route path="/marketing/budgets" element={<BudgetManagementPage />} />
                <Route path="/marketing/events" element={<EventManagementPage />} />
                <Route path="/marketing/channels" element={<ChannelManagementPage />} />
                {/* Mushroom farming module */}
                <Route path="/mushroom/dashboard" element={<MushroomDashboardPage />} />
                <Route path="/mushroom/facilities" element={<MushroomFacilityManager />} />
                <Route path="/mushroom/strains" element={<MushroomStrainLibrary />} />
                <Route path="/mushroom/rooms" element={<MushroomRoomMonitor />} />
                <Route path="/mushroom" element={<MushroomDashboardPage />} />

                {/* Tools module */}
                <Route path="/tools" element={<Navigate to="/tools/fertilizer-calculator" replace />} />
                <Route path="/tools/fertilizer-calculator" element={<FertilizerCostCalculator />} />
                <Route path="/tools/chemicals" element={<ChemicalsCatalog />} />

                {/* Finance module */}
                <Route path="/finance/chart-of-accounts" element={<ChartOfAccountsPage />} />
                <Route path="/finance/approval-rules" element={<ApprovalRulesPage />} />
                <Route path="/finance/posting-setup" element={<PostingSetupPage />} />
                <Route path="/finance/item-mapping" element={<ItemMappingPage />} />
                <Route path="/finance/incoming" element={<IncomingPreviewPage />} />
                {/* Short URL alias for engineers */}
                <Route path="/finance/coa" element={<Navigate to="/finance/chart-of-accounts" replace />} />
                <Route path="/finance" element={<Navigate to="/finance/chart-of-accounts" replace />} />

                {/* Purchasing module (Phase 1A) */}
                <Route path="/purchasing/vendors" element={<VendorsPage />} />
                <Route path="/purchasing/items" element={<PurchaseItemsPage />} />
                <Route path="/purchasing/payment-terms" element={<PaymentTermsPage />} />
                <Route path="/purchasing" element={<Navigate to="/purchasing/vendors" replace />} />

                {/* Purchasing module (Phase 1B — PR + PO + approvals) */}
                <Route path="/purchasing/pr" element={<PurchaseRequestsPage />} />
                <Route path="/purchasing/pr/new" element={<PurchaseRequestFormPage />} />
                <Route path="/purchasing/pr/:docId" element={<PurchaseRequestDetailPage />} />
                <Route path="/purchasing/pr/:docId/edit" element={<PurchaseRequestFormPage />} />
                <Route path="/purchasing/po" element={<PurchasingPurchaseOrdersPage />} />
                <Route path="/purchasing/po/new" element={<PurchaseOrderFormPage />} />
                <Route path="/purchasing/po/from-pr/:prDocId" element={<PurchaseOrderFormPage />} />
                <Route path="/purchasing/po/:docId" element={<PurchaseOrderDetailPage />} />
                <Route path="/purchasing/po/:docId/edit" element={<PurchaseOrderFormPage />} />
                <Route path="/purchasing/approvals" element={<ApprovalInboxPage />} />

                {/* Purchasing module (Phase B — Goods Receipts) */}
                <Route path="/purchasing/gr" element={<GoodsReceiptsPage />} />
                <Route path="/purchasing/gr/new" element={<GoodsReceiptFormPage />} />
                <Route path="/purchasing/gr/from-po/:poDocId" element={<GoodsReceiptFormPage />} />
                <Route path="/purchasing/gr/:docId" element={<GoodsReceiptDetailPage />} />
                <Route path="/purchasing/gr/:docId/edit" element={<GoodsReceiptFormPage />} />

                {/* Purchasing module (Phase C — AP Invoices) */}
                <Route path="/purchasing/ap" element={<APInvoicesPage />} />
                <Route path="/purchasing/ap/new" element={<APInvoiceFormPage />} />
                <Route path="/purchasing/ap/from-gr/:grDocId" element={<APInvoiceFormPage />} />
                <Route path="/purchasing/ap/:docId" element={<APInvoiceDetailPage />} />
                <Route path="/purchasing/ap/:docId/edit" element={<APInvoiceFormPage />} />

                {/* Finance module (Phase B — Journal Entries) */}
                <Route path="/finance/journal-entries" element={<JournalEntriesPage />} />

                {/* Finance module (PM feedback item 5 — Trial Balance) */}
                <Route path="/finance/trial-balance" element={<TrialBalancePage />} />

                {/* Finance module (Phase D — Vendor Payments) */}
                <Route path="/finance/payments" element={<PaymentsPage />} />
                {/* /new MUST come before /:paymentId to avoid treating "new" as a paymentId */}
                <Route path="/finance/payments/new" element={<RecordPaymentPage />} />
                <Route path="/finance/payments/:paymentId" element={<PaymentDetailPage />} />

                {/* Finance module (Phase D.5 — Fiscal Periods) */}
                <Route path="/finance/periods" element={<PeriodsPage />} />

                {/* Finance module (Phase E — AP Aging + Vendor Sub-Ledger) */}
                <Route path="/finance/ap-aging" element={<APAgingPage />} />
                <Route path="/finance/vendor-sub-ledger" element={<VendorSubLedgerPage />} />

                <Route path="/profile" element={<Profile />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin/users" element={<UserManagementPage />} />
                {/* Tenant Setup Wizard — super_admin only.
                    Accessible without an orgId (bootstrap scenario). */}
                <Route
                  path="/admin/tenant-setup"
                  element={<TenantSetupWizardPage />}
                />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            {/* 404 Not Found page */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
        </UnsavedChangesProvider>
      </BrowserRouter>
    </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
