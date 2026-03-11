# Frontend Map

> Generated: 2026-02-24 10:11 UTC  
> Source: MongoDB `mapper_nodes` (node_type=component|hook|store|type, layer=frontend)

## Overview

Frontend: React 18 + TypeScript + Vite. State via Zustand. Server state via TanStack Query.
Styling with styled-components. Charts with Recharts. Maps with MapLibre GL.

**Related Maps:** [api-map.md](api-map.md) | [module-map.md](module-map.md)

## React Components (89)

| Component | File | Description |
|-----------|------|-------------|
| `AIAnalytics` | `frontend/user-portal/src/pages/ai/AIAnalytics.tsx:1` | AI Analytics page rendering AIAnalyticsChat component | AIAnalytics |
| `AIAnalyticsChat` | `frontend/user-portal/src/components/ai/AIAnalyticsChat.tsx:1` | AI analytics chat component using useAIAnalytics hook for conversational data exploration | AIAnalyticsChat |
| `AddPlantDataModal` | `frontend/user-portal/src/components/farm/AddPlantDataModal.tsx:1` | Modal for adding new plant data entries | AddPlantDataModal |
| `AddVirtualCropModal` | `frontend/user-portal/src/components/farm/AddVirtualCropModal.tsx:1` | Modal for adding virtual crops to blocks | AddVirtualCropModal |
| `AddWidgetModal` | `frontend/user-portal/src/components/dashboard/AddWidgetModal.tsx:1` | Modal for adding widgets to the main dashboard | AddWidgetModal |
| `BackupCodesModal` | `frontend/user-portal/src/components/auth/BackupCodesModal.tsx:1` | Modal displaying MFA backup codes | BackupCodesModal |
| `BlockAlertsTab` | `frontend/user-portal/src/components/farm/BlockAlertsTab.tsx:1` | Block detail tab displaying alerts list for a block | BlockAlertsTab |
| `BlockAnalyticsModal` | `frontend/user-portal/src/components/farm/BlockAnalyticsModal.tsx:1` | Block analytics modal with tabs: overview, yield, timeline, tasks, alerts. Uses useBlockAnalytics hook and recharts | BlockAnalyticsModal |
| `BlockArchivesTab` | `frontend/user-portal/src/components/farm/BlockArchivesTab.tsx:1` | Block detail tab showing archived planting data | BlockArchivesTab |
| `BlockAutomationTab` | `frontend/user-portal/src/components/farm/BlockAutomationTab.tsx:1` | Block detail tab for automation/IoT integration | BlockAutomationTab |
| `BlockCard` | `frontend/user-portal/src/components/farm/BlockCard.tsx:1` | Block card with state colors, renders PlantAssignmentModal, PendingTasksWarningModal, BlockAnalyticsModal | BlockCard |
| `BlockDetail` | `frontend/user-portal/src/components/farm/BlockDetail.tsx:1` | Block detail page with tabs for alerts, automation, harvests, archives. Uses farmApi service | BlockDetail |
| `BlockDetailsModal` | `frontend/user-portal/src/components/farm/BlockDetailsModal.tsx:1` | Comprehensive modal: block header, planting details, harvest history, growth timeline. Uses farmApi | BlockDetailsModal |
| `BlockGrid` | `frontend/user-portal/src/components/farm/BlockGrid.tsx:1` | Grid layout of BlockCard components with state filter tabs | BlockGrid |
| `BlockGrid (dashboard)` | `frontend/user-portal/src/components/farm/dashboard/BlockGrid.tsx:1` | Dashboard block grid rendering CompactBlockCard components | BlockGrid |
| `BlockHarvestEntryModal` | `frontend/user-portal/src/components/farm/BlockHarvestEntryModal.tsx:1` | Modal for entering harvest data for a block | BlockHarvestEntryModal |
| `BlockHarvestsTab` | `frontend/user-portal/src/components/farm/BlockHarvestsTab.tsx:1` | Block detail tab showing harvest records | BlockHarvestsTab |
| `BlockTaskList` | `frontend/user-portal/src/pages/operations/BlockTaskList.tsx:1` | Task list for a specific block in operations module | BlockTaskList |
| `BudgetManagementPage` | `frontend/user-portal/src/pages/marketing/BudgetManagementPage.tsx:1` | Marketing budget management page | BudgetManagementPage |
| `CRMPage` | `frontend/user-portal/src/pages/crm/CRMPage.tsx:1` | CRM customers list page | CRMPage |
| `CampaignManagementPage` | `frontend/user-portal/src/pages/marketing/CampaignManagementPage.tsx:1` | Campaign management page | CampaignManagementPage |
| `ChannelManagementPage` | `frontend/user-portal/src/pages/marketing/ChannelManagementPage.tsx:1` | Marketing channel management page | ChannelManagementPage |
| `ClearCache` | `frontend/user-portal/src/pages/debug/ClearCache.tsx:1` | Debug page for clearing browser cache and storage | ClearCache |
| `CompactBlockCard` | `frontend/user-portal/src/components/farm/dashboard/CompactBlockCard.tsx:1` | Compact block card for dashboard with state-specific layouts. Uses useBlockActions, renders QuickPlanModal, ResolveAlertModal, BlockDetailsModal, BlockHarvestEntryModal, BlockAnalyticsModal | CompactBlockCard |
| `CreateBlockModal` | `frontend/user-portal/src/components/farm/CreateBlockModal.tsx:1` | Block creation modal with map boundary drawing. Uses useMapDrawing hook | CreateBlockModal |
| `CreateFarmModal` | `frontend/user-portal/src/components/farm/CreateFarmModal.tsx:1` | Farm creation modal with form, map boundary drawing. Uses farmApi, useMapDrawing, useUnsavedChanges, toast.store | CreateFarmModal |
| `CustomerDetailPage` | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx:1` | Customer detail view page | CustomerDetailPage |
| `Dashboard` | `frontend/user-portal/src/pages/dashboard/Dashboard.tsx:1` | Main dashboard page with draggable widget grid (react-grid-layout). Uses useDashboardStore | Dashboard |
| `DashboardFilters` | `frontend/user-portal/src/components/farm/dashboard/DashboardFilters.tsx:1` | Filter controls for farm dashboard: state, search, performance, sort. Uses types from useDashboardFilters | DashboardFilters |
| `DashboardHeader` | `frontend/user-portal/src/components/farm/dashboard/DashboardHeader.tsx:1` | Dashboard header showing farm info and summary metrics | DashboardHeader |
| `DashboardSettings` | `frontend/user-portal/src/components/farm/dashboard/DashboardSettings.tsx:1` | Dashboard configuration panel for color/icon/layout settings | DashboardSettings |
| `EditBlockModal` | `frontend/user-portal/src/components/farm/EditBlockModal.tsx:1` | Block edit modal for updating block details | EditBlockModal |
| `EditFarmBoundaryModal` | `frontend/user-portal/src/components/farm/EditFarmBoundaryModal.tsx:1` | Modal for editing farm GeoJSON boundary on map | EditFarmBoundaryModal |
| `EditFarmModal` | `frontend/user-portal/src/components/farm/EditFarmModal.tsx:1` | Farm edit modal for updating farm details | EditFarmModal |
| `EditPlantDataModal` | `frontend/user-portal/src/components/farm/EditPlantDataModal.tsx:1` | Modal for editing existing plant data entries | EditPlantDataModal |
| `EmployeeDetailPage` | `frontend/user-portal/src/pages/hr/EmployeeDetailPage.tsx:1` | Employee detail page with contract, visa, insurance, performance tabs | EmployeeDetailPage |
| `EmployeeListPage` | `frontend/user-portal/src/pages/hr/EmployeeListPage.tsx:1` | Employee list page | EmployeeListPage |
| `EmptyVirtualBlockModal` | `frontend/user-portal/src/components/farm/EmptyVirtualBlockModal.tsx:1` | Modal for emptying virtual block crops | EmptyVirtualBlockModal |
| `EventManagementPage` | `frontend/user-portal/src/pages/marketing/EventManagementPage.tsx:1` | Marketing event management page | EventManagementPage |
| `FarmAIChat` | `frontend/user-portal/src/components/farm/FarmAIChat.tsx:1` | Floating AI chat widget for farm assistant. Uses useFarmAIChat hook for natural language queries and action confirmation | FarmAIChat |
| `FarmAnalyticsModal` | `frontend/user-portal/src/components/farm/FarmAnalyticsModal.tsx:1` | Farm-level analytics modal with tabs: overview, block comparison, historical trends, state details. Uses useFarmAnalytics and recharts | FarmAnalyticsModal, FarmAnalyticsModalProps |
| `FarmBlocksView` | `frontend/user-portal/src/pages/operations/FarmBlocksView.tsx:1` | Operations view of blocks within a farm | FarmBlocksView |
| `FarmCard` | `frontend/user-portal/src/components/farm/FarmCard.tsx:1` | Farm summary card displaying farm info, navigates to farm detail on click | FarmCard |
| `FarmDashboard` | `frontend/user-portal/src/components/farm/FarmDashboard.tsx:1` | Main farm module dashboard showing key metrics and quick actions. Uses farmApi and renders GlobalFarmAnalyticsModal | FarmDashboard |
| `FarmDashboardPage` | `frontend/user-portal/src/pages/farm/FarmDashboardPage.tsx:23` | Block monitor dashboard page. Uses useDashboardData, useDashboardConfig, useDashboardFilters hooks | FarmDashboardPage |
| `FarmDetail` | `frontend/user-portal/src/components/farm/FarmDetail.tsx:1` | Farm detail page with tabs (blocks, map, history, weather). Uses useFarm, useFarmBlocks, useAvailableFarmingYears hooks | FarmDetail |
| `FarmHistoryTab` | `frontend/user-portal/src/components/farm/FarmHistoryTab.tsx:1` | Farm detail tab showing historical farm activity | FarmHistoryTab |
| `FarmList` | `frontend/user-portal/src/components/farm/FarmList.tsx:1` | Paginated farm card grid with search/filter. Renders FarmCard, CreateFarmModal, EditFarmModal, FarmAnalyticsModal | FarmList, FarmListProps |
| `FarmManager` | `frontend/user-portal/src/pages/farm/FarmManager.tsx:16` | Farm module router: sub-routes for dashboard, block-monitor, farms, farm detail, block detail, plants | FarmManager |
| `FarmMapView` | `frontend/user-portal/src/components/farm/FarmMapView.tsx:1` | MapLibre GL map view showing farm and block boundaries with state colors. Uses mapConfig | FarmMapView |
| `FarmSelector` | `frontend/user-portal/src/components/farm/dashboard/FarmSelector.tsx:1` | Dropdown to select active farm. Calls getFarms from farmApi | FarmSelector |
| `FarmingYearSelector` | `frontend/user-portal/src/components/farm/FarmingYearSelector.tsx:1` | Dropdown selector for farming year filter | FarmingYearSelector |
| `GlobalFarmAnalyticsModal` | `frontend/user-portal/src/components/farm/GlobalFarmAnalyticsModal.tsx:1` | System-wide analytics modal: farm comparison, production timeline, performance insights. Uses useGlobalAnalytics and recharts | GlobalFarmAnalyticsModal, GlobalFarmAnalyticsModalProps |
| `HRDashboardPage` | `frontend/user-portal/src/pages/hr/HRDashboardPage.tsx:1` | HR module dashboard page | HRDashboardPage |
| `InventoryDashboard` | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx:1` | Inventory management dashboard | InventoryDashboard |
| `InventoryPage` | `frontend/user-portal/src/pages/sales/InventoryPage.tsx:1` | Sales inventory page | InventoryPage |
| `Login` | `frontend/user-portal/src/pages/auth/Login.tsx:1` | Login page with form validation (react-hook-form + zod). Uses useAuthStore and usePageVisibility | Login |
| `LogisticsDashboardPage` | `frontend/user-portal/src/pages/logistics/LogisticsDashboardPage.tsx:1` | Logistics module dashboard page | LogisticsDashboardPage |
| `MFARouteGuards` | `frontend/user-portal/src/components/common/MFARouteGuards.tsx:1` | MFA route guards: MFAVerifyGuard requires MFA pending token, MFASetupGuard blocks if MFA already enabled | MFAVerifyGuard, MFASetupGuard |
| `MFASetupPage` | `frontend/user-portal/src/pages/auth/MFASetupPage.tsx:1` | MFA TOTP setup page with QR code and backup codes | MFASetupPage |
| `MFAVerifyPage` | `frontend/user-portal/src/pages/auth/MFAVerifyPage.tsx:1` | MFA verification page for TOTP code entry | MFAVerifyPage |
| `MainLayout` | `frontend/user-portal/src/components/layout/MainLayout.tsx:1` | Main app layout with sidebar navigation, header, and Outlet for nested routes. Uses useAuthStore and tasksApi | MainLayout |
| `MarketingDashboardPage` | `frontend/user-portal/src/pages/marketing/MarketingDashboardPage.tsx:1` | Marketing module dashboard page | MarketingDashboardPage |
| `NotFound` | `frontend/user-portal/src/pages/NotFound.tsx:1` | 404 Not Found page | NotFound |
| `OperationsDashboard` | `frontend/user-portal/src/pages/operations/OperationsDashboard.tsx:1` | Operations module dashboard page | OperationsDashboard |
| `PendingTasksWarningModal` | `frontend/user-portal/src/components/farm/PendingTasksWarningModal.tsx:1` | Warning modal shown when block has pending tasks before state transition | PendingTasksWarningModal |
| `PhysicalBlockCard` | `frontend/user-portal/src/components/farm/PhysicalBlockCard.tsx:1` | Physical block card showing block in spatial layout view | PhysicalBlockCard |
| `PhysicalBlockGrid` | `frontend/user-portal/src/components/farm/PhysicalBlockGrid.tsx:1` | Physical layout grid rendering PhysicalBlockCard components | PhysicalBlockGrid |
| `PlantAssignmentModal` | `frontend/user-portal/src/components/farm/PlantAssignmentModal.tsx:1` | Modal for assigning plants to blocks | PlantAssignmentModal |
| `PlantDataCard` | `frontend/user-portal/src/components/farm/PlantDataCard.tsx:1` | Card displaying plant data summary. Uses plantDataEnhancedApi for formatting | PlantDataCard |
| `PlantDataDetail` | `frontend/user-portal/src/components/farm/PlantDataDetail.tsx:1` | Detailed view of a plant data entry | PlantDataDetail |
| `PlantDataLibrary` | `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx:1` | Plant data library page with card grid, detail view, add/edit modals, CSV import/export. Uses plantDataEnhancedApi | PlantDataLibrary |
| `Profile` | `frontend/user-portal/src/pages/profile/Profile.tsx:1` | User profile page | Profile |
| `ProtectedRoute` | `frontend/user-portal/src/components/common/ProtectedRoute.tsx:1` | Auth guard component that checks useAuthStore and redirects unauthenticated users to /login | ProtectedRoute |
| `PurchaseOrdersPage` | `frontend/user-portal/src/pages/sales/PurchaseOrdersPage.tsx:1` | Purchase orders page | PurchaseOrdersPage |
| `QuickPlanModal` | `frontend/user-portal/src/components/farm/dashboard/QuickPlanModal.tsx:1` | Quick planning modal for block state transitions | QuickPlanModal |
| `Register` | `frontend/user-portal/src/pages/auth/Register.tsx:1` | User registration page | Register |
| `ResolveAlertModal` | `frontend/user-portal/src/components/farm/dashboard/ResolveAlertModal.tsx:1` | Modal for resolving block alerts | ResolveAlertModal |
| `ReturnsPage` | `frontend/user-portal/src/pages/sales/ReturnsPage.tsx:1` | Returns management page | ReturnsPage |
| `RouteManagementPage` | `frontend/user-portal/src/pages/logistics/RouteManagementPage.tsx:1` | Route management page | RouteManagementPage |
| `SalesDashboardPage` | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx:1` | Sales module dashboard page | SalesDashboardPage |
| `SalesOrdersPage` | `frontend/user-portal/src/pages/sales/SalesOrdersPage.tsx:1` | Sales orders list page | SalesOrdersPage |
| `Settings` | `frontend/user-portal/src/pages/settings/Settings.tsx:1` | User settings page | Settings |
| `ShipmentTrackingPage` | `frontend/user-portal/src/pages/logistics/ShipmentTrackingPage.tsx:1` | Shipment tracking page | ShipmentTrackingPage |
| `ToastContainer` | `frontend/user-portal/src/components/common/ToastContainer.tsx:1` | Global toast notification container consuming useToastStore | ToastContainer |
| `UnsavedChangesDialog` | `frontend/user-portal/src/components/common/UnsavedChangesDialog.tsx:1` | Dialog prompting user to save or discard unsaved changes before navigation | UnsavedChangesDialog |
| `UserManagementPage` | `frontend/user-portal/src/pages/admin/UserManagementPage.tsx:1` | Admin user management page | UserManagementPage |
| `VehicleManagementPage` | `frontend/user-portal/src/pages/logistics/VehicleManagementPage.tsx:1` | Vehicle management page | VehicleManagementPage |
| `WasteInventoryList` | `frontend/user-portal/src/pages/inventory/WasteInventoryList.tsx:1` | Waste inventory list page | default: WasteInventoryList |

## Custom Hooks (18)

| Hook | File | Description |
|------|------|-------------|
| `useAIAnalytics` | `frontend/user-portal/src/hooks/farm/useAIAnalytics.ts:1` | Sends AI analytics queries to /v1/ai/chat via apiClient. Manages conversation history | useAIAnalytics |
| `useBlockActions` | `frontend/user-portal/src/hooks/farm/useBlockActions.ts:1` | Quick transition and harvest actions via apiClient. PATCH quick-transition, POST quick-harvest | useBlockActions |
| `useBlockAnalytics` | `frontend/user-portal/src/hooks/farm/useBlockAnalytics.ts:1` | Fetches block analytics from /v1/farm/farms/{farmId}/blocks/{blockId}/analytics via apiClient | useBlockAnalytics |
| `useDashboard` | `frontend/user-portal/src/hooks/queries/useDashboard.ts:1` | React Query hooks for dashboard data. Uses dashboardDataService and queryKeys | useDashboardSummary, useFarmStats, useSalesStats, useOrdersByStatus, useBlocksBy |
| `useDashboardConfig` | `frontend/user-portal/src/hooks/farm/useDashboardConfig.ts:1` | LocalStorage-persisted dashboard color/icon/layout configuration. No API calls | useDashboardConfig, DashboardConfig |
| `useDashboardData` | `frontend/user-portal/src/hooks/farm/useDashboardData.ts:1` | Fetches dashboard data from /v1/farm/dashboard/farms/{farmId} via apiClient with auto-refresh | useDashboardData |
| `useDashboardFilters` | `frontend/user-portal/src/hooks/farm/useDashboardFilters.ts:130` | Client-side filtering/sorting for DashboardBlock[]. Supports state, search, performance, delay, alerts, farming year filters with sessionStorage persistence | useDashboardFilters, SortOption, SortDirection, FilterState, UseDashboardFilters |
| `useFarmAIChat` | `frontend/user-portal/src/hooks/farm/useFarmAIChat.ts:26` | Manages Farm AI chat state, message sending via sendFarmAIChat/confirmFarmAIAction from farmApi | useFarmAIChat |
| `useFarmAnalytics` | `frontend/user-portal/src/hooks/farm/useFarmAnalytics.ts:1` | Fetches farm analytics from /v1/farm/farms/{farmId}/analytics via apiClient | useFarmAnalytics |
| `useFarmingYears` | `frontend/user-portal/src/hooks/queries/useFarmingYears.ts:1` | React Query hooks for farming year configuration. Uses farmApi and queryKeys | useAvailableFarmingYears, useCurrentFarmingYear, useFarmingYearsList, useFarming |
| `useFarms` | `frontend/user-portal/src/hooks/queries/useFarms.ts:1` | React Query hooks for farm CRUD. Uses farmApi service and queryKeys config | useFarms, useFarm, useFarmSummary, useFarmBlocks, useFarmHarvests, useCreateFarm |
| `useGlobalAnalytics` | `frontend/user-portal/src/hooks/farm/useGlobalAnalytics.ts:1` | Fetches global farm analytics from /v1/farm/farms/analytics/global via apiClient | useGlobalAnalytics |
| `useMFA` | `frontend/user-portal/src/hooks/queries/useMFA.ts:1` | React Query hooks for MFA setup/enable/status. Uses apiClient with sessionStorage caching | useMFASetup, useEnableMFA, useMFAStatus, getCachedVerifyState |
| `useMapDrawing` | `frontend/user-portal/src/hooks/map/useMapDrawing.ts:1` | Polygon drawing state management with turf.js area calculations for map boundary editing | useMapDrawing |
| `usePageVisibility` | `frontend/user-portal/src/hooks/usePageVisibility.ts:1` | Page Visibility API hooks for detecting tab focus and mobile device | usePageVisibility, useIsMobile, useIsPageVisible |
| `useSales` | `frontend/user-portal/src/hooks/queries/useSales.ts:1` | React Query hooks for sales operations. Uses salesApi and queryKeys | useSalesDashboard, useSalesOrders, useSalesOrder, useInventory, useAvailableInve |
| `useUnsavedChanges` | `frontend/user-portal/src/hooks/useUnsavedChanges.ts:1` | beforeunload handler and UnsavedChangesContext integration for form dirty state tracking | useUnsavedChanges |
| `useWeatherData` | `frontend/user-portal/src/hooks/farm/useWeatherData.ts:1` | Fetches weather data via weatherApi.getAgriData with auto-refresh | useWeatherData, useHasWeatherCapability |

## Zustand Stores (3)

| Store | File | Description |
|-------|------|-------------|
| `useAuthStore` | `frontend/user-portal/src/stores/auth.store.ts:1` | Zustand store with persist: user, isAuthenticated, isLoading, mfaRequired. Actions: login, register, logout, loadUser, verifyMfa. Uses authService | useAuthStore |
| `useDashboardStore` | `frontend/user-portal/src/stores/dashboard.store.ts:1` | Zustand store with persist: widgets, widgetData, layout. Uses dashboardDataService and queryClient | useDashboardStore, waitForHydration, WIDGET_CATALOG |
| `useToastStore` | `frontend/user-portal/src/stores/toast.store.ts:1` | Zustand toast notification store with convenience functions for success, error, warning, info toasts | useToastStore, showToast, showErrorToast, showSuccessToast, showWarningToast, sh |

## TypeScript Types (14)

| Type | File | Description |
|------|------|-------------|
| `alert types` | `frontend/user-portal/src/types/alerts.ts:1` | Alert type definitions: severity, status, type enums and request/response interfaces | AlertSeverity, AlertStatus, AlertType, Alert, CreateAlertRequest, ResolveAlertRe |
| `analytics types` | `frontend/user-portal/src/types/analytics.ts:1` | Block analytics and AI analytics types: yield, timeline, task, performance, alert analytics and chat interfaces | BlockInfo, YieldAnalytics, TimelineAnalytics, TaskAnalytics, PerformanceMetrics, |
| `crm types` | `frontend/user-portal/src/types/crm.ts:1` | CRM type definitions: customer type/status enums, customer and address interfaces | CustomerType, CustomerStatus, Customer, CustomerAddress |
| `farm types` | `frontend/user-portal/src/types/farm.ts:1` | Core farm type definitions: Farm, Block, PlantData, DashboardBlock, enums, constants for block states/colors | BlockState, PlantingStatus, GeoJSONPolygon, FarmBoundary, Farm, Block, PlantData |
| `farm-analytics types` | `frontend/user-portal/src/types/farm-analytics.ts:1` | Farm-level analytics types: aggregated metrics, state breakdown, block comparison, historical trends | TimePeriod, AggregatedMetrics, StateBreakdown, BlockComparisonItem, HistoricalTr |
| `farmAI types` | `frontend/user-portal/src/types/farmAI.ts:1` | Farm AI chat types: chat messages, pending actions, growth stage info, confirm action request/response | ChatMessage, FarmAIChatRequest, PendingAction, GrowthStageInfo, FarmAIChatRespon |
| `global-analytics types` | `frontend/user-portal/src/types/global-analytics.ts:1` | Global analytics types: system-wide aggregated metrics, farm summaries, performance insights | TimePeriod, GlobalAggregatedMetrics, GlobalStateBreakdown, FarmSummary, GlobalAn |
| `hr types` | `frontend/user-portal/src/types/hr.ts:1` | HR type definitions: employee status enum, employee and contract type interfaces | EmployeeStatus, Employee, ContractType |
| `inventory types` | `frontend/user-portal/src/types/inventory.ts:1` | Inventory type definitions: harvest, input, asset inventory interfaces with category enums | InventoryType, InputCategory, AssetCategory, AssetStatus, QualityGrade, HarvestI |
| `logistics types` | `frontend/user-portal/src/types/logistics.ts:1` | Logistics type definitions: vehicle type/status enums and vehicle interface | VehicleType, VehicleStatus, Vehicle |
| `marketing types` | `frontend/user-portal/src/types/marketing.ts:1` | Marketing type definitions: campaign status enum, campaign and metrics interfaces | CampaignStatus, MarketingCampaign, CampaignMetrics |
| `returns types` | `frontend/user-portal/src/types/returns.ts:1` | Re-exports return-related types from sales.ts | re-exports from sales.ts |
| `sales types` | `frontend/user-portal/src/types/sales.ts:1` | Sales type definitions: order status/payment status enums, sales order and order item interfaces | OrderStatus, PaymentStatus, SalesOrder, OrderItem |
| `task types` | `frontend/user-portal/src/types/tasks.ts:1` | Task type definitions: task type/status enums, harvest grade, task and harvest entry interfaces | TaskType, TaskStatus, HarvestGrade, Task, TaskWithDetails, CreateTaskRequest, Ha |

## Component Render Tree (sample)

| Parent | Renders | Child |
|--------|---------|-------|
| `file::App` | renders | `component::ProtectedRoute` |
| `file::App` | renders | `component::MFARouteGuards` |
| `file::App` | renders | `component::MainLayout` |
| `file::App` | renders | `component::ToastContainer` |
| `file::App` | renders | `component::UnsavedChangesDialog` |
| `file::App` | renders | `page::FarmManager` |
| `file::App` | renders | `page::Dashboard` |
| `file::App` | renders | `page::Login` |
| `file::App` | renders | `page::AIAnalytics` |
| `page::FarmManager` | renders | `component::FarmDashboard` |
| `page::FarmManager` | renders | `page::FarmDashboardPage` |
| `page::FarmManager` | renders | `component::FarmList` |
| `page::FarmManager` | renders | `component::FarmDetail` |
| `page::FarmManager` | renders | `component::BlockDetail` |
| `page::FarmManager` | renders | `page::PlantDataLibrary` |
| `page::FarmDashboardPage` | renders | `component::FarmSelector` |
| `page::FarmDashboardPage` | renders | `component::DashboardBlockGrid` |
| `page::FarmDashboardPage` | renders | `component::DashboardFilters` |
| `page::FarmDashboardPage` | renders | `component::FarmAnalyticsModal` |
| `component::FarmDashboard` | renders | `component::GlobalFarmAnalyticsModal` |
| `component::FarmList` | renders | `component::FarmCard` |
| `component::FarmList` | renders | `component::CreateFarmModal` |
| `component::FarmList` | renders | `component::FarmAnalyticsModal` |
| `component::FarmDetail` | renders | `component::BlockGrid` |
| `component::FarmDetail` | renders | `component::PhysicalBlockGrid` |
| `component::FarmDetail` | renders | `component::FarmMapView` |
| `component::FarmDetail` | renders | `component::CreateBlockModal` |
| `component::BlockDetail` | renders | `component::BlockAlertsTab` |
| `component::BlockDetail` | renders | `component::BlockHarvestsTab` |
| `component::BlockDetail` | renders | `component::BlockAutomationTab` |
| `component::BlockDetail` | renders | `component::BlockArchivesTab` |
| `component::BlockGrid` | renders | `component::BlockCard` |
| `component::BlockCard` | renders | `component::PlantAssignmentModal` |
| `component::BlockCard` | renders | `component::BlockAnalyticsModal` |
| `component::DashboardBlockGrid` | renders | `component::CompactBlockCard` |
| `component::CompactBlockCard` | renders | `component::BlockDetailsModal` |
| `component::CompactBlockCard` | renders | `component::BlockAnalyticsModal` |
| `page::AIAnalytics` | renders | `component::AIAnalyticsChat` |
| `page::PlantDataLibrary` | renders | `component::PlantDataCard` |
| `page::Dashboard` | renders | `component::AddWidgetModal` |
| `component::PhysicalBlockGrid` | renders | `component::PhysicalBlockCard` |
