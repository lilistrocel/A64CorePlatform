# Frontend Map

> Generated: 2026-08-07 08:14 UTC  
> Source: MongoDB `mapper_nodes` (node_type=component|hook|store|type, layer=frontend)

## Overview

Frontend: React 18 + TypeScript + Vite. State via Zustand. Server state via TanStack Query.
Styling with styled-components. Charts with Recharts. Maps with MapLibre GL.

**Related Maps:** [api-map.md](api-map.md) | [module-map.md](module-map.md)

## React Components (294)

| Component | File | Description |
|-----------|------|-------------|
| `AIAnalyticsChat` | `frontend/user-portal/src/components/ai/AIAnalyticsChat.tsx:1` | Conversational AI panel for farm analytics. Uses useAIAnalytics | AIAnalyticsChat |
| `AIAssistantFAB` | `frontend/user-portal/src/components/ai-assistant/AIAssistantFAB.tsx:1` | Floating action button that toggles the AI assistant panel | AIAssistantFAB |
| `AIAssistantPanel` | `frontend/user-portal/src/components/ai-assistant/AIAssistantPanel.tsx:1` | Slide-over AI assistant panel — renders MessageList, InputBox, ConversationList | AIAssistantPanel |
| `AIHub` | `frontend/user-portal/src/pages/ai/AIHub.tsx:1` | Page: AI Hub. Renders AIHubTabBar + AIHubChat | default |
| `AIHubChat` | `frontend/user-portal/src/components/ai/AIHubChat.tsx:1` | AI Hub chat surface — primary conversational UI | AIHubChat |
| `AIHubTabBar` | `frontend/user-portal/src/components/ai/AIHubTabBar.tsx:1` | Tab bar for the AI Hub page (sessions / tools / settings) | AIHubTabBar |
| `APAgingPage` | `frontend/user-portal/src/pages/finance/APAgingPage.tsx:1` | Page: AP aging report. Uses apInvoicesService + financeReportsService | default |
| `APInvoiceDetailPage` | `frontend/user-portal/src/pages/purchasing/APInvoiceDetailPage.tsx:1` | Page: AP invoice detail | default |
| `APInvoiceFormPage` | `frontend/user-portal/src/pages/purchasing/APInvoiceFormPage.tsx:1` | Page: AP invoice form. Renders FinanceUnreachableBanner. Uses taxCodesService + apInvoicesService | default |
| `APInvoicesPage` | `frontend/user-portal/src/pages/purchasing/APInvoicesPage.tsx:1` | Page: AP invoices list. Uses apInvoicesService | default |
| `ARAgingReportPage` | `frontend/user-portal/src/pages/sales/ARAgingReportPage.tsx:1` | Page: AR aging report (customer rows bucketed by days overdue). Uses useArAging hook and salesApi ARAgingCustomerRow type. | ARAgingReportPage |
| `ARInvoiceDetailPage` | `frontend/user-portal/src/pages/sales/ARInvoiceDetailPage.tsx:1` | Page: AR Invoice detail/transition/delete. Uses useArInvoice/useTransitionArInvoice/useDeleteArInvoice. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | ARInvoiceDetailPage, default |
| `ARInvoiceFormPage` | `frontend/user-portal/src/pages/sales/ARInvoiceFormPage.tsx:1` | Page: AR Invoice create/edit form, creatable standalone, from a Delivery (useCreateArInvoiceFromDelivery), or from a Sales Order (useCreateARInvoiceFromSO). Uses CustomerCombobox, SalesItemCombobox, CurrencyCombobox, CompanyCombobox. | ARInvoiceFormPage |
| `ARInvoicesPage` | `frontend/user-portal/src/pages/sales/ARInvoicesPage.tsx:1` | Page: AR Invoices list. Uses useArInvoices; status badges via salesStatusToPhase. | ARInvoicesPage, default |
| `AccessionDetailPage` | `frontend/user-portal/src/pages/genetics/AccessionDetailPage.tsx:1` | T-800 /genetics/accessions/:accessionId — ancestry breadcrumb, material facts, the 'Grown on' medium panel (recipe version, sterilisation, ingredients, additives), observation timeline and local lineage graph. | AccessionDetailPage |
| `AccountCombobox` | `frontend/user-portal/src/components/finance/AccountCombobox.tsx:1` | Combobox picker for finance GL accounts. Uses financeAccountsService types + useFinanceAccounts | AccountCombobox |
| `AddOrderItemModal` | `frontend/user-portal/src/components/sales/AddOrderItemModal.tsx:1` | Modal to add a line item to a sales order | AddOrderItemModal |
| `AddVirtualCropModal` | `frontend/user-portal/src/components/farm/AddVirtualCropModal.tsx:1` | Modal to add a virtual crop to a block. Uses farmApi + plantDataEnhancedApi | AddVirtualCropModal |
| `AddWidgetModal` | `frontend/user-portal/src/components/dashboard/AddWidgetModal.tsx:1` | Modal for adding configurable widgets to the dashboard | AddWidgetModal |
| `AgriDataTab` | `frontend/user-portal/src/components/farm/weather/AgriDataTab.tsx:1` | Weather widget — agronomic indices tab | AgriDataTab |
| `AirQualityCard` | `frontend/user-portal/src/components/farm/weather/AirQualityCard.tsx:1` | Weather widget — air quality card | AirQualityCard |
| `AmendPropagationModal` | `frontend/user-portal/src/components/genetics/AmendPropagationModal.tsx:1` | Corrects a propagation event's performedAt after the fact (the only field the endpoint accepts). Cascades to every child accession's acquiredAt, but only where it still equals the event's OLD performedAt. Does not auto-close on success like other genetics create-modals -- swaps to a result view showing what moved vs was skipped; only 'Done' closes it. | AmendPropagationModal |
| `ApprovalInboxPage` | `frontend/user-portal/src/pages/purchasing/ApprovalInboxPage.tsx:1` | Page: pending approval inbox. Uses purchasingApi | default |
| `ApprovalRulesPage` | `frontend/user-portal/src/pages/finance/ApprovalRulesPage.tsx:1` | Page: finance approval rules editor. Uses approvalRulesService + financeCompaniesService | default |
| `ArCreditNoteDetailPage` | `frontend/user-portal/src/pages/sales/ArCreditNoteDetailPage.tsx:1` | Page: AR Credit Note detail/transition/delete. Uses useArCreditNote/useTransitionArCreditNote/useDeleteArCreditNote. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | ArCreditNoteDetailPage, default |
| `ArCreditNoteFormPage` | `frontend/user-portal/src/pages/sales/ArCreditNoteFormPage.tsx:1` | Page: AR Credit Note create/edit form, sourceable from an existing Return or AR Invoice (useReturn/useArInvoice). Uses SalesItemCombobox, CurrencyCombobox, PaymentTermsCombobox, CompanyCombobox. | ArCreditNoteFormPage |
| `ArCreditNotesPage` | `frontend/user-portal/src/pages/sales/ArCreditNotesPage.tsx:1` | Page: AR Credit Notes list. Uses useArCreditNotes; status badges via salesStatusToPhase. | ArCreditNotesPage, default |
| `AreaBudgetBar` | `frontend/user-portal/src/components/farm/AreaBudgetBar.tsx:1` | Shared stacked area-budget bar (used / optional projected-new / remaining segments) extracted from AddVirtualCropModal into a standalone component so AddVirtualCropModal, PhysicalBlockCard, and BlockDetail share one visual source of truth. | AreaBudgetBar, AreaBudgetBarProps |
| `AssetInventoryList` | `frontend/user-portal/src/pages/inventory/AssetInventoryList.tsx:1` | Page: asset inventory list. Uses inventoryApi + farmApi | default |
| `AttachmentList` | `frontend/user-portal/src/components/attachments/AttachmentList.tsx:1` | Reusable list of document attachments with download links. Uses attachmentsService | AttachmentList |
| `AuditHistoryModal` | `frontend/user-portal/src/components/finance/AuditHistoryModal/AuditHistoryModal.tsx:1` | Modal showing per-document audit log with actor name resolution. T-064: uses useAdminUsers gated by viewerRole prop (only admin/super_admin call GET /v1/users) | AuditHistoryModal, AuditHistoryModalProps |
| `AutoNameBanner` | `frontend/user-portal/src/components/common/AutoNameBanner.tsx:1` | Dismissible cosmetic banner shown when user.nameAutoDerived is true (e.g. a Cloudflare Access JIT-provisioned account whose name was guessed from the email local-part). Dismissal persisted per-userId in localStorage. 'Set your real name' navigates to /profile?focus=name so Profile.tsx auto-enters edit mode focused on First Name. Mounted unconditionally by MainLayout; renders null once the name is fixed or dismissed. | AutoNameBanner |
| `BackupCodesModal` | `frontend/user-portal/src/components/auth/BackupCodesModal.tsx:1` | Modal that displays one-time MFA backup recovery codes after setup | BackupCodesModal |
| `BalanceSheetPage` | `frontend/user-portal/src/pages/finance/BalanceSheetPage.tsx:1` | Page (T-060.8): Balance Sheet report. Uses FinanceReportPage shell, useBalanceSheet + useJournalEntries for drill-down. Two parallel queries for comparative dates | default |
| `BatchFormModal` | `frontend/user-portal/src/components/genetics/BatchFormModal.tsx:1` | T-800 Records one pour, previewing which additives will be snapshotted onto the batch. | BatchFormModal |
| `BiologicalEfficiencyGauge` | `frontend/user-portal/src/components/mushroom/BiologicalEfficiencyGauge.tsx:1` | Gauge widget for mushroom BE % indicator | BiologicalEfficiencyGauge |
| `BlockAlertsTab` | `frontend/user-portal/src/components/farm/BlockAlertsTab.tsx:1` | Block-details Alerts tab | BlockAlertsTab |
| `BlockAnalyticsModal` | `frontend/user-portal/src/components/farm/BlockAnalyticsModal.tsx:1` | Block analytics modal. Uses useBlockAnalytics | BlockAnalyticsModal |
| `BlockArchivesTab` | `frontend/user-portal/src/components/farm/BlockArchivesTab.tsx:1` | Block-details Archives tab (closed plantings) | BlockArchivesTab |
| `BlockAutomationTab` | `frontend/user-portal/src/components/farm/BlockAutomationTab.tsx:1` | Block-details Automation tab (fertigation schedules) | BlockAutomationTab |
| `BlockCard` | `frontend/user-portal/src/components/farm/BlockCard.tsx:1` | Block card with quick actions. Renders PlantAssignmentModal, BlockAnalyticsModal. Calls farmApi | BlockCard |
| `BlockDetail` | `frontend/user-portal/src/components/farm/BlockDetail.tsx:1` | Block detail panel rendering tabs (alerts, automation, harvests, archives) | BlockDetail |
| `BlockDetailsModal` | `frontend/user-portal/src/components/farm/BlockDetailsModal.tsx:1` | Modal hosting BlockDetail tabs | BlockDetailsModal |
| `BlockGrid` | `frontend/user-portal/src/components/farm/BlockGrid.tsx:1` | Grid of block cards for a farm | BlockGrid |
| `BlockGrid` | `frontend/user-portal/src/components/farm/dashboard/BlockGrid.tsx:1` | Dashboard variant of block grid (compact) | BlockGrid |
| `BlockHarvestEntryModal` | `frontend/user-portal/src/components/farm/BlockHarvestEntryModal.tsx:1` | Modal for recording a block harvest entry | BlockHarvestEntryModal |
| `BlockHarvestsTab` | `frontend/user-portal/src/components/farm/BlockHarvestsTab.tsx:1` | Block-details Harvests tab | BlockHarvestsTab |
| `BlockMonitorHero` | `frontend/user-portal/src/components/farm/BlockMonitorHero.tsx:1` | Hero block of the block monitor dashboard | BlockMonitorHero |
| `BlockTaskList` | `frontend/user-portal/src/pages/operations/BlockTaskList.tsx:1` | Page: block task list. Uses farmApi getBlock + tasksApi getBlockTasks | default |
| `BlockViewToggle` | `frontend/user-portal/src/components/farm/BlockViewToggle.tsx:1` | Toggle between virtual / physical block views | BlockViewToggle |
| `BudgetForm` | `frontend/user-portal/src/components/marketing/BudgetForm.tsx:1` | Create/edit marketing budget form. Uses marketingService | BudgetForm |
| `BudgetManagementPage` | `frontend/user-portal/src/pages/marketing/BudgetManagementPage.tsx:1` | Page: marketing budget management. Uses marketingService | default |
| `BudgetTable` | `frontend/user-portal/src/components/marketing/BudgetTable.tsx:1` | Paginated marketing budget table | BudgetTable |
| `CRMPage` | `frontend/user-portal/src/pages/crm/CRMPage.tsx:1` | Page: CRM customers list. Uses crmService | default |
| `CampaignCard` | `frontend/user-portal/src/components/marketing/CampaignCard.tsx:1` | Campaign summary card. Uses marketingService | CampaignCard |
| `CampaignForm` | `frontend/user-portal/src/components/marketing/CampaignForm.tsx:1` | Create/edit campaign form | CampaignForm |
| `CampaignManagementPage` | `frontend/user-portal/src/pages/marketing/CampaignManagementPage.tsx:1` | Page: marketing campaign management. Uses marketingService | default |
| `CampaignTable` | `frontend/user-portal/src/components/marketing/CampaignTable.tsx:1` | Paginated campaign table | CampaignTable |
| `CashFlowStatementPage` | `frontend/user-portal/src/pages/finance/CashFlowStatementPage.tsx:1` | Page (T-060.10): Cash Flow Statement (indirect method). Uses FinanceReportPage shell, useCashFlow. Renders reconciliation warning banner | default |
| `ChannelForm` | `frontend/user-portal/src/components/marketing/ChannelForm.tsx:1` | Create/edit marketing channel form | ChannelForm |
| `ChannelManagementPage` | `frontend/user-portal/src/pages/marketing/ChannelManagementPage.tsx:1` | Page: marketing channel management. Uses marketingService | default |
| `ChannelTable` | `frontend/user-portal/src/components/marketing/ChannelTable.tsx:1` | Paginated channel table | ChannelTable |
| `ChartOfAccountsPage` | `frontend/user-portal/src/pages/finance/ChartOfAccountsPage.tsx:1` | Page: chart of accounts editor. Uses financeAccountsService | default |
| `ChemicalsCatalog` | `frontend/user-portal/src/pages/tools/ChemicalsCatalog.tsx:1` | Page: chemicals catalogue tool | default |
| `ClearCache` | `frontend/user-portal/src/pages/debug/ClearCache.tsx:1` | Page: dev tool to clear local caches | default |
| `CompactBlockCard` | `frontend/user-portal/src/components/farm/dashboard/CompactBlockCard.tsx:1` | Compact block card variant for the dashboard | CompactBlockCard |
| `CompanyCombobox` | `frontend/user-portal/src/components/sales/CompanyCombobox.tsx:1` | Four-state picker for the companyCode field on sales create forms (loading / single-company disabled-but-visible / multi-company searchable / no companies). shouldShowCompanyField is kept for backward compatibility but now always returns true. | CompanyCombobox, CompanyComboboxProps, shouldShowCompanyField |
| `ConfirmationCard` | `frontend/user-portal/src/components/ai/ConfirmationCard.tsx:1` | Inline confirmation card rendered inside AI chat for tool-call approvals | ConfirmationCard |
| `ContractTab` | `frontend/user-portal/src/components/hr/ContractTab.tsx:1` | Employee detail Contract tab. Uses hrService | ContractTab |
| `ConversationList` | `frontend/user-portal/src/components/ai-assistant/ConversationList.tsx:1` | List of AI assistant conversation threads | ConversationList |
| `CostCenterCombobox` | `frontend/user-portal/src/components/finance/CostCenterCombobox/CostCenterCombobox.tsx:1` | Combobox picker for finance cost centres. Uses costCentersService types + useCostCenters | CostCenterCombobox, CostCenterComboboxProps |
| `CreateBlockModal` | `frontend/user-portal/src/components/farm/CreateBlockModal.tsx:1` | Modal to create a block | CreateBlockModal |
| `CreateFarmModal` | `frontend/user-portal/src/components/farm/CreateFarmModal.tsx:1` | Modal to create a farm. Uses farmApi | CreateFarmModal |
| `CurrencyCombobox` | `frontend/user-portal/src/components/sales/CurrencyCombobox.tsx:1` | Constrained dropdown for an ISO 4217 currency code from a hardcoded GCC + common-currency list; the tenant's base currency (via useFinanceCompanies) is pinned to the top with a 'Base' badge. Mirrors CustomerCombobox/SalesItemCombobox interaction pattern. | CurrencyCombobox, CurrencyComboboxProps |
| `CurrentWeatherCard` | `frontend/user-portal/src/components/farm/weather/CurrentWeatherCard.tsx:1` | Weather widget — current conditions card | CurrentWeatherCard |
| `CustomerCard` | `frontend/user-portal/src/components/crm/CustomerCard.tsx:1` | CRM customer summary card. Uses crmService helpers | CustomerCard |
| `CustomerCombobox` | `frontend/user-portal/src/components/sales/CustomerCombobox.tsx:1` | Combobox to pick a customer. Uses crmService | CustomerCombobox |
| `CustomerDetailPage` | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx:1` | Page: single customer detail. Uses crmService | default |
| `CustomerForm` | `frontend/user-portal/src/components/crm/CustomerForm.tsx:1` | Create/edit customer form. Uses crmService | CustomerForm |
| `CustomerReceiptDetailPage` | `frontend/user-portal/src/pages/sales/CustomerReceiptDetailPage.tsx:1` | Page: Customer Receipt detail. Uses useCustomerReceipt hooks. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | CustomerReceiptDetailPage |
| `CustomerReceiptFormPage` | `frontend/user-portal/src/pages/sales/CustomerReceiptFormPage.tsx:1` | Page: Customer Receipt create/edit form -- allocates payment against one or more AR Invoices (useArInvoice) via useFinanceAccounts for the deposit account. Uses CustomerCombobox, CurrencyCombobox, CompanyCombobox. | CustomerReceiptFormPage |
| `CustomerReceiptsPage` | `frontend/user-portal/src/pages/sales/CustomerReceiptsPage.tsx:1` | Page: Customer Receipts list. Uses useCustomerReceipts; status badges via salesStatusToPhase. | CustomerReceiptsPage, default |
| `CustomerTable` | `frontend/user-portal/src/components/crm/CustomerTable.tsx:1` | Paginated customer table. Uses crmService helpers | CustomerTable |
| `Dashboard` | `frontend/user-portal/src/pages/dashboard/Dashboard.tsx:1` | Page: main dashboard. Uses apiClient + farmApi | default |
| `DashboardFilters` | `frontend/user-portal/src/components/farm/dashboard/DashboardFilters.tsx:1` | Farm dashboard filters bar | DashboardFilters |
| `DashboardSettings` | `frontend/user-portal/src/components/farm/dashboard/DashboardSettings.tsx:1` | Farm dashboard settings panel | DashboardSettings |
| `DeleteOrderConfirmModal` | `frontend/user-portal/src/components/sales/DeleteOrderConfirmModal.tsx:1` | Confirm modal for deleting a sales order with allocation preview. Uses salesService | DeleteOrderConfirmModal |
| `DeleteRoomDialog` | `frontend/user-portal/src/components/mushroom/DeleteRoomDialog.tsx:1` | Confirms deletion of a growing room; runs a dependency check up-front (via useRoomDependents) and refuses when records are attached, offering the decommissioned-phase alternative (useAdvancePhase) instead so history is preserved. | DeleteRoomDialog |
| `DeliveriesPage` | `frontend/user-portal/src/pages/sales/DeliveriesPage.tsx:1` | Page: Deliveries (DN) list. Uses useDeliveries; status badges via salesStatusToPhase. | DeliveriesPage, default |
| `DeliveryDetailPage` | `frontend/user-portal/src/pages/sales/DeliveryDetailPage.tsx:1` | Page: Delivery Note detail. Uses useDelivery hooks. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | DeliveryDetailPage, default |
| `DeliveryFormPage` | `frontend/user-portal/src/pages/sales/DeliveryFormPage.tsx:1` | Page: Delivery Note create/edit form, sourced from a Sales Order (useSalesOrderV2). Uses SalesItemCombobox, CompanyCombobox; renders AttachmentList. | DeliveryFormPage |
| `DeploymentSettingsCard` | `frontend/user-portal/src/components/settings/DeploymentSettingsCard.tsx:1` | super_admin-only Settings card for PUBLIC_BASE_URL/FRONTEND_URL and the six CF_ACCESS_* deployment keys, via GET/PATCH systemService.getDeploymentSettings/updateDeploymentSettings. Env-pinned keys render read-only; CF_ACCESS_TEAM_DOMAIN/CF_ACCESS_AUD are write-only secrets (never round-tripped, only isSet+maskedHint). Every save requires current-password re-confirmation in a modal (closes only via X, never on overlay click); enabling CF_ACCESS_EXCLUSIVE requires its own separate confirmation. | DeploymentSettingsCard |
| `DivisionSelector` | `frontend/user-portal/src/pages/division/DivisionSelector.tsx:1` | Page: organization-division selector (post-login) | default |
| `DivisionSwitcher` | `frontend/user-portal/src/components/layout/DivisionSwitcher.tsx:1` | Header switcher for active organization division/branch | DivisionSwitcher |
| `DrawingControls` | `frontend/user-portal/src/components/map/DrawingControls.tsx:1` | MapLibre drawing controls (draw polygon, edit, delete) | DrawingControls |
| `EditAccessionModal` | `frontend/user-portal/src/components/genetics/EditAccessionModal.tsx:1` | Edits an existing accession's editable fields (storage location via LocationPicker, status, notes, etc.) via useUpdateAccession. Companion to RegisterAccessionModal (create) rather than a replacement. | EditAccessionModal |
| `EditBlockModal` | `frontend/user-portal/src/components/farm/EditBlockModal.tsx:1` | Modal to edit a block | EditBlockModal |
| `EditFarmBoundaryModal` | `frontend/user-portal/src/components/farm/EditFarmBoundaryModal.tsx:1` | Modal for editing farm geo-boundary polygon | EditFarmBoundaryModal |
| `EditFarmModal` | `frontend/user-portal/src/components/farm/EditFarmModal.tsx:1` | Modal to edit a farm. Uses farmApi | EditFarmModal |
| `EmployeeCard` | `frontend/user-portal/src/components/hr/EmployeeCard.tsx:1` | Employee summary card. Uses hrService helpers | EmployeeCard |
| `EmployeeDetailPage` | `frontend/user-portal/src/pages/hr/EmployeeDetailPage.tsx:1` | Page: employee detail with tabs (Contract, Insurance, Performance, Visa). Uses hrService | default |
| `EmployeeForm` | `frontend/user-portal/src/components/hr/EmployeeForm.tsx:1` | Create/edit employee form | EmployeeForm |
| `EmployeeListPage` | `frontend/user-portal/src/pages/hr/EmployeeListPage.tsx:1` | Page: employee list. Uses hrService | default |
| `EmployeeTable` | `frontend/user-portal/src/components/hr/EmployeeTable.tsx:1` | Paginated employee table | EmployeeTable |
| `EmptyVirtualBlockModal` | `frontend/user-portal/src/components/farm/EmptyVirtualBlockModal.tsx:1` | Modal shown when a virtual block has no plantings | EmptyVirtualBlockModal |
| `EventForm` | `frontend/user-portal/src/components/marketing/EventForm.tsx:1` | Create/edit marketing event form | EventForm |
| `EventManagementPage` | `frontend/user-portal/src/pages/marketing/EventManagementPage.tsx:1` | Page: marketing event management. Uses marketingService | default |
| `EventTable` | `frontend/user-portal/src/components/marketing/EventTable.tsx:1` | Paginated event table | EventTable |
| `FacilityCard` | `frontend/user-portal/src/components/mushroom/FacilityCard.tsx:1` | Mushroom facility summary card | FacilityCard |
| `FarmAIChat` | `frontend/user-portal/src/components/farm/FarmAIChat.tsx:1` | Farm-context AI chat surface | FarmAIChat |
| `FarmAnalyticsModal` | `frontend/user-portal/src/components/farm/FarmAnalyticsModal.tsx:1` | Farm-level analytics modal | FarmAnalyticsModal |
| `FarmBlocksView` | `frontend/user-portal/src/pages/operations/FarmBlocksView.tsx:1` | Page: farm blocks view. Uses farmApi + tasksApi | default |
| `FarmCard` | `frontend/user-portal/src/components/farm/FarmCard.tsx:1` | Farm summary card used in FarmList grid | FarmCard |
| `FarmDashboard` | `frontend/user-portal/src/components/farm/FarmDashboard.tsx:1` | Main farm module dashboard showing key metrics and quick actions. Uses farmApi and renders GlobalFarmAnalyticsModal | FarmDashboard |
| `FarmDetail` | `frontend/user-portal/src/components/farm/FarmDetail.tsx:1` | Single farm detail view with tabs (history, virtual blocks, physical blocks) | FarmDetail |
| `FarmHistoryTab` | `frontend/user-portal/src/components/farm/FarmHistoryTab.tsx:1` | Farm-detail History tab. Uses farmApi | FarmHistoryTab |
| `FarmList` | `frontend/user-portal/src/components/farm/FarmList.tsx:1` | Paginated farm card grid with search/filter. Renders FarmCard, CreateFarmModal, EditFarmModal, FarmAnalyticsModal | FarmList, FarmListProps |
| `FarmManager` | `frontend/user-portal/src/pages/farm/FarmManager.tsx:1` | Page: farm management. Renders FarmList / FarmDetail / BlockDetail flow | default |
| `FarmMapView` | `frontend/user-portal/src/components/farm/FarmMapView.tsx:1` | MapLibre-based farm map view. Renders MapContainer + DrawingControls | FarmMapView |
| `FarmQuickSwitcher` | `frontend/user-portal/src/components/farm/FarmQuickSwitcher.tsx:1` | Quick switcher dropdown for active farm context | FarmQuickSwitcher |
| `FarmingYearSelector` | `frontend/user-portal/src/components/farm/FarmingYearSelector.tsx:1` | Year selector for farming-year scoped views. Uses farmApi types | FarmingYearSelector |
| `FertigationScheduleEditorModal` | `frontend/user-portal/src/components/farm/FertigationScheduleEditorModal.tsx:1` | Modal to edit a fertigation schedule | FertigationScheduleEditorModal |
| `FertilizerCostCalculator` | `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx:1` | Page: fertiliser cost calculator. Uses apiClient + plantDataEnhancedApi | default |
| `FinanceGate` | `frontend/user-portal/src/components/finance/FinanceGate.tsx:1` | Route gate that hides finance routes when tenant.modules.financeEnabled is false | FinanceGate |
| `FinanceReportPage` | `frontend/user-portal/src/components/finance/FinanceReportPage/FinanceReportPage.tsx:1` | Shared finance report shell (filters bar, display options, drill-down) used by Balance Sheet, Income Statement, Cash Flow pages. Uses apiClient for drill-down | FinanceReportPage |
| `FinanceUnreachableBanner` | `frontend/user-portal/src/components/finance/FinanceUnreachableBanner.tsx:1` | Banner shown on purchasing forms when finance service is unreachable (Wave 0 ops-only mode signal) | FinanceUnreachableBanner |
| `ForecastCard` | `frontend/user-portal/src/components/farm/weather/ForecastCard.tsx:1` | Weather widget — forecast card | ForecastCard |
| `GeneticsRepoPage` | `frontend/user-portal/src/pages/genetics/GeneticsRepoPage.tsx:1` | T-800 Repo home at /genetics — dashboard counters and line cards with accession rollups, filterable by biological kind. | GeneticsRepoPage |
| `GlobalFarmAnalyticsModal` | `frontend/user-portal/src/components/farm/GlobalFarmAnalyticsModal.tsx:1` | Cross-farm analytics modal opened from FarmDashboard | GlobalFarmAnalyticsModal |
| `GoodsReceiptDetailPage` | `frontend/user-portal/src/pages/purchasing/GoodsReceiptDetailPage.tsx:1` | Page: goods receipt detail | default |
| `GoodsReceiptFormPage` | `frontend/user-portal/src/pages/purchasing/GoodsReceiptFormPage.tsx:1` | Page: goods receipt form. Renders FinanceUnreachableBanner. Uses goodsReceiptsService | default |
| `GoodsReceiptsPage` | `frontend/user-portal/src/pages/purchasing/GoodsReceiptsPage.tsx:1` | Page: goods receipts list. Uses goodsReceiptsService | default |
| `GrowingProfilePanel` | `frontend/user-portal/src/components/genetics/GrowingProfilePanel.tsx:1` | Renders a genetic line's growing-profile parameters on LineDetailPage. | GrowingProfilePanel |
| `GrowingRoomCard` | `frontend/user-portal/src/components/mushroom/GrowingRoomCard.tsx:1` | Growing room summary card | GrowingRoomCard |
| `GrowingRoomGrid` | `frontend/user-portal/src/components/mushroom/GrowingRoomGrid.tsx:1` | Grid of growing-room cards | GrowingRoomGrid |
| `HRDashboardPage` | `frontend/user-portal/src/pages/hr/HRDashboardPage.tsx:1` | Page: HR dashboard. Uses hrService | default |
| `HarvestEntryModal` | `frontend/user-portal/src/components/mushroom/HarvestEntryModal.tsx:1` | Mushroom harvest entry modal | HarvestEntryModal |
| `HarvestEntryModal` | `frontend/user-portal/src/components/operations/HarvestEntryModal.tsx:1` | Operations module harvest entry modal. Uses tasksApi addHarvestEntry | HarvestEntryModal |
| `HarvestInventoryList` | `frontend/user-portal/src/pages/inventory/HarvestInventoryList.tsx:1` | Page: harvest inventory list. Uses inventoryApi + farmApi + plantDataEnhancedApi | default |
| `HelpButton` | `frontend/user-portal/src/components/tutorials/HelpButton.tsx:1` | Drop-in '?' button + TutorialModal for any page/modal header (e.g. <HelpButton topic="genetics.propagate" />). Auto-opens the tutorial once per topic per user (dismissed state stored server-side via useMarkTutorialSeen/useSeenTutorials), never while another dialog is open. autoOpen={false} opts a placement out entirely. | HelpButton |
| `IncomeStatementPage` | `frontend/user-portal/src/pages/finance/IncomeStatementPage.tsx:1` | Page (T-060.9): Income Statement report. Uses FinanceReportPage shell, useIncomeStatement (single-call primary + comparison) | default |
| `IncomingPreviewPage` | `frontend/user-portal/src/pages/finance/IncomingPreviewPage.tsx:1` | Page: preview incoming documents from purchasing. Uses purchasingApi | default |
| `IndustryDashboard` | `frontend/user-portal/src/pages/dashboard/IndustryDashboard.tsx:1` | Routes /dashboard to the dashboard matching the current division's industryType: MushroomDashboardPage for 'mushroom', FarmDashboard otherwise (fallback, incl. divisions predating industry typing). Lazy-loaded via Suspense. Replaces the old always-farm /dashboard route. | IndustryDashboard |
| `InputBox` | `frontend/user-portal/src/components/ai-assistant/InputBox.tsx:1` | Multiline text input + send button for the AI assistant | InputBox |
| `InputInventoryList` | `frontend/user-portal/src/pages/inventory/InputInventoryList.tsx:1` | Page: input (fertilisers/chemicals) inventory list. Uses inventoryApi + farmApi | default |
| `InsightsCard` | `frontend/user-portal/src/components/farm/weather/InsightsCard.tsx:1` | Weather widget — AI insights card | InsightsCard |
| `InsuranceTab` | `frontend/user-portal/src/components/hr/InsuranceTab.tsx:1` | Employee detail Insurance tab. Uses hrService | InsuranceTab |
| `InventoryDashboard` | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx:1` | Page: inventory dashboard. Uses inventoryApi getInventorySummary | default |
| `ItemMappingPage` | `frontend/user-portal/src/pages/finance/ItemMappingPage.tsx:1` | Page: item-to-GL-account mapping editor. Uses itemMappingService + taxCodesService + financeAccountsService | default |
| `JournalEntriesPage` | `frontend/user-portal/src/pages/finance/JournalEntriesPage.tsx:1` | Page: journal entries list. Uses journalEntriesService types | default |
| `KIND_ICON_COMPONENTS` | `frontend/user-portal/src/components/genetics/kindIcons.ts:1` | Night Observatory-era per-domain icon map: OrganismKind -> lucide-react icon component, used anywhere a line's biological kind (plant/fungus/animal/other) needs a consistent glyph. | KIND_ICON_COMPONENTS |
| `LabelInfoPage` | `frontend/user-portal/src/pages/public/LabelInfoPage.tsx:1` | T-804/T-805/T-806 part 3. The public page a scanned QR opens — registered at both /i/:token and /I/:token (plus /:vesselNo variants), outside ProtectedRoute and MainLayout entirely. Plain fetch on a relative path rather than the shared axios instance/geneticsApi, deliberately: the authenticated client would attach a token and redirect an anonymous scan to /login. Renders lineageGraph as a lightweight local generation-row tree (not an adapter onto components/genetics/LineageTree.tsx, which is sized for the much larger authenticated graph and keyed by internal UUID the public payload never carries) with the scanned node highlighted at a measured 14.08:1 contrast. | LabelInfoPage |
| `LineDetailPage` | `frontend/user-portal/src/pages/genetics/LineDetailPage.tsx:1` | T-800 /genetics/lines/:lineId — lineage tree as the hero, accession table, recent propagations, and a senescence warning past G5. | LineDetailPage |
| `LineFormModal` | `frontend/user-portal/src/components/genetics/LineFormModal.tsx:1` | T-800 Create/edit a genetic line, including parent line, derivation and provenance. | LineFormModal |
| `LineYieldPanel` | `frontend/user-portal/src/components/genetics/LineYieldPanel.tsx:1` | Renders yield history/rollups for a genetic line on LineDetailPage. | LineYieldPanel |
| `LineageTree` | `frontend/user-portal/src/components/genetics/LineageTree.tsx:1` | T-800 Renders the lineage DAG as generation rows joined by SVG curves. Layout is computed deterministically from fixed node dimensions, so no measurement pass is needed. Edge colour encodes reproduction mode; unidentified parents render as dashed stubs. | LineageTree |
| `LocationPicker` | `frontend/user-portal/src/components/genetics/LocationPicker.tsx:1` | Shared storage-location picker (facility/room/tape-style position field) used by both RegisterAccessionModal (create) and EditAccessionModal (edit) so the two forms can't drift on how a StorageLocation is captured. | LocationPicker |
| `Login` | `frontend/user-portal/src/pages/auth/Login.tsx:1` | Page: login form. Fetches authService.cfAccessStatus() once on mount and renders a 'Sign in with Cloudflare Access' button when enabled; the password form is hidden entirely only when Cloudflare Access is in exclusive mode AND the page isn't served from localhost. cfAccessLogin() success redirects to /pending-activation if that outcome is returned instead of full auth. | default |
| `LogisticsDashboardPage` | `frontend/user-portal/src/pages/logistics/LogisticsDashboardPage.tsx:1` | Page: logistics dashboard. Uses logisticsService | default |
| `MFARouteGuards` | `frontend/user-portal/src/components/common/MFARouteGuards.tsx:1` | MFA route guards: MFAVerifyGuard requires MFA pending token, MFASetupGuard blocks if MFA already enabled | MFAVerifyGuard, MFASetupGuard |
| `MFASetupPage` | `frontend/user-portal/src/pages/auth/MFASetupPage.tsx:1` | Page: MFA TOTP setup. Renders BackupCodesModal on success | default |
| `MFAVerifyPage` | `frontend/user-portal/src/pages/auth/MFAVerifyPage.tsx:1` | Page: MFA code verification. Uses authService | default |
| `MainLayout` | `frontend/user-portal/src/components/layout/MainLayout.tsx:1` | Main app layout with sidebar navigation, header, FinanceGate-aware menu and Outlet for nested routes. Uses useAuthStore and tasksApi. Mounts AutoNameBanner unconditionally in the layout shell. | MainLayout |
| `ManualJournalEntryPage` | `frontend/user-portal/src/pages/finance/ManualJournalEntryPage.tsx:1` | Page: finance-admin manual JE form (RHF + Zod). Renders AccountCombobox + CostCenterCombobox. Uses useFinanceAccounts, useCostCenters, useFinanceCompanies, useFiscalPeriods, useCreateManualJournalEntry | default |
| `MapContainer` | `frontend/user-portal/src/components/map/MapContainer.tsx:1` | MapLibre GL container wrapper | MapContainer |
| `MapSearchBar` | `frontend/user-portal/src/components/map/MapSearchBar.tsx:1` | Map geocoder search bar | MapSearchBar |
| `MarketingDashboardPage` | `frontend/user-portal/src/pages/marketing/MarketingDashboardPage.tsx:1` | Page: marketing dashboard. Uses marketingService | default |
| `MediaLibraryPage` | `frontend/user-portal/src/pages/genetics/MediaLibraryPage.tsx:1` | T-800 /genetics/media — recipes, prepared batches, and the clickable additive chips that run the exposed-material readout. | MediaLibraryPage |
| `MessageBubble` | `frontend/user-portal/src/components/ai-assistant/MessageBubble.tsx:1` | Rendered chat message bubble (user/assistant) with markdown + tool-call children | MessageBubble |
| `MessageList` | `frontend/user-portal/src/components/ai-assistant/MessageList.tsx:1` | Scrollable list of MessageBubble entries for the AI assistant | MessageList |
| `Modal` | `frontend/user-portal/src/components/genetics/Modal.tsx:1` | T-800 Shared modal shell for the genetics screens. Deliberately does not close on backdrop click — the X button or Cancel are the only exits, so half-filled propagation forms survive a stray click. NOTE: node_id is scoped to avoid a generic `component::Modal` collision; the actual export is `Modal`. | Modal |
| `ModulesSettingsCard` | `frontend/user-portal/src/components/settings/ModulesSettingsCard.tsx:1` | Settings card for toggling tenant modules (financeEnabled flag — Wave 0) | ModulesSettingsCard |
| `MushroomDashboardPage` | `frontend/user-portal/src/pages/mushroom/MushroomDashboardPage.tsx:1` | Page: mushroom dashboard | default |
| `MushroomFacilityManager` | `frontend/user-portal/src/pages/mushroom/MushroomFacilityManager.tsx:1` | Page: mushroom facility manager | default |
| `MushroomRoomMonitor` | `frontend/user-portal/src/pages/mushroom/MushroomRoomMonitor.tsx:1` | Page: mushroom room monitor. Uses apiClient | default |
| `MushroomStrainLibrary` | `frontend/user-portal/src/pages/mushroom/MushroomStrainLibrary.tsx:1` | Page: mushroom strain library | default |
| `NotFound` | `frontend/user-portal/src/pages/NotFound.tsx:1` | Page: 404 not-found | default |
| `ObservationModal` | `frontend/user-portal/src/components/genetics/ObservationModal.tsx:1` | T-800 Records observations with optional metrics; the novel-trait flag is surfaced prominently since it gates promotion. | ObservationModal |
| `OperationsDashboard` | `frontend/user-portal/src/pages/operations/OperationsDashboard.tsx:1` | Page: operations dashboard. Uses farmApi + tasksApi | default |
| `OrderCard` | `frontend/user-portal/src/components/sales/OrderCard.tsx:1` | Sales order summary card | OrderCard |
| `OrderForm` | `frontend/user-portal/src/components/sales/OrderForm.tsx:1` | Create/edit sales order form | OrderForm |
| `OrderTable` | `frontend/user-portal/src/components/sales/OrderTable.tsx:1` | Paginated sales order table | OrderTable |
| `OrphanSweepCard` | `frontend/user-portal/src/components/settings/OrphanSweepCard.tsx:38` | T-809. Settings-page card wrapping useOrphans/useDeleteOrphans — the org-wide orphan sweep UI. Self-gates to super_admin (same pattern as the existing ModulesSettingsCard), rendered alongside it in Settings.tsx. | OrphanSweepCard |
| `PaymentDetailPage` | `frontend/user-portal/src/pages/finance/PaymentDetailPage.tsx:1` | Page: AP payment detail. Uses paymentsService types | default |
| `PaymentTermsCombobox` | `frontend/user-portal/src/components/sales/PaymentTermsCombobox.tsx:1` | Typeahead combobox over the payment_terms master (usePaymentTerms, same source as purchasing's PR/PO forms). Returns termsId + description + netDays via onChange. Mirrors CustomerCombobox/SalesItemCombobox interaction pattern. | PaymentTermsCombobox, PaymentTermsComboboxProps, PaymentTermsSelection |
| `PaymentTermsPage` | `frontend/user-portal/src/pages/purchasing/PaymentTermsPage.tsx:1` | Page: payment terms editor. Uses purchasingApi | default |
| `PaymentsPage` | `frontend/user-portal/src/pages/finance/PaymentsPage.tsx:1` | Page: AP payments list. Uses paymentsService | default |
| `PendingActivation` | `frontend/user-portal/src/pages/auth/PendingActivation.tsx:1` | Public route (no ProtectedRoute) shown when a login attempt resolves to the pending_activation outcome from either login path (cfAccessLogin JIT-provisioned-but-unapproved, or password login against an isActive:false account). Reads pendingActivation/pendingActivationEmail off useAuthStore; Sign Out calls the Cloudflare-aware logout(). Deliberately does not distinguish which login path produced the outcome. | PendingActivation |
| `PendingTasksWarningModal` | `frontend/user-portal/src/components/farm/PendingTasksWarningModal.tsx:1` | Warning modal listing pending farm tasks before destructive actions | PendingTasksWarningModal |
| `PerformanceTab` | `frontend/user-portal/src/components/hr/PerformanceTab.tsx:1` | Employee detail Performance tab | PerformanceTab |
| `PeriodsPage` | `frontend/user-portal/src/pages/finance/PeriodsPage.tsx:1` | Page: fiscal periods management. T-060.11: renders AuditHistoryModal with viewerRole prop. Close modal uses dry-run ClosingJePreviewPanel. Uses fiscalPeriodsService + useFinanceCompanies | default |
| `PhysicalBlockCard` | `frontend/user-portal/src/components/farm/PhysicalBlockCard.tsx:1` | Physical block card summarising plantings | PhysicalBlockCard |
| `PhysicalBlockGrid` | `frontend/user-portal/src/components/farm/PhysicalBlockGrid.tsx:1` | Physical-block-only grid variant | PhysicalBlockGrid |
| `PhysicalBlockPlantingsModal` | `frontend/user-portal/src/components/farm/PhysicalBlockPlantingsModal.tsx:1` | Modal listing current plantings for a physical block | PhysicalBlockPlantingsModal |
| `PlantAssignmentModal` | `frontend/user-portal/src/components/farm/PlantAssignmentModal.tsx:1` | Modal to assign a plant to a block | PlantAssignmentModal |
| `PlantCombobox` | `frontend/user-portal/src/components/farm/PlantCombobox.tsx:1` | Data-driven typeahead combobox for selecting a crop/plant, mirroring SalesItemCombobox's interaction pattern (chip-on-select, keyboard nav, portaled dropdown via createPortal). Props-driven only — does not call any data hook itself. Used by AddVirtualCropModal. | PlantCombobox, PlantComboboxProps |
| `PlantDataCard` | `frontend/user-portal/src/components/farm/PlantDataCard.tsx:1` | Plant data summary card | PlantDataCard |
| `PlantDataDetail` | `frontend/user-portal/src/components/farm/PlantDataDetail.tsx:1` | Plant data detail panel | PlantDataDetail |
| `PlantDataFormModal` | `frontend/user-portal/src/components/farm/PlantDataFormModal.tsx:1` | Create/edit plant data modal | PlantDataFormModal |
| `PlantDataLibrary` | `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx:1` | Page: plant data library with CSV import. Uses plantDataEnhancedApi | default |
| `PlantMotherCard` | `frontend/user-portal/src/components/farm/PlantMotherCard.tsx:205` | Plant Library mother (product/folder) card with variety count and view/edit/delete/add-variety actions. | PlantMotherCard, PlantMotherCardProps |
| `PlantMotherDetailModal` | `frontend/user-portal/src/components/farm/PlantMotherDetailModal.tsx:328` | Detail modal for a Plant Library mother showing its varieties and per-variety actions. | PlantMotherDetailModal, PlantMotherDetailModalProps |
| `PlantMotherFormModal` | `frontend/user-portal/src/components/farm/PlantMotherFormModal.tsx:260` | Create/edit modal for a Plant Library mother (plantName, scientificName, plantType). | PlantMotherFormModal, PlantMotherFormModalProps |
| `PnLPage` | `frontend/user-portal/src/pages/pnl/PnLPage.tsx:1` | Page: P&L. Renders Pnl* widget components. Uses farmApi | default |
| `PnlArAging` | `frontend/user-portal/src/components/pnl/PnlArAging.tsx:1` | P&L AR aging table | PnlArAging |
| `PnlBreakdownCharts` | `frontend/user-portal/src/components/pnl/PnlBreakdownCharts.tsx:1` | P&L breakdown charts (revenue / costs) | PnlBreakdownCharts |
| `PnlFiltersBar` | `frontend/user-portal/src/components/pnl/PnlFiltersBar.tsx:1` | P&L filters bar (period, farm) | PnlFiltersBar |
| `PnlKpiCards` | `frontend/user-portal/src/components/pnl/PnlKpiCards.tsx:1` | P&L KPI cards (Revenue, GP, EBIT, NI) | PnlKpiCards |
| `PnlRevenueConfidence` | `frontend/user-portal/src/components/pnl/PnlRevenueConfidence.tsx:1` | Revenue confidence indicator widget | PnlRevenueConfidence |
| `PnlRevenueTrendChart` | `frontend/user-portal/src/components/pnl/PnlRevenueTrendChart.tsx:1` | Revenue trend chart | PnlRevenueTrendChart |
| `PnlStatementTable` | `frontend/user-portal/src/components/pnl/PnlStatementTable.tsx:1` | P&L statement-style table | PnlStatementTable |
| `PostingSetupPage` | `frontend/user-portal/src/pages/finance/PostingSetupPage.tsx:1` | Page: company posting-setup editor. Renders AccountCombobox. Uses postingSetupService + financeAccountsService + financeCompaniesService | default |
| `PrintLabelsModal` | `frontend/user-portal/src/components/genetics/PrintLabelsModal.tsx:1` | T-804 step 5. Range + tape-size picker for genetics.api.labels, page count shown before commit, and an 'Actual size / 100%' print-dialog warning since fit-to-page rescales the QR (the most likely reason a batch fails to scan). Handles the inverted default range that arises once quantity drops below labelledVesselCount after a split. | PrintLabelsModal |
| `Profile` | `frontend/user-portal/src/pages/profile/Profile.tsx:1` | Page: user profile + MFA management. Uses authService. Supports a ?focus=name deep link (from AutoNameBanner's 'Set your real name' link) that auto-enters edit mode and focuses the First Name field. | default |
| `PromoteTraitModal` | `frontend/user-portal/src/components/genetics/PromoteTraitModal.tsx:1` | T-800 Promotes a flagged observation into a new parent-linked line, optionally minting the founding accession. | PromoteTraitModal |
| `PropagateModal` | `frontend/user-portal/src/components/genetics/PropagateModal.tsx:1` | T-800 One form for clones and crosses. Method choice drives parent-slot count, default roles and a live preview that mirrors derive_generations so the G/F numbering is never a black box. Supports an 'exists but unidentified' second parent. | PropagateModal |
| `ProtectedRoute` | `frontend/user-portal/src/components/common/ProtectedRoute.tsx:1` | Auth guard component that checks useAuthStore and redirects unauthenticated users to /login. Also attempts a silent, ref-guarded one-shot Cloudflare Access exchange on mount (authService.cfAccessStatus + store's cfAccessLogin) before falling back to the login redirect; redirects to /pending-activation instead when the store's pendingActivation flag is set. | ProtectedRoute |
| `ProtocolFormModal` | `frontend/user-portal/src/components/protocols/ProtocolFormModal.tsx:1` | Create/revise a protocol (SOP). Warns before revising an APPROVED protocol -- the action returns it to draft and pulls it off the bench until re-approved. Uses useCreateProtocol/useUpdateProtocol. | ProtocolFormModal |
| `ProtocolPicker` | `frontend/user-portal/src/components/protocols/ProtocolPicker.tsx:1` | Surfaces the active protocols matching a given scope inside the modal recording that work, and pins the one followed onto the record. Renders nothing when no protocol covers the scope. Uses useProtocolsForScope. | ProtocolPicker |
| `ProtocolViewModal` | `frontend/user-portal/src/components/protocols/ProtocolViewModal.tsx:1` | Read-only, printable view of an approved protocol -- exists so checking a step doesn't require opening the edit form (which would drop it back to draft). Print is a first-class action. | ProtocolViewModal |
| `ProtocolsPage` | `frontend/user-portal/src/pages/protocols/ProtocolsPage.tsx:1` | Page: SOP library -- draft, approve, revise protocols. Status leads every card (only ACTIVE protocols are offered at the point of work). Renders ProtocolFormModal, ProtocolViewModal, HelpButton; uses PROTOCOL_CATEGORY_ICON_COMPONENTS and PROTOCOL_STATUS_TO_PHASE. | ProtocolsPage |
| `PurchaseItemsPage` | `frontend/user-portal/src/pages/purchasing/PurchaseItemsPage.tsx:1` | Page: purchase items catalogue. Uses purchasingApi | default |
| `PurchaseOrderDetailPage` | `frontend/user-portal/src/pages/purchasing/PurchaseOrderDetailPage.tsx:1` | Page: purchase order detail | default |
| `PurchaseOrderFormPage` | `frontend/user-portal/src/pages/purchasing/PurchaseOrderFormPage.tsx:1` | Page: purchase order form. Renders FinanceUnreachableBanner. Uses taxCodesService + purchasingApi | default |
| `PurchaseOrdersPage` | `frontend/user-portal/src/pages/purchasing/PurchaseOrdersPage.tsx:1` | Page: purchase orders list. Uses purchasingApi | default |
| `PurchaseRequestDetailPage` | `frontend/user-portal/src/pages/purchasing/PurchaseRequestDetailPage.tsx:1` | Page: purchase request detail | default |
| `PurchaseRequestFormPage` | `frontend/user-portal/src/pages/purchasing/PurchaseRequestFormPage.tsx:1` | Page: purchase request form. Renders FinanceUnreachableBanner. Uses taxCodesService + purchasingApi | default |
| `PurchaseRequestsPage` | `frontend/user-portal/src/pages/purchasing/PurchaseRequestsPage.tsx:1` | Page: purchase requests list. Uses purchasingApi | default |
| `QuickPlanModal` | `frontend/user-portal/src/components/farm/dashboard/QuickPlanModal.tsx:1` | Quick crop-plan creation modal | QuickPlanModal |
| `QuickServiceChargeModal` | `frontend/user-portal/src/components/sales/QuickServiceChargeModal.tsx:1` | Raises a service-only AR Invoice against a customer in one modal instead of 6 clicks across two form pages (create SO -> transition open -> create AR Invoice from SO -> transition open). No auto-rollback on partial failure (SAP B1 pattern) -- each failed step surfaces a human-readable message. Used from CustomerDetailPage (CRM). | QuickServiceChargeModal, QuickServiceChargeModalProps |
| `QuoteDetailPage` | `frontend/user-portal/src/pages/sales/QuoteDetailPage.tsx:1` | Page: Sales Quote detail. Uses useQuote hooks. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | QuoteDetailPage |
| `QuoteFormPage` | `frontend/user-portal/src/pages/sales/QuoteFormPage.tsx:1` | Page: Sales Quote create/edit form. Uses CustomerCombobox, SalesItemCombobox, CurrencyCombobox, PaymentTermsCombobox; renders AttachmentList. | QuoteFormPage |
| `QuotesPage` | `frontend/user-portal/src/pages/sales/QuotesPage.tsx:1` | Page: Sales Quotes list. Uses useQuotes; status badges via salesStatusToPhase. | QuotesPage |
| `RecipeFormModal` | `frontend/user-portal/src/components/genetics/RecipeFormModal.tsx:1` | T-800 Dynamic ingredient and additive lists; warns that editing a formulation bumps the recipe version. | RecipeFormModal |
| `RecordPaymentPage` | `frontend/user-portal/src/pages/finance/RecordPaymentPage.tsx:1` | Page: record AP payment. Renders AccountCombobox. Uses paymentsService + apInvoicesService + financeReportsService | default |
| `Register` | `frontend/user-portal/src/pages/auth/Register.tsx:1` | Page: user registration form | default |
| `RegisterAccessionModal` | `frontend/user-portal/src/components/genetics/RegisterAccessionModal.tsx:1` | T-800 Registers founding material by hand with a live accession-code preview. | RegisterAccessionModal |
| `RemoveLineModal` | `frontend/user-portal/src/components/genetics/RemoveLineModal.tsx:97` | T-807/T-809 frontend. Sole intended consumer of usePurgeLine's cascade path (see hook::useGenetics). Surfaces LineService's three removal tiers distinctly: deactivate (soft), zero-dependents purge, and the confirmed super_admin-only ?cascade=true escalation requiring the line's exact code as confirmation, mirroring the backend's GitHub repo-deletion pattern. Gated in LineDetailPage by canDeleteLines(user?.role). | RemoveLineModal |
| `ReportAlertModal` | `frontend/user-portal/src/components/operations/ReportAlertModal.tsx:1` | Modal for reporting a farm/block alert | ReportAlertModal |
| `ReportReturnModal` | `frontend/user-portal/src/components/sales/ReportReturnModal.tsx:1` | Modal to report a sales return | ReportReturnModal |
| `ResolveAlertModal` | `frontend/user-portal/src/components/farm/dashboard/ResolveAlertModal.tsx:1` | Modal to resolve a farm alert | ResolveAlertModal |
| `ReturnDetailPage` | `frontend/user-portal/src/pages/sales/ReturnDetailPage.tsx:1` | Page: Return Note (RN) detail/transition/delete. Uses useReturn/useTransitionReturn/useDeleteReturn. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | ReturnDetailPage |
| `ReturnFormPage` | `frontend/user-portal/src/pages/sales/ReturnFormPage.tsx:1` | Page: Return Note create/edit form -- pre-fills from a source Return Request (useReturnRequest) or directly from a Delivery (useDelivery, all posted lines). Uses SalesItemCombobox, CompanyCombobox; renders AttachmentList. | ReturnFormPage |
| `ReturnRequestDetailPage` | `frontend/user-portal/src/pages/sales/ReturnRequestDetailPage.tsx:1` | Page: Return Request (RR) detail. Uses useReturnRequest hooks. Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | ReturnRequestDetailPage |
| `ReturnRequestFormPage` | `frontend/user-portal/src/pages/sales/ReturnRequestFormPage.tsx:1` | Page: Return Request create/edit form, sourceable from a Delivery (useDelivery). Uses SalesItemCombobox, CompanyCombobox. | ReturnRequestFormPage |
| `ReturnRequestsPage` | `frontend/user-portal/src/pages/sales/ReturnRequestsPage.tsx:1` | Page: Return Requests list. Uses useReturnRequests; status badges via salesStatusToPhase. | ReturnRequestsPage |
| `ReturnedInventoryList` | `frontend/user-portal/src/pages/inventory/ReturnedInventoryList.tsx:1` | Page: returned-from-customer inventory list. Uses inventoryApi | default |
| `ReturnsPage` | `frontend/user-portal/src/pages/sales/ReturnsPage.tsx:1` | Page: sales returns list. Uses salesService | default |
| `ReturnsV2Page` | `frontend/user-portal/src/pages/sales/ReturnsV2Page.tsx:1` | Page: Return Notes (v2) list. Uses useReturns; status badges via salesStatusToPhase. | ReturnsV2Page |
| `RoomDetailsModal` | `frontend/user-portal/src/components/mushroom/RoomDetailsModal.tsx:1` | Growing room details modal | RoomDetailsModal |
| `RouteForm` | `frontend/user-portal/src/components/logistics/RouteForm.tsx:1` | Create/edit route form | RouteForm |
| `RouteManagementPage` | `frontend/user-portal/src/pages/logistics/RouteManagementPage.tsx:1` | Page: route management. Renders RouteTable + RouteForm. Uses logisticsService | default |
| `RouteTable` | `frontend/user-portal/src/components/logistics/RouteTable.tsx:1` | Paginated route table | RouteTable |
| `SalesActionTiles` | `frontend/user-portal/src/components/sales/SalesActionTiles.tsx:1` | Cross-sub-navigation tile bar for the Sales module. T-070.0: now renders 2 tiles (Orders, Stock) — PurchaseOrders tile removed | SalesActionTiles, SalesActionKey, SalesActionTilesProps |
| `SalesAuditHistoryModal` | `frontend/user-portal/src/components/sales/SalesAuditHistoryModal.tsx:1` | T-200.x: read-only audit event list for any Wave 3 sales document, fetched via useSalesAudit (GET /api/v1/sales/audit). Kept separate from the finance AuditHistoryModal -- different entry shape and action vocabulary. Actor names resolved via useAdminUsers (admin/super_admin only). Closes only via X, never on overlay click. Rendered by all 8 Wave 3 sales detail pages. | SalesAuditHistoryModal, SalesAuditHistoryModalProps |
| `SalesDashboardPage` | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx:1` | Page: sales dashboard. Renders SalesActionTiles. Uses salesService | default |
| `SalesItemCombobox` | `frontend/user-portal/src/components/sales/SalesItemCombobox.tsx:1` | Typeahead combobox over sale items (useSaleItemFinanceExtList, GET /v1/finance/item-finance-ext?isSellable=true) for sales doc line-item tables; onChange returns itemId/itemCode/itemName/salesTaxCode. All items fetched once and filtered client-side. Mirrors CustomerCombobox structural pattern. | SalesItemCombobox, SalesItemComboboxProps, SalesItemSelection |
| `SalesItemsPage` | `frontend/user-portal/src/pages/sales/SalesItemsPage.tsx:1` | Page: sellable-items master maintenance (finance extension fields). Uses useFinanceAccounts, useTaxCodes, AccountCombobox; salesApi SaleItemFinanceExt type. | SalesItemsPage, default |
| `SalesOrderDetailPage` | `frontend/user-portal/src/pages/sales/SalesOrderDetailPage.tsx:1` | Page: Sales Order detail, incl. linked Deliveries/Invoices chain and finance-ext line rollups (useSaleItemFinanceExtList). Renders AttachmentList and SalesAuditHistoryModal; status via salesStatusToPhase. | SalesOrderDetailPage |
| `SalesOrderFormPage` | `frontend/user-portal/src/pages/sales/SalesOrderFormPage.tsx:1` | Page: Sales Order create/edit form, sourceable from a Quote (useQuote). Uses CustomerCombobox, SalesItemCombobox, CurrencyCombobox, PaymentTermsCombobox, CompanyCombobox. | SalesOrderFormPage |
| `SalesOrdersPage` | `frontend/user-portal/src/pages/sales/SalesOrdersPage.tsx:1` | Page: sales orders list. Renders SalesActionTiles. Uses salesService | default |
| `SalesOrdersV2Page` | `frontend/user-portal/src/pages/sales/SalesOrdersV2Page.tsx:1` | Page: Sales Orders (v2) list. Uses useSalesOrdersV2; status badges via salesStatusToPhase. | SalesOrdersV2Page |
| `SensorFusionTab` | `frontend/user-portal/src/components/farm/weather/SensorFusionTab.tsx:1` | Weather widget — sensor-fusion tab | SensorFusionTab |
| `Settings` | `frontend/user-portal/src/pages/settings/Settings.tsx:1` | Page: settings (spacing standards, farming year, MFA, modules). Renders ModulesSettingsCard + TelegramBotSettings. Uses farmApi + authService | default |
| `ShipmentCard` | `frontend/user-portal/src/components/logistics/ShipmentCard.tsx:1` | Shipment summary card | ShipmentCard |
| `ShipmentForm` | `frontend/user-portal/src/components/logistics/ShipmentForm.tsx:1` | Create/edit shipment form | ShipmentForm |
| `ShipmentTable` | `frontend/user-portal/src/components/logistics/ShipmentTable.tsx:1` | Paginated shipment table. Uses logisticsService helpers | ShipmentTable |
| `ShipmentTrackingPage` | `frontend/user-portal/src/pages/logistics/ShipmentTrackingPage.tsx:1` | Page: shipment tracking. Uses logisticsService | default |
| `SoilConditionsCard` | `frontend/user-portal/src/components/farm/weather/SoilConditionsCard.tsx:1` | Weather widget — soil conditions card. Uses weatherApi helpers | SoilConditionsCard |
| `SolarLightCard` | `frontend/user-portal/src/components/farm/weather/SolarLightCard.tsx:1` | Weather widget — solar / light card | SolarLightCard |
| `SplitAccessionModal` | `frontend/user-portal/src/components/genetics/SplitAccessionModal.tsx:1` | T-800 Splits vessels out of a batch record; mirrors the server rule that the whole batch cannot be split. | SplitAccessionModal |
| `StatusBadge` | `frontend/user-portal/src/components/finance/StatusBadge.tsx:1` | Shared finance status pill (Night Observatory phaseBadge pattern) for any finance status string, via statusToPhaseKey (statusPhase.ts) -- one shared component instead of a per-page status-to-colour switch. | StatusBadge, StatusBadgeProps |
| `StockPage` | `frontend/user-portal/src/pages/sales/StockPage.tsx:1` | Page (T-070.0): sales stock view (sellable harvest + waste). Renders SalesActionTiles | default |
| `StrainCard` | `frontend/user-portal/src/components/mushroom/StrainCard.tsx:1` | Mushroom strain summary card | StrainCard |
| `TaskCompletionModal` | `frontend/user-portal/src/components/operations/TaskCompletionModal.tsx:1` | Modal for completing a task with notes/photos. Uses tasksApi completeTask | TaskCompletionModal |
| `TelegramBotSettings` | `frontend/user-portal/src/components/settings/TelegramBotSettings.tsx:1` | Settings card for Telegram bot integration | TelegramBotSettings |
| `TenantSetupWizardPage` | `frontend/user-portal/src/pages/admin/TenantSetupWizardPage.tsx:1` | Page: super_admin tenant bootstrap wizard. Uses tenantBootstrapService + financeCompaniesService | default |
| `ToastContainer` | `frontend/user-portal/src/components/common/ToastContainer.tsx:1` | Global toast notification container consuming useToastStore | ToastContainer |
| `ToolCallCard` | `frontend/user-portal/src/components/ai-assistant/ToolCallCard.tsx:1` | Inline card showing an AI tool call invocation + result | ToolCallCard |
| `TrialBalancePage` | `frontend/user-portal/src/pages/finance/TrialBalancePage.tsx:1` | Page: trial balance report. Uses trialBalanceService | default |
| `UnsavedChangesDialog` | `frontend/user-portal/src/components/common/UnsavedChangesDialog.tsx:1` | Dialog prompting user to save or discard unsaved changes before navigation | UnsavedChangesDialog |
| `UserManagementPage` | `frontend/user-portal/src/pages/admin/UserManagementPage.tsx:1` | Page: admin user management (list, create, update roles). Uses apiClient. Adds a 'Pending Activation' tab (isActive:false accounts, incl. Cloudflare-Access JIT-provisioned ones awaiting approval) with an inline activate action, plus a per-row auth-provider badge (Password vs Cloudflare Access). | default |
| `VehicleCard` | `frontend/user-portal/src/components/logistics/VehicleCard.tsx:1` | Vehicle summary card | VehicleCard |
| `VehicleForm` | `frontend/user-portal/src/components/logistics/VehicleForm.tsx:1` | Create/edit vehicle form | VehicleForm |
| `VehicleManagementPage` | `frontend/user-portal/src/pages/logistics/VehicleManagementPage.tsx:1` | Page: vehicle management. Uses logisticsService | default |
| `VehicleTable` | `frontend/user-portal/src/components/logistics/VehicleTable.tsx:1` | Paginated vehicle table. Uses logisticsService helpers | VehicleTable |
| `VendorSubLedgerPage` | `frontend/user-portal/src/pages/finance/VendorSubLedgerPage.tsx:1` | Page: vendor sub-ledger report | default |
| `VendorsPage` | `frontend/user-portal/src/pages/purchasing/VendorsPage.tsx:1` | Page: vendors list/editor. Uses purchasingApi | default |
| `VirtualBlockItem` | `frontend/user-portal/src/components/farm/VirtualBlockItem.tsx:1` | Virtual block list item | VirtualBlockItem |
| `VirtualBlocksView` | `frontend/user-portal/src/components/farm/VirtualBlocksView.tsx:1` | Virtual blocks view container | VirtualBlocksView |
| `VisaTab` | `frontend/user-portal/src/components/hr/VisaTab.tsx:1` | Employee detail Visa tab. Uses hrService | VisaTab |
| `VoiceControls` | `frontend/user-portal/src/components/ai/VoiceControls.tsx:1` | Voice input controls (record/stop) for the AI chat surface | VoiceControls |
| `WasteInventoryList` | `frontend/user-portal/src/pages/inventory/WasteInventoryList.tsx:1` | Page: waste inventory list. Uses api client | default |
| `genetics styled primitives` | `frontend/user-portal/src/components/genetics/styled.ts:1` | T-800 Shared styled-components for the genetics screens. GenerationBadge shades warmer as clone depth rises, making senescence a standing visual cue. | PageWrap, Card, Button, Input, Select, GenerationBadge, StatusBadge, KindBadge,  |

## Custom Hooks (73)

| Hook | File | Description |
|------|------|-------------|
| `useAIAssistant` | `frontend/user-portal/src/hooks/queries/useAIAssistant.ts:1` | Wires Zustand AI store + auth store + aiAssistantApi SSE streaming + conversation list/delete. | useAIAssistant, AI_ASSISTANT_QUERY_KEYS |
| `useAIHub` | `frontend/user-portal/src/hooks/ai/useAIHub.ts:1` | AI Hub per-section conversational state + pending-action confirmation flow. | useAIHub |
| `useAPInvoices` | `frontend/user-portal/src/hooks/queries/useAPInvoices.ts:1` | AP Invoice list/detail + mutations (create-from-GR, submit, approve, reject, delete). Approve/reject also invalidate the shared purchasing approvals.pending() key. | useAPInvoices, useAPInvoice, usePostedGRsForAP, useCreateAPFromGR, useUpdateAPIn |
| `useAdminUsers` | `frontend/user-portal/src/hooks/queries/useAdminUsers.ts:1` | T-064: fetches GET /v1/users?perPage=100 and exposes a userId to displayName Map for AuditHistoryModal. Gated by admin role. | useAdminUsers, adminUsersQueryKeys, UserDisplayMap |
| `useApprovalRules` | `frontend/user-portal/src/hooks/queries/useApprovalRules.ts:1` | Approval-rule CRUD + dry-run resolver hook. | useApprovalRules, useResolveApprovalRule, useCreateApprovalRule, useUpdateApprov |
| `useArAging` | `frontend/user-portal/src/hooks/queries/useArAging.ts:1` | TanStack Query hook for the read-only AR Aging report aggregation (no mutations). Backs ARAgingReportPage. | arAgingQueryKeys, useArAging |
| `useArCreditNotes` | `frontend/user-portal/src/hooks/queries/useArCreditNotes.ts:1` | AR Credit Note (ARC) document-lifecycle hooks over salesApi (status flow draft->open->partly_closed->closed->cancelled). Two creation paths: from-RTN (financial completion of a physical return) and from-Invoice. Backs ArCreditNotesPage/ArCreditNoteDetailPage/ArCreditNoteFormPage. | arcQueryKeys, useArCreditNotes, useArCreditNote, useCreateArCreditNoteFromRTN, u |
| `useArInvoices` | `frontend/user-portal/src/hooks/queries/useArInvoices.ts:1` | AR Invoice (ARI) document-lifecycle hooks over salesApi. Creatable standalone, from a Delivery, or from a Sales Order. Backs ARInvoicesPage/ARInvoiceDetailPage/ARInvoiceFormPage. | ariQueryKeys, useArInvoices, useArInvoice, useCreateArInvoice, useCreateArInvoic |
| `useAttachments` | `frontend/user-portal/src/hooks/queries/useAttachments.ts:1` | List + upload + delete attachments for any PR/PO/GR/AP/PAYMENT doc. | useAttachments, useUploadAttachment, useDeleteAttachment, attachmentsQueryKeys |
| `useAuditLog` | `frontend/user-portal/src/hooks/queries/useAuditLog.ts:1` | Paginated audit log listing. | useAuditLog, auditLogKeys |
| `useBlockActions` | `frontend/user-portal/src/hooks/farm/useBlockActions.ts:1` | Imperative block-action wrapper (state transitions + helpers). | useBlockActions |
| `useBlockAnalytics` | `frontend/user-portal/src/hooks/farm/useBlockAnalytics.ts:1` | Block-level analytics for a given time period. | useBlockAnalytics |
| `useBlockViewMode` | `frontend/user-portal/src/hooks/farm/useBlockViewMode.ts:1` | Local 'physical' | 'virtual' block view-mode toggle (no network). | useBlockViewMode |
| `useCapabilities` | `frontend/user-portal/src/hooks/useCapabilities.ts:1` | Tenant capabilities query (drives Wave-0 finance module toggle + nav gating). | useCapabilities, useFinanceEnabled, useFinanceUnreachable, CAPABILITIES_QUERY_KE |
| `useCompanies` | `frontend/user-portal/src/hooks/queries/useCompanies.ts:1` | TanStack Query hook over companiesService.listCompanies for a given organisation; 5-minute staleTime since companies change rarely. | useCompanies |
| `useContamination` | `frontend/user-portal/src/hooks/mushroom/useContamination.ts:1` | Mushroom-room contamination list + report + resolve. | useRoomContaminations, useReportContamination, useResolveContamination |
| `useCostCenters` | `frontend/user-portal/src/hooks/queries/useCostCenters.ts:1` | Org cost-center list. | useCostCenters |
| `useCustomerReceipts` | `frontend/user-portal/src/hooks/queries/useCustomerReceipts.ts:1` | Customer Receipt (IPAY) document-lifecycle hooks over salesApi, incl. allocation against one or more AR Invoices. Backs CustomerReceiptsPage/CustomerReceiptDetailPage/CustomerReceiptFormPage. | crQueryKeys, useCustomerReceipts, useCustomerReceipt, useCreateCustomerReceipt,  |
| `useDashboard` | `frontend/user-portal/src/hooks/queries/useDashboard.ts:1` | Dashboard summary slices: farm stats, sales stats, orders by status, blocks by farm. | useDashboardSummary, useFarmStats, useSalesStats, useOrdersByStatus, useBlocksBy |
| `useDashboardConfig` | `frontend/user-portal/src/hooks/farm/useDashboardConfig.ts:1` | Persisted farm-dashboard config (localStorage). | useDashboardConfig |
| `useDashboardData` | `frontend/user-portal/src/hooks/farm/useDashboardData.ts:1` | Imperative farm-dashboard data loader (legacy non-RQ). | useDashboardData |
| `useDashboardFilters` | `frontend/user-portal/src/hooks/farm/useDashboardFilters.ts:1` | Client-side filter/sort state for the farm dashboard block grid. | useDashboardFilters |
| `useDeliveries` | `frontend/user-portal/src/hooks/queries/useDeliveries.ts:1` | Delivery Note (DN) document-lifecycle hooks over salesApi (status flow draft->open->cancelled, no partly_closed). Only creatable from a Sales Order. Backs DeliveriesPage/DeliveryDetailPage/DeliveryFormPage. | dnQueryKeys, useDeliveries, useDelivery, useCreateDeliveryFromSO, useUpdateDeliv |
| `useFacilityData` | `frontend/user-portal/src/hooks/mushroom/useFacilityData.ts:1` | Mushroom-facility CRUD. | useFacilities, useFacility, useCreateFacility, useUpdateFacility |
| `useFarmAIChat` | `frontend/user-portal/src/hooks/farm/useFarmAIChat.ts:1` | Block-scoped AI chat + pending-action confirmation. | useFarmAIChat |
| `useFarmAnalytics` | `frontend/user-portal/src/hooks/farm/useFarmAnalytics.ts:1` | Farm-level analytics across blocks. | useFarmAnalytics |
| `useFarmingYears` | `frontend/user-portal/src/hooks/queries/useFarmingYears.ts:1` | Available farming-year lookups for filters and pickers. | useAvailableFarmingYears, useCurrentFarmingYear, useFarmingYearsList, useFarming |
| `useFarms` | `frontend/user-portal/src/hooks/queries/useFarms.ts:1` | Farm list/detail/summary/blocks/harvests + CRUD mutations. | useFarms, useFarm, useFarmSummary, useFarmBlocks, useFarmHarvests, useCreateFarm |
| `useFinanceAccounts` | `frontend/user-portal/src/hooks/queries/useFinanceAccounts.ts:1` | GL account list/detail + CRUD + cash-flow-category updater. | useFinanceAccounts, useFinanceAccount, useCreateFinanceAccount, useUpdateFinance |
| `useFinanceCompanies` | `frontend/user-portal/src/hooks/queries/useFinanceCompanies.ts:1` | Finance companies list + create. | useFinanceCompanies, useCreateCompany |
| `useFinancePnl` | `frontend/user-portal/src/hooks/useFinancePnl.ts:1` | Aggregated farm-P&L slices (summary / by-month / by-farm / by-crop) + AR aging + revenue sources. | useFinancePnlSummary, useFinancePnlByMonth, useFinancePnlByFarm, useFinancePnlBy |
| `useFinanceReports` | `frontend/user-portal/src/hooks/queries/useFinanceReports.ts:1` | Finance reports: AP aging, Balance Sheet, Income Statement, Cash Flow (T-060.5 indirect), vendor sub-ledger. | useApAging, useBalanceSheet, useIncomeStatement, useCashFlow, useVendorSubLedger |
| `useFiscalPeriods` | `frontend/user-portal/src/hooks/queries/useFiscalPeriods.ts:1` | Fiscal period CRUD + close/reopen + closing-JE preview. | useFiscalPeriods, useCreatePeriod, useClosePeriod, useReopenPeriod, useClosePeri |
| `useFullscreen` | `frontend/user-portal/src/hooks/useFullscreen.ts:1` | Manual fullscreen toggle for document.documentElement. Deliberately no auto-fullscreen-on-load: the Fullscreen API requires a live user-activation gesture in every modern browser (requestFullscreen() throws TypeError outside that window). Gesture-free fullscreen on load is only achievable via the PWA manifest's display:fullscreen when installed. | useFullscreen |
| `useGenetics` | `frontend/user-portal/src/hooks/genetics/useGenetics.ts:1` | T-800 TanStack Query hooks. Mutations invalidate the whole ['genetics'] root because a propagation touches lines, accessions, lineage and dashboard at once. T-807/T-809: useLineDependents/usePurgeLine (RemoveLineModal is documented as the sole intended consumer of usePurgeLine's cascade path) and useOrphans/useDeleteOrphans. | useGeneticLines, useGeneticLine, useLinkedProfileCounts, useCreateLine, useUpdat |
| `useGlobalAnalytics` | `frontend/user-portal/src/hooks/farm/useGlobalAnalytics.ts:1` | Global cross-farm analytics. | useGlobalAnalytics |
| `useGoodsReceipts` | `frontend/user-portal/src/hooks/queries/useGoodsReceipts.ts:1` | GR list/detail + create-from-PO + update/post/delete mutations. | useGoodsReceipts, useGoodsReceipt, useCreateGRFromPO, useUpdateGoodsReceipt, use |
| `useGrowingProfiles` | `frontend/user-portal/src/hooks/genetics/useGrowingProfiles.ts:1` | T-801 Joins a genetic line to its cultivation-parameters record — mushroom_strains for fungi, plant_data_enhanced for plants. profileSourceForKind returns null for animals, which have no growing-profile library. | useProfileOptions, useLinkedStrain, useLinkedPlantData, profileSourceForKind, PR |
| `useIncomingDocs` | `frontend/user-portal/src/hooks/queries/useIncomingDocs.ts:1` | Inbound PR/PO list + detail queries (cross-org incoming documents view). | useIncomingPRs, useIncomingPOs, useIncomingPRDetail, useIncomingPODetail, incomi |
| `useItemMappings` | `frontend/user-portal/src/hooks/queries/useItemMappings.ts:1` | Purchase-item to GL-account mapping list/detail + update. | useItemMappings, useItemMapping, useUpdateItemMapping, itemMappingQueryKeys |
| `useItemMappingsMap` | `frontend/user-portal/src/hooks/queries/useItemMappingsMap.ts:1` | Memoised itemId to PurchaseItemFinanceExt Map built on top of useItemMappings. | useItemMappingsMap |
| `useJournalEntries` | `frontend/user-portal/src/hooks/queries/useJournalEntries.ts:1` | JE list/detail + manual create + reversal. | useJournalEntries, useJournalEntry, useCreateManualJournalEntry, useReverseJourn |
| `useMFA` | `frontend/user-portal/src/hooks/queries/useMFA.ts:1` | MFA setup/enable/status hooks + setup-cache and verify-session helpers. | useMFASetup, useEnableMFA, useMFAStatus, useClearMFACache, clearMFASetupCache, g |
| `useMapDrawing` | `frontend/user-portal/src/hooks/map/useMapDrawing.ts:1` | Polygon drawing state for MapLibre + Turf intersection checks. No backend. | useMapDrawing |
| `useMultiLevelAIChat` | `frontend/user-portal/src/hooks/farm/useMultiLevelAIChat.ts:1` | Hierarchical AI-chat scope manager (global / farm / block). Imports no service directly — scope-aware caller wiring. | useMultiLevelAIChat |
| `useMushroomDashboard` | `frontend/user-portal/src/hooks/mushroom/useMushroomDashboard.ts:1` | Mushroom dashboard + per-facility analytics. | useMushroomDashboard, useFacilityAnalytics |
| `useMushroomHarvests` | `frontend/user-portal/src/hooks/mushroom/useMushroomHarvests.ts:1` | Mushroom harvest list + create. | useRoomHarvests, useFacilityHarvests, useCreateHarvest |
| `useMushroomStrains` | `frontend/user-portal/src/hooks/mushroom/useMushroomStrains.ts:1` | Mushroom strain CRUD. | useMushroomStrains, useMushroomStrain, useCreateStrain, useUpdateStrain |
| `useOrganizations` | `frontend/user-portal/src/hooks/queries/useOrganizations.ts:1` | Tenant org list + create + user-assignment mutation. | useOrganizations, useCreateOrganization, useAssignUserOrg, organizationsQueryKey |
| `usePageVisibility` | `frontend/user-portal/src/hooks/usePageVisibility.ts:1` | Page-visibility callbacks + isMobile + isPageVisible utility hooks (no network). | usePageVisibility, useIsMobile, useIsPageVisible |
| `usePayments` | `frontend/user-portal/src/hooks/queries/usePayments.ts:1` | AP payment list/detail + create (with JE summary). | usePayments, usePayment, useCreatePayment, paymentsQueryKeys |
| `usePlantMothers` | `frontend/user-portal/src/hooks/queries/usePlantMothers.ts:17` | TanStack Query hooks for Plant Library mothers/varieties (list/get/varieties + create/update/delete/create-variety mutations) over plantMotherApi. | usePlantMothers, usePlantMother, useVarietiesForMother, useCreatePlantMother, us |
| `usePostingSetup` | `frontend/user-portal/src/hooks/queries/usePostingSetup.ts:1` | Per-company posting setup get + upsert. | usePostingSetup, useUpsertPostingSetup, postingSetupQueryKeys |
| `useProtocols` | `frontend/user-portal/src/hooks/protocols/useProtocols.ts:1` | TanStack Query hooks over protocolsApi: list/get a protocol, get protocols matching a scope (ProtocolPicker), and create/update/approve mutations (ProtocolFormModal). | useProtocols, useProtocol, useProtocolsForScope, useCreateProtocol, useUpdatePro |
| `usePurchasing` | `frontend/user-portal/src/hooks/queries/usePurchasing.ts:1` | Mega-hook covering vendors, items, payment terms, PR/PO CRUD + lifecycle transitions + approvals inbox/history. The canonical purchasing surface. | useVendors, useVendor, useCreateVendor, useUpdateVendor, useDeleteVendor, usePur |
| `useQuotes` | `frontend/user-portal/src/hooks/queries/useQuotes.ts:1` | Sales Quote (SQ) document-lifecycle hooks over salesApi. Backs QuotesPage/QuoteDetailPage/QuoteFormPage. | quotesQueryKeys, useQuotes, useQuote, useCreateQuote, useUpdateQuote, useDeleteQ |
| `useReturnRequests` | `frontend/user-portal/src/hooks/queries/useReturnRequests.ts:1` | Return Request (RR/RMA) document-lifecycle hooks over salesApi (status flow draft->open->closed[auto]/cancelled). Backs ReturnRequestsPage/ReturnRequestDetailPage/ReturnRequestFormPage. | rrQueryKeys, useReturnRequests, useReturnRequest, useCreateReturnRequest, useCre |
| `useReturns` | `frontend/user-portal/src/hooks/queries/useReturns.ts:1` | Return Note (RTN) document-lifecycle hooks over salesApi. Two creation paths: from-RR (POST /returns-v2/from-request/:rrDocEntry) and from-Delivery (client-assembled). Backs ReturnsV2Page/ReturnDetailPage/ReturnFormPage. | rtnQueryKeys, useReturns, useReturn, useCreateReturnFromRR, useCreateReturnFromD |
| `useRoomData` | `frontend/user-portal/src/hooks/mushroom/useRoomData.ts:1` | Mushroom room CRUD + phase advancement. | useFacilityRooms, useRoom, useCreateRoom, useUpdateRoom, useAdvancePhase |
| `useRoomEnvironment` | `frontend/user-portal/src/hooks/mushroom/useRoomEnvironment.ts:1` | Mushroom room environment readings (history + latest + log). | useRoomEnvironmentHistory, useLatestEnvironmentReading, useLogEnvironmentReading |
| `useSaleItemFinanceExt` | `frontend/user-portal/src/hooks/queries/useSaleItemFinanceExt.ts:1` | Sale item finance-extension (GL account + tax code per sellable item) hooks over GET/POST/PATCH /v1/finance/item-finance-ext. Backs SalesItemsPage's inline edit and SalesOrderDetailPage's line rollups. | saleItemFinanceExtKeys, useSaleItemFinanceExtList, useSaleItemFinanceExtByItem,  |
| `useSales` | `frontend/user-portal/src/hooks/queries/useSales.ts:1` | Sales dashboard + orders list/detail. PurchaseOrder helpers no longer here (moved to usePurchasing/purchasingApi in T-070.0). | useSalesDashboard, useSalesOrders, useSalesOrder |
| `useSalesAudit` | `frontend/user-portal/src/hooks/queries/useSalesAudit.ts:1` | Per-document audit trail hook for any Wave 3 sales document (GET /v1/sales/audit?docType&docEntry&organizationId), 60s staleTime, disabled until all three params are present. Backs SalesAuditHistoryModal; actor-name resolution happens separately via useAdminUsers. | salesAuditKeys, useSalesAudit |
| `useSalesOrders` | `frontend/user-portal/src/hooks/queries/useSalesOrders.ts:1` | Sales Order (SO v2) document-lifecycle hooks over salesApi (status flow draft->open->partly_closed->closed/cancelled). Creatable standalone or from a Quote. Backs SalesOrdersV2Page/SalesOrderDetailPage/SalesOrderFormPage. | soQueryKeys, useSalesOrdersV2, useSalesOrderV2, useCreateSalesOrderV2, useCreate |
| `useSubstrateBatches` | `frontend/user-portal/src/hooks/mushroom/useSubstrateBatches.ts:1` | Mushroom substrate batch CRUD. | useFacilitySubstrates, useSubstrateBatch, useCreateSubstrate, useUpdateSubstrate |
| `useTaxCodes` | `frontend/user-portal/src/hooks/queries/useTaxCodes.ts:1` | Tax-code list with hard-coded fallback when finance disabled. | useTaxCodes |
| `useTenantBaseCurrency` | `frontend/user-portal/src/hooks/queries/useTenantBaseCurrency.ts:1` | Returns the tenant's ISO 4217 base currency code by reading the first row of useFinanceCompanies; falls back to 'AED'. Single source of truth for base-currency comparisons across all 8 sales forms (drives CurrencyCombobox's 'Base' badge). | useTenantBaseCurrency |
| `useTools` | `frontend/user-portal/src/hooks/queries/useTools.ts:1` | Fertilizer chemicals + prices + cost calculator + saved-list CRUD hooks. | useChemicals, useCreateChemical, useUpdateChemical, useArchiveChemical, useDisco |
| `useTrialBalance` | `frontend/user-portal/src/hooks/queries/useTrialBalance.ts:1` | Trial balance report + open-periods picker. | useTrialBalance, useFinancePeriods, trialBalanceQueryKeys |
| `useTutorial` | `frontend/user-portal/src/hooks/tutorials/useTutorial.ts:1` | Tutorial seen-state stored server-side (users.metadata.tutorialsSeen), not localStorage, so dismissal follows the user across devices/browsers. Backs HelpButton's auto-open-once-per-topic behaviour. | useSeenTutorials, useMarkTutorialSeen, useResetTutorials |
| `useUnsavedChanges` | `frontend/user-portal/src/hooks/useUnsavedChanges.ts:1` | Subscribes to UnsavedChangesContext and warns on navigation/unload when isDirty. | useUnsavedChanges |
| `useVoice` | `frontend/user-portal/src/hooks/ai/useVoice.ts:1` | MediaRecorder voice-input + TTS playback wrapper. | useVoice |
| `useWeatherData` | `frontend/user-portal/src/hooks/farm/useWeatherData.ts:1` | Current weather + agri-data with capability gating. | useWeatherData, useHasWeatherCapability |

## Zustand Stores (7)

| Store | File | Description |
|-------|------|-------------|
| `useAIAssistantStore` | `frontend/user-portal/src/stores/aiAssistant.store.ts:1` | Zustand store for AI assistant panel: messages, conversations, streaming state, draft, panel open/closed. | useAIAssistantStore, genId, ChatMessage, ConversationSummary, ToolCallEntry, Mes |
| `useAuthStore` | `frontend/user-portal/src/stores/auth.store.ts:1` | Persisted Zustand auth store: user, isAuthenticated, isLoading, mfaRequired, pendingActivation, pendingActivationEmail. Actions: login/register/logout/loadUser/refreshUser/verifyMfa, plus cfAccessLogin() which exchanges the Cloudflare Access edge session (authService.cfAccessSession()) for app tokens. Both login() and cfAccessLogin() route the 403 pending_activation outcome through the shared extractPendingActivation() helper (unwraps FastAPI's one-level-deeper detail shape) rather than each re-deriving it. Resets division store on logout; syncs auth state across tabs via storage events. | useAuthStore |
| `useDashboardStore` | `frontend/user-portal/src/stores/dashboard.store.ts:1` | Persisted dashboard widget layout + catalog + react-grid-layout state. | useDashboardStore, WIDGET_CATALOG, waitForHydration |
| `useDivisionStore` | `frontend/user-portal/src/stores/division.store.ts:1` | Persisted current-division selector + division list loader. | useDivisionStore |
| `useFarmingYearStore` | `frontend/user-portal/src/stores/farmingYear.store.ts:1` | Persisted current-farming-year selector for cross-page filtering. | useFarmingYearStore |
| `useThemeStore` | `frontend/user-portal/src/stores/theme.store.ts:1` | Persisted light/dark theme toggle. | useThemeStore |
| `useToastStore` | `frontend/user-portal/src/stores/toast.store.ts:1` | Global toast notification store + helper triggers used by mutations. | useToastStore, showToast, showErrorToast, showSuccessToast, showWarningToast, sh |

## TypeScript Types (25)

| Type | File | Description |
|------|------|-------------|
| `aiDashboard types` | `frontend/user-portal/src/types/aiDashboard.ts:1` | AI Dashboard data types: farm census, yield assessments, growth timelines, lab analysis, equipment health, sense hub alerts, automation audits, AI summaries, dashboard reports. | FarmCensus, YieldFarmEntry, YieldAssessment, GrowthTimeline, SenseHubAlerts, Equ |
| `aiHub types` | `frontend/user-portal/src/types/aiHub.ts:1` | AI Hub chat types: sections (control/monitor/report/advise), chat request/response, history items. Re-exports PendingAction/ConfirmActionRequest/ConfirmActionResponse from farmAI. | AIHubSection, AIHubChatRequest, AIHubChatResponse, AIHubHistoryItem, PendingActi |
| `alerts types` | `frontend/user-portal/src/types/alerts.ts:1` | Alert type definitions: severity, status, type enums, Alert interface, request/response interfaces, paginated lists, severity/status config maps. | AlertSeverity, AlertStatus, AlertType, Alert, CreateAlertRequest, ResolveAlertRe |
| `analytics types` | `frontend/user-portal/src/types/analytics.ts:1` | Block analytics and AI analytics: block info, yield/timeline/task/performance/alert analytics, time-period options, conversation messages, AI chat request/response. | BlockInfo, YieldByQuality, YieldTrendPoint, YieldAnalytics, StateTransition, Tim |
| `capabilities types` | `frontend/user-portal/src/types/capabilities.ts:1` | Tenant capabilities surface: finance module capability flags (financeEnabled), aggregated module capabilities, top-level Capabilities envelope returned by /capabilities endpoint. | FinanceModuleCapability, ModuleCapabilities, Capabilities |
| `crm types` | `frontend/user-portal/src/types/crm.ts:1` | Customer relationship management types: customer type/status enums, addresses, Customer entity, create/update payloads, search params, paginated customers. | CustomerType, CustomerStatus, CustomerAddress, Customer, CustomerCreate, Custome |
| `farm types` | `frontend/user-portal/src/types/farm.ts:1` | Core farm domain types: BlockState, PlantingStatus enums; GeoJSON polygons, FarmBoundary, BlockBoundary, FarmLocation; Farm/Block CRUD payloads and summaries; state transitions; virtual crops; alerts; harvests/quality grades; plant data (basic + enhanced); plant taxonomy enums. | BlockState, PlantingStatus, GeoJSONPolygon, FarmBoundary, BlockBoundary, FarmLoc |
| `farm-analytics types` | `frontend/user-portal/src/types/farm-analytics.ts:1` | Farm analytics (kebab-case variant) used by newer pages: time period options, aggregated metrics, state breakdown, block comparison, yield/state transition timelines, historical trends, FarmAnalyticsData root. | TimePeriod, TimePeriodOption, TIME_PERIOD_OPTIONS, AggregatedMetrics, StateBreak |
| `farmAI types` | `frontend/user-portal/src/types/farmAI.ts:1` | Farm-scoped AI chat types: chat messages, request/response, pending actions, growth stage info, confirm-action flow, AI scope, farm/global response variants. | ChatMessage, FarmAIChatRequest, PendingAction, GrowthStageInfo, FarmAIChatRespon |
| `farmAnalytics types` | `frontend/user-portal/src/types/farmAnalytics.ts:1` | Farm-level analytics (camelCase variant): FarmAnalytics root, aggregated metrics, state breakdown, block comparison, historical trends, yield timeline, state transitions. | FarmAnalytics, AggregatedMetrics, StateBreakdown, StateInfo, BlockState, BlockCo |
| `finance types` | `frontend/user-portal/src/types/finance.ts:1` | Finance P&L and AR aging types: filter params, P&L periods/breakdowns (revenue/COGS/Opex/order-counts), summary, monthly/farm/crop dimensions, AR aging buckets, revenue sources. | PnlFilterParams, PnlPeriod, PnlRevenueBreakdown, PnlCOGSBreakdown, PnlOpexBreakd |
| `genetics` | `frontend/user-portal/src/types/genetics.ts:1` | T-800 TypeScript mirror of the genetics Pydantic models plus display-label maps. SENESCENCE_WATCH_GENERATION mirrors the backend dashboard constant. T-807/T-809 additions: LineDependents/PlainPurgeResult/CascadePurgeResult/PurgeLineParams mirror LineService's three removal paths; OrphanAccession/OrphanObservation/OrphanPropagationEvent/OrphanCounts/OrphanRecords mirror MaintenanceService.find_orphans()/delete_orphans(). | GeneticLine, Accession, PropagationEvent, MediumRecipe, MediumBatch, Observation |
| `global-analytics types` | `frontend/user-portal/src/types/global-analytics.ts:1` | Cross-farm (global) analytics types: time period options, global aggregated metrics, state breakdown, farm summary, yield timeline, performance trend/insights, GlobalAnalyticsData root. | TimePeriod, TimePeriodOption, TIME_PERIOD_OPTIONS, GlobalAggregatedMetrics, Glob |
| `hr types` | `frontend/user-portal/src/types/hr.ts:1` | HR domain types: employee status, emergency contact, Employee entity; contract type/status, Contract; visa status/Visa; insurance type/Insurance; performance reviews; CRUD payloads; search params; dashboard stats and department distribution. | EmployeeStatus, EmergencyContact, Employee, ContractType, ContractStatus, Contra |
| `inventory types` | `frontend/user-portal/src/types/inventory.ts:1` | Inventory domain types: inventory/product/input/asset categories and statuses, quality grades, movement types, base/display units; harvest/input/asset inventory CRUD; movements; summary; pagination; farming-year config; returned inventory; unit options and label/color maps. | InventoryType, HarvestProductType, InputCategory, AssetCategory, AssetStatus, Qu |
| `logistics types` | `frontend/user-portal/src/types/logistics.ts:1` | Logistics domain types: vehicle type/ownership/status, VehicleCapacity, Vehicle CRUD + pagination; locations and Route CRUD + pagination; shipment status/cargo, Shipment CRUD + status updates + pagination; logistics dashboard stats with farming-year context. | VehicleType, VehicleOwnership, VehicleStatus, VehicleCapacity, Vehicle, VehicleC |
| `marketing types` | `frontend/user-portal/src/types/marketing.ts:1` | Marketing domain types: campaigns (status, metrics, CRUD, pagination); budgets (status, CRUD, pagination); channels (type, CRUD, pagination); events (type/status, CRUD, pagination); marketing dashboard stats. | CampaignStatus, CampaignMetrics, MarketingCampaign, MarketingCampaignCreate, Mar |
| `mushroom types` | `frontend/user-portal/src/types/mushroom.ts:1` | Mushroom cultivation types: room phase, facility type/status, difficulty levels, substrate type/status, harvest quality grade, contamination type/status/severity; facilities, growing rooms, strains, substrate batches, harvests, environment readings, contamination reports; payloads for create/update/advance/resolve; dashboard and analytics data; phase/quality/difficulty color and label maps. | RoomPhase, FacilityType, FacilityStatus, MushroomDifficulty, SubstrateType, Subs |
| `protocols types` | `frontend/user-portal/src/types/protocols.ts:1` | Protocols (SOP) domain types, mirroring src/modules/protocols/models/. A Protocol is a versioned written procedure with steps/equipment/materials/PPE and appliesTo scope tags (PROTOCOL_SCOPES) binding it to the screen where the work is recorded. ProtocolRef is the denormalised pinned-reference shape stored on a work record so the version actually followed stays readable after a later revision. PROTOCOL_CATEGORY_ICONS (emoji) is out of scope for the Night Observatory pass -- superseded by components/protocols/categoryIcons.ts's lucide-react map, not removed here. | ProtocolCategory, ProtocolStatus, PROTOCOL_CATEGORY_LABELS, PROTOCOL_CATEGORY_IC |
| `returns types` | `frontend/user-portal/src/types/returns.ts:1` | Return order convenience re-exports from sales.ts: ReturnReason, ReturnCondition, ReturnStatus enums and ReturnItem/ReturnOrder/ReturnOrderCreate/PaginatedReturns interfaces. | ReturnReason, ReturnCondition, ReturnStatus, ReturnItem, ReturnOrder, ReturnOrde |
| `sales types` | `frontend/user-portal/src/types/sales.ts:1` | Sales domain types: order/payment status, OrderItemAllocation, OrderItem, ShippingAddress, SalesOrder + CRUD payloads, search/pagination, sales dashboard stats (with purchase-order counters), return orders (reason/condition/status, ReturnItem/ReturnOrder, CRUD, pagination), waste inventory (source/disposal enums, CRUD, summary, pagination), farming-year context. NOTE: PurchaseOrder/PurchaseOrderItem interfaces were removed in T-070.0 and migrated to the purchasing service; SalesDashboardStats still exposes PO counters. | OrderStatus, PaymentStatus, OrderItemAllocation, OrderItem, ShippingAddress, Sal |
| `shared types barrel` | `frontend/shared/src/types/index.ts:1` | Barrel re-export of shared widget types so consumers can import from @a64/shared/types. | CCMWidget, WidgetType, WidgetSize, WidgetDataSource, ModuleDataSource, SystemDat |
| `shared widget types` | `frontend/shared/src/types/widget.types.ts:1` | Cross-portal dashboard widget contracts (CCM): CCMWidget definition, widget type/size enums, widget data sources (module/system/external API), widget props, stat/chart widget data. | CCMWidget, WidgetType, WidgetSize, WidgetDataSource, ModuleDataSource, SystemDat |
| `task types` | `frontend/user-portal/src/types/tasks.ts:1` | Task domain types: TaskType, TaskStatus, HarvestGrade enums; Task entity with details; harvest entries and summary; CRUD/complete/cancel/end-harvest requests; pagination; list params (task/farm/block); filters; counts; form data; color/label/icon maps. | TaskType, TaskStatus, HarvestGrade, Task, TaskWithDetails, HarvestEntry, Harvest |
| `tools types` | `frontend/user-portal/src/types/tools.ts:1` | Fertilizer calculator and chemical tooling types: chemical unit, FertilizerChemical CRUD, dependents error, price source/override/inventory, price entries, calculate request/response, ingredient lines and crop calculation results, import responses, saved lists CRUD and pagination, crop options/rows, crop input mode. | ChemicalUnit, FertilizerChemical, CreateChemicalRequest, UpdateChemicalRequest,  |

## Component Render Tree (sample)

| Parent | Renders | Child |
|--------|---------|-------|
| `file::App` | renders | `page::FarmManager` |
| `file::App` | renders | `page::Dashboard` |
| `file::App` | renders | `page::Login` |
| `file::App` | renders | `page::AIAnalytics` |
| `page::FarmManager` | renders | `page::FarmDashboardPage` |
| `page::FarmManager` | renders | `page::PlantDataLibrary` |
| `frontend.App` | renders | `frontend.pages.crm.CustomerDetailPage` |
| `frontend.App` | renders | `frontend.pages.crm.CRMPage` |
| `file::App` | renders | `component::ProtectedRoute` |
| `file::App` | renders | `component::FinanceGate` |
| `file::App` | renders | `component::MFARouteGuards` |
| `file::App` | renders | `component::MainLayout` |
| `component::AIAssistantPanel` | renders | `component::MessageList` |
| `component::AIAssistantPanel` | renders | `component::InputBox` |
| `component::AIAssistantPanel` | renders | `component::ConversationList` |
| `component::MessageList` | renders | `component::MessageBubble` |
| `component::MessageBubble` | renders | `component::ToolCallCard` |
| `component::AIHubPage` | renders | `component::AIHubTabBar` |
| `component::AIHubPage` | renders | `component::AIHubChat` |
| `component::FarmDashboard` | renders | `component::GlobalFarmAnalyticsModal` |
| `component::FarmList` | renders | `component::FarmCard` |
| `component::FarmList` | renders | `component::CreateFarmModal` |
| `component::FarmList` | renders | `component::EditFarmModal` |
| `component::FarmList` | renders | `component::FarmAnalyticsModal` |
| `component::FarmDetail` | renders | `component::FarmHistoryTab` |
| `component::FarmDetail` | renders | `component::VirtualBlocksView` |
| `component::FarmDetail` | renders | `component::PhysicalBlockGrid` |
| `component::BlockDetail` | renders | `component::BlockAlertsTab` |
| `component::BlockDetail` | renders | `component::BlockAutomationTab` |
| `component::BlockDetail` | renders | `component::BlockHarvestsTab` |
| `component::BlockDetail` | renders | `component::BlockArchivesTab` |
| `component::BlockCard` | renders | `component::PlantAssignmentModal` |
| `component::BlockCard` | renders | `component::BlockAnalyticsModal` |
| `component::FarmMapView` | renders | `component::MapContainer` |
| `component::FarmMapView` | renders | `component::DrawingControls` |
| `component::MFASetupPage` | renders | `component::BackupCodesModal` |
| `component::FarmManagerPage` | renders | `component::FarmList` |
| `component::FarmManagerPage` | renders | `component::FarmDetail` |
| `component::FarmManagerPage` | renders | `component::BlockDetail` |
| `component::BalanceSheetPage` | renders | `component::FinanceReportPage` |
| `component::IncomeStatementPage` | renders | `component::FinanceReportPage` |
| `component::CashFlowStatementPage` | renders | `component::FinanceReportPage` |
| `component::ItemMappingPage` | renders | `component::AccountCombobox` |
| `component::ManualJournalEntryPage` | renders | `component::AccountCombobox` |
| `component::ManualJournalEntryPage` | renders | `component::CostCenterCombobox` |
| `component::PeriodsPage` | renders | `component::AuditHistoryModal` |
| `component::PostingSetupPage` | renders | `component::AccountCombobox` |
| `component::RecordPaymentPage` | renders | `component::AccountCombobox` |
| `component::EmployeeDetailPage` | renders | `component::ContractTab` |
| `component::EmployeeDetailPage` | renders | `component::InsuranceTab` |
| `component::EmployeeDetailPage` | renders | `component::PerformanceTab` |
| `component::EmployeeDetailPage` | renders | `component::VisaTab` |
| `component::PnLPage` | renders | `component::PnlKpiCards` |
| `component::PnLPage` | renders | `component::PnlFiltersBar` |
| `component::PnLPage` | renders | `component::PnlStatementTable` |
| `component::PnLPage` | renders | `component::PnlBreakdownCharts` |
| `component::PnLPage` | renders | `component::PnlRevenueTrendChart` |
| `component::PnLPage` | renders | `component::PnlRevenueConfidence` |
| `component::PnLPage` | renders | `component::PnlArAging` |
| `component::APInvoiceFormPage` | renders | `component::FinanceUnreachableBanner` |
| `component::GoodsReceiptFormPage` | renders | `component::FinanceUnreachableBanner` |
| `component::PurchaseOrderFormPage` | renders | `component::FinanceUnreachableBanner` |
| `component::PurchaseRequestFormPage` | renders | `component::FinanceUnreachableBanner` |
| `component::SalesDashboardPage` | renders | `component::SalesActionTiles` |
| `component::SalesOrdersPage` | renders | `component::SalesActionTiles` |
| `component::StockPage` | renders | `component::SalesActionTiles` |
| `component::SettingsPage` | renders | `component::ModulesSettingsCard` |
| `component::SettingsPage` | renders | `component::TelegramBotSettings` |
| `component::LineDetailPage` | renders | `component::LineageTree` |
| `component::AccessionDetailPage` | renders | `component::LineageTree` |
| `component::LineDetailPage` | renders | `component::PropagateModal` |
| `component::LineDetailPage` | renders | `component::RegisterAccessionModal` |
| `component::LineDetailPage` | renders | `component::LineFormModal` |
| `component::GeneticsRepoPage` | renders | `component::LineFormModal` |
| `component::AccessionDetailPage` | renders | `component::ObservationModal` |
| `component::AccessionDetailPage` | renders | `component::SplitAccessionModal` |
| `component::AccessionDetailPage` | renders | `component::PromoteTraitModal` |
| `component::AccessionDetailPage` | renders | `component::PropagateModal` |
| `component::MediaLibraryPage` | renders | `component::RecipeFormModal` |
| `component::MediaLibraryPage` | renders | `component::BatchFormModal` |
