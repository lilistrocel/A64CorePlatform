# Module Map

> Generated: 2026-08-07 08:14 UTC  
> Source: MongoDB `mapper_nodes` (grouped by module)

## Backend Module Architecture

A64 Core Platform is organized into modular business applications.
Each module contains API, service, and model layers.

**Related Maps:** [api-map.md](api-map.md) | [service-map.md](service-map.md) | [database-map.md](database-map.md)

## Module Overview

| Module | Nodes | Layers Present |
|--------|-------|----------------|
| `admin` | 3 | frontend |
| `ai` | 21 | frontend |
| `ai_analytics` | 8 | api, model, service |
| `analytics` | 5 | frontend |
| `auth` | 10 | frontend |
| `core` | 66 | api, config, core, frontend, infrastructure, model, service |
| `crm` | 13 | api, frontend, infrastructure, model, repository, service |
| `dashboard` | 7 | frontend |
| `debug` | 1 | frontend |
| `farm` | 88 | frontend |
| `farm_manager` | 159 | api, config, infrastructure, model, repository, service |
| `finance` | 55 | frontend |
| `finance_bridge` | 5 | service |
| `frontend` | 7 | config, frontend |
| `genetics` | 68 | api, config, frontend, middleware, model, service |
| `hr` | 32 | api, frontend, infrastructure, model, repository, service |
| `inventory` | 7 | frontend |
| `logistics` | 27 | api, frontend, infrastructure, model, repository, service |
| `map` | 1 | frontend |
| `marketing` | 31 | api, frontend, infrastructure, model, service |
| `mushroom` | 22 | frontend |
| `operations` | 6 | frontend |
| `platform` | 1 | frontend |
| `pnl` | 8 | frontend |
| `protocols` | 9 | frontend |
| `purchasing` | 26 | frontend |
| `sales` | 100 | api, frontend, middleware, model, service |
| `settings` | 4 | frontend |
| `shared` | 20 | frontend |
| `system` | 4 | frontend |
| `tenant` | 3 | frontend |
| `tools` | 5 | frontend |

## Module Details

### `admin` (3 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `TenantSetupWizardPage` | frontend | `frontend/user-portal/src/pages/admin/TenantSetupWizardPage.tsx` |
| component | `UserManagementPage` | frontend | `frontend/user-portal/src/pages/admin/UserManagementPage.tsx` |
| hook | `useAdminUsers` | frontend | `frontend/user-portal/src/hooks/queries/useAdminUsers.ts` |

### `ai` (21 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AIAnalyticsChat` | frontend | `frontend/user-portal/src/components/ai/AIAnalyticsChat.tsx` |
| component | `AIAssistantFAB` | frontend | `frontend/user-portal/src/components/ai-assistant/AIAssistantFAB.tsx` |
| component | `AIAssistantPanel` | frontend | `frontend/user-portal/src/components/ai-assistant/AIAssistantPanel.tsx` |
| component | `AIHub` | frontend | `frontend/user-portal/src/pages/ai/AIHub.tsx` |
| component | `AIHubChat` | frontend | `frontend/user-portal/src/components/ai/AIHubChat.tsx` |
| component | `AIHubTabBar` | frontend | `frontend/user-portal/src/components/ai/AIHubTabBar.tsx` |
| component | `ConfirmationCard` | frontend | `frontend/user-portal/src/components/ai/ConfirmationCard.tsx` |
| component | `ConversationList` | frontend | `frontend/user-portal/src/components/ai-assistant/ConversationList.tsx` |
| component | `InputBox` | frontend | `frontend/user-portal/src/components/ai-assistant/InputBox.tsx` |
| component | `MessageBubble` | frontend | `frontend/user-portal/src/components/ai-assistant/MessageBubble.tsx` |
| component | `MessageList` | frontend | `frontend/user-portal/src/components/ai-assistant/MessageList.tsx` |
| component | `ToolCallCard` | frontend | `frontend/user-portal/src/components/ai-assistant/ToolCallCard.tsx` |
| component | `VoiceControls` | frontend | `frontend/user-portal/src/components/ai/VoiceControls.tsx` |
| function | `aiAssistantApi` | frontend | `frontend/user-portal/src/services/aiAssistantApi.ts` |
| type | `aiHub types` | frontend | `frontend/user-portal/src/types/aiHub.ts` |
| function | `aiHubApi` | frontend | `frontend/user-portal/src/services/aiHubApi.ts` |
| type | `farmAI types` | frontend | `frontend/user-portal/src/types/farmAI.ts` |
| hook | `useAIAssistant` | frontend | `frontend/user-portal/src/hooks/queries/useAIAssistant.ts` |
| store | `useAIAssistantStore` | frontend | `frontend/user-portal/src/stores/aiAssistant.store.ts` |
| hook | `useAIHub` | frontend | `frontend/user-portal/src/hooks/ai/useAIHub.ts` |
| hook | `useVoice` | frontend | `frontend/user-portal/src/hooks/ai/useVoice.ts` |

### `ai_analytics` (8 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `POST /ai/chat` | api | `src/modules/ai_analytics/api/v1/chat.py` |
| pydantic_model | `ChatQueryResponse` | model | `src/modules/ai_analytics/models/chat.py` |
| db_model | `ai_query_log` | model | `src/services/database.py` |
| class | `CostTrackingService` | service | `src/modules/ai_analytics/services/cost_tracking_service.py` |
| class | `GeminiService` | service | `src/modules/ai_analytics/services/gemini_service.py` |
| class | `QueryEngine` | service | `src/modules/ai_analytics/services/query_engine.py` |
| class | `QueryValidator` | service | `src/modules/ai_analytics/utils/validators.py` |
| class | `SchemaService` | service | `src/modules/ai_analytics/services/schema_service.py` |

### `analytics` (5 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| type | `aiDashboard types` | frontend | `frontend/user-portal/src/types/aiDashboard.ts` |
| type | `analytics types` | frontend | `frontend/user-portal/src/types/analytics.ts` |
| type | `farm-analytics types` | frontend | `frontend/user-portal/src/types/farm-analytics.ts` |
| type | `farmAnalytics types` | frontend | `frontend/user-portal/src/types/farmAnalytics.ts` |
| type | `global-analytics types` | frontend | `frontend/user-portal/src/types/global-analytics.ts` |

### `auth` (10 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `BackupCodesModal` | frontend | `frontend/user-portal/src/components/auth/BackupCodesModal.tsx` |
| component | `Login` | frontend | `frontend/user-portal/src/pages/auth/Login.tsx` |
| component | `MFARouteGuards` | frontend | `frontend/user-portal/src/components/common/MFARouteGuards.tsx` |
| component | `MFASetupPage` | frontend | `frontend/user-portal/src/pages/auth/MFASetupPage.tsx` |
| component | `MFAVerifyPage` | frontend | `frontend/user-portal/src/pages/auth/MFAVerifyPage.tsx` |
| component | `PendingActivation` | frontend | `frontend/user-portal/src/pages/auth/PendingActivation.tsx` |
| component | `Register` | frontend | `frontend/user-portal/src/pages/auth/Register.tsx` |
| function | `authService` | frontend | `frontend/user-portal/src/services/auth.service.ts` |
| store | `useAuthStore` | frontend | `frontend/user-portal/src/stores/auth.store.ts` |
| hook | `useMFA` | frontend | `frontend/user-portal/src/hooks/queries/useMFA.ts` |

### `core` (66 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /admin` | api | `src/api/v1/admin.py` |
| api_endpoint | `CRUD /auth` | api | `src/api/v1/auth.py` |
| api_endpoint | `CRUD /dashboard` | api | `src/api/v1/dashboard.py` |
| api_endpoint | `CRUD /divisions` | api | `src/api/v1/divisions.py` |
| api_endpoint | `CRUD /modules` | api | `src/api/v1/modules.py` |
| api_endpoint | `CRUD /organizations` | api | `src/api/v1/organizations.py` |
| api_endpoint | `CRUD /users` | api | `src/api/v1/users.py` |
| api_endpoint | `FastAPI app bootstrap` | api | `src/main.py` |
| api_endpoint | `GET /health, /ready, /metrics*` | api | `src/api/health.py` |
| api_endpoint | `GET /industries` | api | `src/api/v1/industries.py` |
| api_endpoint | `GET /system/capabilities` | api | `src/api/v1/system.py` |
| api_endpoint | `v1 API router aggregation` | api | `src/api/routes.py` |
| config | `CF_ACCESS_AUD` | config | `src/config/settings.py` |
| config | `CF_ACCESS_DEFAULT_ROLE` | config | `src/config/settings.py` |
| config | `CF_ACCESS_ENABLED` | config | `src/config/settings.py` |
| config | `CF_ACCESS_EXCLUSIVE` | config | `src/config/settings.py` |
| config | `CF_ACCESS_JIT_PROVISION` | config | `src/config/settings.py` |
| config | `CF_ACCESS_TEAM_DOMAIN` | config | `src/config/settings.py` |
| config | `PUBLIC_BASE_URL` | config | `src/config/settings.py` |
| class | `Settings` | config | `src/config/settings.py` |
| pydantic_model | `BPReferenceMixin` | core | `src/core/documents/bp_ref.py` |
| class | `DivisionContextMiddleware` | core | `src/middleware/division_context.py` |
| class | `DivisionScopedRepository` | core | `src/core/repository_base.py` |
| module | `Document Chain Reconciler primitives` | core | `src/core/documents/chain_reconciler.py` |
| pydantic_model | `DocumentLinkRef / DocumentLineLinkMixin` | core | `src/core/documents/document_links.py` |
| class | `DocumentStatus` | core | `src/core/documents/document_status.py` |
| pydantic_model | `JournalMemoMixin / format_journal_memo` | core | `src/core/documents/journal_memo.py` |
| pydantic_model | `LineQuantityState` | core | `src/core/documents/open_quantity.py` |
| class | `PluginManager / ModuleManifest` | core | `src/core/plugin_system/plugin_manager.py` |
| class | `RateLimiter / RateLimitMiddleware / LoginRateLimiter / MFARateLimiter` | core | `src/middleware/rate_limit.py` |
| class | `RoleChecker / require_super_admin / require_admin` | core | `src/middleware/permissions.py` |
| class | `TimingMiddleware / ResponseTimeCollector` | core | `src/middleware/timing.py` |
| function | `get_cf_access_token / is_local_request` | core | `src/middleware/cf_access.py` |
| function | `get_current_user / get_current_active_user / require_mfa_setup_complete` | core | `src/middleware/auth.py` |
| module | `get_item_finance_ext / get_customer_finance_ext / get_tax_percent` | core | `src/core/finance/finance_ext_client.py` |
| function | `next_doc_number` | core | `src/core/documents/doc_number.py` |
| function | `resolve_company_code` | core | `src/core/finance/company_resolver.py` |
| function | `apiClient` | frontend | `frontend/user-portal/src/services/api.ts` |
| hook | `usePageVisibility` | frontend | `frontend/user-portal/src/hooks/usePageVisibility.ts` |
| store | `useThemeStore` | frontend | `frontend/user-portal/src/stores/theme.store.ts` |
| store | `useToastStore` | frontend | `frontend/user-portal/src/stores/toast.store.ts` |
| hook | `useUnsavedChanges` | frontend | `frontend/user-portal/src/hooks/useUnsavedChanges.ts` |
| class | `PluginManager` | infrastructure | `src/core/plugin_system/plugin_manager.py` |
| class | `RedisCache` | infrastructure | `src/core/cache/redis_cache.py` |
| function | `cache_response / invalidate_cache_pattern` | infrastructure | `src/core/cache/decorators.py` |
| function | `setup_logging / JSONFormatter` | infrastructure | `src/core/logging_config.py` |
| class | `ChartWidgetData / StatWidgetData / WidgetDataResponse` | model | `src/models/dashboard.py` |
| class | `DeploymentSettingItem / DeploymentSettingsResponse` | model | `src/models/deployment_settings.py` |
| class | `IndustryType / Division / DivisionResponse` | model | `src/models/division.py` |
| class | `ModuleConfig / ModuleStatusResponse / PortAllocation` | model | `src/models/module.py` |
| class | `Organization / OrganizationModules / PublicInfoPageConfig` | model | `src/models/organization.py` |
| class | `UserMFA / MFABackupCode / MFAAuditLog` | model | `src/models/mfa.py` |
| class | `UserRole / UserCreate / UserResponse / TokenResponse / MFA* models` | model | `src/models/user.py` |
| db_model | `platform_settings` | model | `src/services/deployment_settings_service.py` |
| class | `AuthService` | service | `src/services/auth_service.py` |
| class | `DashboardService` | service | `src/services/dashboard_service.py` |
| class | `DivisionService` | service | `src/services/division_service.py` |
| class | `MFAService` | service | `src/services/mfa_service.py` |
| class | `ModuleManager` | service | `src/services/module_manager.py` |
| class | `MongoDBManager` | service | `src/services/database.py` |
| class | `OrganizationService` | service | `src/services/organization_service.py` |
| class | `PortManager` | service | `src/services/port_manager.py` |
| class | `ProxyManager` | service | `src/services/proxy_manager.py` |
| class | `UserService` | service | `src/services/user_service.py` |
| file | `deployment_settings_service` | service | `src/services/deployment_settings_service.py` |
| class | `verify_cf_access_token / CFAccessIdentity` | service | `src/services/cf_access_service.py` |

### `crm` (13 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /crm/customers` | api | `src/modules/crm/api/v1/customers.py` |
| component | `CRMPage` | frontend | `frontend/user-portal/src/pages/crm/CRMPage.tsx` |
| component | `CustomerCard` | frontend | `frontend/user-portal/src/components/crm/CustomerCard.tsx` |
| component | `CustomerDetailPage` | frontend | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx` |
| component | `CustomerForm` | frontend | `frontend/user-portal/src/components/crm/CustomerForm.tsx` |
| component | `CustomerTable` | frontend | `frontend/user-portal/src/components/crm/CustomerTable.tsx` |
| type | `crm types` | frontend | `frontend/user-portal/src/types/crm.ts` |
| function | `crmService` | frontend | `frontend/user-portal/src/services/crmService.ts` |
| class | `CRMDatabaseManager` | infrastructure | `src/modules/crm/services/database.py` |
| pydantic_model | `Customer` | model | `src/modules/crm/models/customer.py` |
| db_model | `customers` | model | `src/modules/crm/services/customer/customer_repository.py` |
| class | `CustomerRepository` | repository | `src/modules/crm/services/customer/customer_repository.py` |
| class | `CustomerService` | service | `src/modules/crm/services/customer/customer_service.py` |

### `dashboard` (7 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AddWidgetModal` | frontend | `frontend/user-portal/src/components/dashboard/AddWidgetModal.tsx` |
| component | `Dashboard` | frontend | `frontend/user-portal/src/pages/dashboard/Dashboard.tsx` |
| component | `IndustryDashboard` | frontend | `frontend/user-portal/src/pages/dashboard/IndustryDashboard.tsx` |
| function | `dashboardDataService` | frontend | `frontend/user-portal/src/services/dashboard-data.service.ts` |
| function | `dashboardService` | frontend | `frontend/user-portal/src/services/dashboard.service.ts` |
| hook | `useDashboard` | frontend | `frontend/user-portal/src/hooks/queries/useDashboard.ts` |
| store | `useDashboardStore` | frontend | `frontend/user-portal/src/stores/dashboard.store.ts` |

### `debug` (1 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `ClearCache` | frontend | `frontend/user-portal/src/pages/debug/ClearCache.tsx` |

### `farm` (88 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AddVirtualCropModal` | frontend | `frontend/user-portal/src/components/farm/AddVirtualCropModal.tsx` |
| component | `AgriDataTab` | frontend | `frontend/user-portal/src/components/farm/weather/AgriDataTab.tsx` |
| component | `AirQualityCard` | frontend | `frontend/user-portal/src/components/farm/weather/AirQualityCard.tsx` |
| component | `AreaBudgetBar` | frontend | `frontend/user-portal/src/components/farm/AreaBudgetBar.tsx` |
| component | `BlockAlertsTab` | frontend | `frontend/user-portal/src/components/farm/BlockAlertsTab.tsx` |
| component | `BlockAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/BlockAnalyticsModal.tsx` |
| component | `BlockArchivesTab` | frontend | `frontend/user-portal/src/components/farm/BlockArchivesTab.tsx` |
| component | `BlockAutomationTab` | frontend | `frontend/user-portal/src/components/farm/BlockAutomationTab.tsx` |
| component | `BlockCard` | frontend | `frontend/user-portal/src/components/farm/BlockCard.tsx` |
| component | `BlockDetail` | frontend | `frontend/user-portal/src/components/farm/BlockDetail.tsx` |
| component | `BlockDetailsModal` | frontend | `frontend/user-portal/src/components/farm/BlockDetailsModal.tsx` |
| component | `BlockGrid` | frontend | `frontend/user-portal/src/components/farm/BlockGrid.tsx` |
| component | `BlockGrid` | frontend | `frontend/user-portal/src/components/farm/dashboard/BlockGrid.tsx` |
| component | `BlockHarvestEntryModal` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestEntryModal.tsx` |
| component | `BlockHarvestsTab` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestsTab.tsx` |
| component | `BlockMonitorHero` | frontend | `frontend/user-portal/src/components/farm/BlockMonitorHero.tsx` |
| component | `BlockViewToggle` | frontend | `frontend/user-portal/src/components/farm/BlockViewToggle.tsx` |
| component | `CompactBlockCard` | frontend | `frontend/user-portal/src/components/farm/dashboard/CompactBlockCard.tsx` |
| component | `CreateBlockModal` | frontend | `frontend/user-portal/src/components/farm/CreateBlockModal.tsx` |
| component | `CreateFarmModal` | frontend | `frontend/user-portal/src/components/farm/CreateFarmModal.tsx` |
| component | `CurrentWeatherCard` | frontend | `frontend/user-portal/src/components/farm/weather/CurrentWeatherCard.tsx` |
| component | `DashboardFilters` | frontend | `frontend/user-portal/src/components/farm/dashboard/DashboardFilters.tsx` |
| component | `DashboardSettings` | frontend | `frontend/user-portal/src/components/farm/dashboard/DashboardSettings.tsx` |
| component | `EditBlockModal` | frontend | `frontend/user-portal/src/components/farm/EditBlockModal.tsx` |
| component | `EditFarmBoundaryModal` | frontend | `frontend/user-portal/src/components/farm/EditFarmBoundaryModal.tsx` |
| component | `EditFarmModal` | frontend | `frontend/user-portal/src/components/farm/EditFarmModal.tsx` |
| component | `EmptyVirtualBlockModal` | frontend | `frontend/user-portal/src/components/farm/EmptyVirtualBlockModal.tsx` |
| component | `FarmAIChat` | frontend | `frontend/user-portal/src/components/farm/FarmAIChat.tsx` |
| component | `FarmAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/FarmAnalyticsModal.tsx` |
| component | `FarmCard` | frontend | `frontend/user-portal/src/components/farm/FarmCard.tsx` |
| component | `FarmDashboard` | frontend | `frontend/user-portal/src/components/farm/FarmDashboard.tsx` |
| component | `FarmDetail` | frontend | `frontend/user-portal/src/components/farm/FarmDetail.tsx` |
| component | `FarmHistoryTab` | frontend | `frontend/user-portal/src/components/farm/FarmHistoryTab.tsx` |
| component | `FarmList` | frontend | `frontend/user-portal/src/components/farm/FarmList.tsx` |
| component | `FarmManager` | frontend | `frontend/user-portal/src/pages/farm/FarmManager.tsx` |
| component | `FarmMapView` | frontend | `frontend/user-portal/src/components/farm/FarmMapView.tsx` |
| component | `FarmQuickSwitcher` | frontend | `frontend/user-portal/src/components/farm/FarmQuickSwitcher.tsx` |
| component | `FarmingYearSelector` | frontend | `frontend/user-portal/src/components/farm/FarmingYearSelector.tsx` |
| component | `FertigationScheduleEditorModal` | frontend | `frontend/user-portal/src/components/farm/FertigationScheduleEditorModal.tsx` |
| component | `ForecastCard` | frontend | `frontend/user-portal/src/components/farm/weather/ForecastCard.tsx` |
| component | `GlobalFarmAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/GlobalFarmAnalyticsModal.tsx` |
| component | `InsightsCard` | frontend | `frontend/user-portal/src/components/farm/weather/InsightsCard.tsx` |
| component | `PendingTasksWarningModal` | frontend | `frontend/user-portal/src/components/farm/PendingTasksWarningModal.tsx` |
| component | `PhysicalBlockCard` | frontend | `frontend/user-portal/src/components/farm/PhysicalBlockCard.tsx` |
| component | `PhysicalBlockGrid` | frontend | `frontend/user-portal/src/components/farm/PhysicalBlockGrid.tsx` |
| component | `PhysicalBlockPlantingsModal` | frontend | `frontend/user-portal/src/components/farm/PhysicalBlockPlantingsModal.tsx` |
| component | `PlantAssignmentModal` | frontend | `frontend/user-portal/src/components/farm/PlantAssignmentModal.tsx` |
| component | `PlantCombobox` | frontend | `frontend/user-portal/src/components/farm/PlantCombobox.tsx` |
| component | `PlantDataCard` | frontend | `frontend/user-portal/src/components/farm/PlantDataCard.tsx` |
| component | `PlantDataDetail` | frontend | `frontend/user-portal/src/components/farm/PlantDataDetail.tsx` |
| component | `PlantDataFormModal` | frontend | `frontend/user-portal/src/components/farm/PlantDataFormModal.tsx` |
| component | `PlantDataLibrary` | frontend | `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx` |
| component | `PlantMotherCard` | frontend | `frontend/user-portal/src/components/farm/PlantMotherCard.tsx` |
| component | `PlantMotherDetailModal` | frontend | `frontend/user-portal/src/components/farm/PlantMotherDetailModal.tsx` |
| component | `PlantMotherFormModal` | frontend | `frontend/user-portal/src/components/farm/PlantMotherFormModal.tsx` |
| component | `QuickPlanModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/QuickPlanModal.tsx` |
| component | `ResolveAlertModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/ResolveAlertModal.tsx` |
| component | `SensorFusionTab` | frontend | `frontend/user-portal/src/components/farm/weather/SensorFusionTab.tsx` |
| component | `SoilConditionsCard` | frontend | `frontend/user-portal/src/components/farm/weather/SoilConditionsCard.tsx` |
| component | `SolarLightCard` | frontend | `frontend/user-portal/src/components/farm/weather/SolarLightCard.tsx` |
| component | `VirtualBlockItem` | frontend | `frontend/user-portal/src/components/farm/VirtualBlockItem.tsx` |
| component | `VirtualBlocksView` | frontend | `frontend/user-portal/src/components/farm/VirtualBlocksView.tsx` |
| type | `alerts types` | frontend | `frontend/user-portal/src/types/alerts.ts` |
| function | `alertsApi` | frontend | `frontend/user-portal/src/services/alertsApi.ts` |
| type | `farm types` | frontend | `frontend/user-portal/src/types/farm.ts` |
| function | `farmApi` | frontend | `frontend/user-portal/src/services/farmApi.ts` |
| function | `inventoryApi` | frontend | `frontend/user-portal/src/services/inventoryApi.ts` |
| file | `mapConfig` | frontend | `frontend/user-portal/src/config/mapConfig.ts` |
| function | `plantDataEnhancedApi` | frontend | `frontend/user-portal/src/services/plantDataEnhancedApi.ts` |
| function | `plantMotherApi` | frontend | `frontend/user-portal/src/services/plantMotherApi.ts` |
| type | `task types` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| function | `tasksApi` | frontend | `frontend/user-portal/src/services/tasksApi.ts` |
| hook | `useBlockActions` | frontend | `frontend/user-portal/src/hooks/farm/useBlockActions.ts` |
| hook | `useBlockAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useBlockAnalytics.ts` |
| hook | `useBlockViewMode` | frontend | `frontend/user-portal/src/hooks/farm/useBlockViewMode.ts` |
| hook | `useDashboardConfig` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardConfig.ts` |
| hook | `useDashboardData` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardData.ts` |
| hook | `useDashboardFilters` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardFilters.ts` |
| hook | `useFarmAIChat` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAIChat.ts` |
| hook | `useFarmAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAnalytics.ts` |
| store | `useFarmingYearStore` | frontend | `frontend/user-portal/src/stores/farmingYear.store.ts` |
| hook | `useFarmingYears` | frontend | `frontend/user-portal/src/hooks/queries/useFarmingYears.ts` |
| hook | `useFarms` | frontend | `frontend/user-portal/src/hooks/queries/useFarms.ts` |
| hook | `useGlobalAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useGlobalAnalytics.ts` |
| hook | `useMultiLevelAIChat` | frontend | `frontend/user-portal/src/hooks/farm/useMultiLevelAIChat.ts` |
| hook | `usePlantMothers` | frontend | `frontend/user-portal/src/hooks/queries/usePlantMothers.ts` |
| hook | `useWeatherData` | frontend | `frontend/user-portal/src/hooks/farm/useWeatherData.ts` |
| function | `weatherApi` | frontend | `frontend/user-portal/src/services/weatherApi.ts` |

### `farm_manager` (159 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /ai-dashboard` | api | `src/modules/farm_manager/api/v1/ai_dashboard.py` |
| api_endpoint | `CRUD /ai-hub` | api | `src/modules/farm_manager/api/v1/ai_hub.py` |
| api_endpoint | `CRUD /config` | api | `src/modules/farm_manager/api/v1/config.py` |
| api_endpoint | `CRUD /config/watchdog` | api | `src/modules/farm_manager/api/v1/watchdog.py` |
| api_endpoint | `CRUD /farm/plant-mothers` | api | `src/modules/farm_manager/api/v1/plant_mothers.py` |
| api_endpoint | `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | api | `src/modules/farm_manager/api/v1/block_alerts.py` |
| api_endpoint | `CRUD /farms/{farm_id}/blocks/{block_id}/cameras` | api | `src/modules/farm_manager/api/v1/cameras.py` |
| api_endpoint | `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | api | `src/modules/farm_manager/api/v1/block_harvests.py` |
| api_endpoint | `CRUD /inventory` | api | `src/modules/farm_manager/api/v1/inventory.py` |
| api_endpoint | `CRUD /plant-data` | api | `src/modules/farm_manager/api/v1/plant_data.py` |
| api_endpoint | `CRUD /plant-data-enhanced` | api | `src/modules/farm_manager/api/v1/plant_data_enhanced.py` |
| api_endpoint | `CRUD /plantings` | api | `src/modules/farm_manager/api/v1/plantings.py` |
| api_endpoint | `CRUD /sensehub` | api | `src/modules/farm_manager/api/v1/sensehub.py` |
| api_endpoint | `CRUD /sensehub-cache` | api | `src/modules/farm_manager/api/v1/sensehub_cache.py` |
| api_endpoint | `CRUD /tasks` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `DELETE /farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `DELETE /farms/{farm_id}/blocks/{block_id}` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `DELETE /tasks/{task_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /archives` | api | `src/modules/farm_manager/api/v1/block_archives.py` |
| api_endpoint | `GET /dashboard` | api | `src/modules/farm_manager/api/v1/dashboard.py` |
| api_endpoint | `GET /farms` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /farms/analytics/global` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /farms/{farm_id}/analytics` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}/analytics` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}/children` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}/empty-virtual/preview` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}/kpi` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/blocks/{block_id}/valid-transitions` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET /farms/{farm_id}/farming-years` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /farms/{farm_id}/summary` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `GET /managers` | api | `src/modules/farm_manager/api/v1/managers.py` |
| api_endpoint | `GET /tasks/admin/pending-aggregations` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /tasks/blocks/{block_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /tasks/farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /tasks/my-tasks` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /tasks/pending-count` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /tasks/{task_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `GET /weather` | api | `src/modules/farm_manager/api/v1/weather.py` |
| api_endpoint | `GET+DELETE /farms/{farm_id}/blocks/{block_id}/iot-controller` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `GET+PUT /iot-proxy` | api | `src/modules/farm_manager/api/v1/iot_proxy.py` |
| api_endpoint | `PATCH /farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `PATCH /farms/{farm_id}/blocks/{block_id}` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `PATCH /farms/{farm_id}/blocks/{block_id}/status` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /ai-monitor/chat` | api | `src/modules/farm_manager/api/v1/global_ai_chat.py` |
| api_endpoint | `POST /farms` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `POST /farms/{farm_id}/ai-chat` | api | `src/modules/farm_manager/api/v1/farm_level_ai_chat.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | api | `src/modules/farm_manager/api/v1/farm_ai_chat.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks/{block_id}/empty-virtual` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks/{block_id}/refresh-plant-data` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks/{block_id}/virtual-crops` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /tasks` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/admin/aggregate-harvest/{task_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/admin/run-daily-aggregation` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/{task_id}/cancel` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/{task_id}/complete` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/{task_id}/end-harvest` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `POST /tasks/{task_id}/harvest` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `PUT /tasks/{task_id}` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `tasks router` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| config | `WEATHERBIT_API_KEY` | config | `docker-compose.yml` |
| config | `WEATHERBIT_ENABLED` | config | `docker-compose.yml` |
| class | `FarmDatabaseManager` | infrastructure | `src/modules/farm_manager/services/database.py` |
| pydantic_model | `Block` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `BlockAlert` | model | `src/modules/farm_manager/models/block_alert.py` |
| pydantic_model | `BlockArchive` | model | `src/modules/farm_manager/models/block_archive.py` |
| pydantic_model | `BlockHarvest` | model | `src/modules/farm_manager/models/block_harvest.py` |
| pydantic_model | `CurrentWeather` | model | `src/modules/farm_manager/models/weather.py` |
| pydantic_model | `DashboardSummary` | model | `src/modules/farm_manager/models/dashboard.py` |
| pydantic_model | `Farm` | model | `src/modules/farm_manager/models/farm.py` |
| pydantic_model | `FarmAnalyticsResponse` | model | `src/modules/farm_manager/models/farm_analytics.py` |
| pydantic_model | `FarmTask` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTask` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskCreate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskListResponse` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskUpdate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskWithDetails` | model | `src/modules/farm_manager/models/farm_task.py` |
| pydantic_model | `GlobalAnalyticsResponse` | model | `src/modules/farm_manager/models/global_analytics.py` |
| db_model | `HarvestEntry` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HarvestEntryCreate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HarvestGrade` | model | `src/modules/farm_manager/models/farm_task.py` |
| pydantic_model | `HarvestInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `HarvestTotal` | model | `src/modules/farm_manager/models/farm_task.py` |
| pydantic_model | `PlantData` | model | `src/modules/farm_manager/models/plant_data.py` |
| pydantic_model | `PlantDataEnhanced` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `PlantMother` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `TaskCompletionData` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskData` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskPriority` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskStatus` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskType` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `alerts` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_archives` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_cycles` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `blocks` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `daily_harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `farm_assignments` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `farm_tasks` | model | `src/modules/farm_manager/services/task/task_repository.py` |
| db_model | `farmer_assignments` | model | `src/modules/farm_manager/services/task/task_service.py` |
| db_model | `farms` | model | `src/modules/farm_manager/services/farm/farm_repository.py` |
| db_model | `harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_asset` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_harvest` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_input` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_movements` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `plant_data` | model | `src/modules/farm_manager/services/plant_data/plant_data_repository.py` |
| db_model | `plant_data_enhanced` | model | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py` |
| db_model | `plant_mothers` | model | `src/modules/farm_manager/services/plant_data/plant_mother_repository.py` |
| db_model | `plantings` | model | `src/modules/farm_manager/services/planting/planting_repository.py` |
| db_model | `products` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `stock_inventory` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `system_config` | model | `src/modules/farm_manager/services/config_service.py` |
| db_model | `weather_cache` | model | `src/modules/farm_manager/services/weather/weather_cache_service.py` |
| class | `AlertRepository` | repository | `src/modules/farm_manager/services/block/alert_repository.py` |
| class | `ArchiveRepository` | repository | `src/modules/farm_manager/services/block/archive_repository.py` |
| class | `BlockRepository` | repository | `src/modules/farm_manager/services/block/block_repository_new.py` |
| class | `FarmRepository` | repository | `src/modules/farm_manager/services/farm/farm_repository.py` |
| class | `HarvestRepository` | repository | `src/modules/farm_manager/services/block/harvest_repository.py` |
| class | `PlantDataEnhancedRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py` |
| class | `PlantDataRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_data_repository.py` |
| class | `PlantMotherRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_mother_repository.py` |
| class | `PlantingRepository` | repository | `src/modules/farm_manager/services/planting/planting_repository.py` |
| class | `TaskRepository` | repository | `src/modules/farm_manager/services/task/task_repository.py` |
| class | `AlertService` | service | `src/modules/farm_manager/services/block/alert_service.py` |
| class | `ArchiveService` | service | `src/modules/farm_manager/services/block/archive_service.py` |
| class | `BlockAnalyticsService` | service | `src/modules/farm_manager/services/block/analytics_service.py` |
| class | `BlockService` | service | `src/modules/farm_manager/services/block/block_service_new.py` |
| class | `CascadeDeletionService` | service | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| class | `ConfigService` | service | `src/modules/farm_manager/services/config_service.py` |
| class | `FarmAIChatService` | service | `src/modules/farm_manager/services/farm_ai/service.py` |
| class | `FarmAnalyticsService` | service | `src/modules/farm_manager/services/farm/farm_analytics_service.py` |
| class | `FarmService` | service | `src/modules/farm_manager/services/farm/farm_service.py` |
| class | `FarmingYearService` | service | `src/modules/farm_manager/services/farming_year_service.py` |
| class | `GlobalAnalyticsService` | service | `src/modules/farm_manager/services/global_analytics_service.py` |
| class | `HarvestAggregatorService` | service | `src/modules/farm_manager/services/task/harvest_aggregator.py` |
| class | `HarvestAggregatorService` | service | `src/modules/farm_manager/services/task/harvest_aggregator.py` |
| class | `HarvestService` | service | `src/modules/farm_manager/services/block/harvest_service.py` |
| class | `PlantDataEnhancedService` | service | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py` |
| class | `PlantDataService` | service | `src/modules/farm_manager/services/plant_data/plant_data_service.py` |
| class | `PlantMotherService` | service | `src/modules/farm_manager/services/plant_data/plant_mother_service.py` |
| class | `PlantingService` | service | `src/modules/farm_manager/services/planting/planting_service.py` |
| class | `SenseHubClient` | service | `src/modules/farm_manager/services/sensehub/sensehub_client.py` |
| class | `SenseHubConnectionService` | service | `src/modules/farm_manager/services/sensehub/sensehub_connection_service.py` |
| class | `SenseHubMCPClient` | service | `src/modules/farm_manager/services/sensehub/sensehub_mcp_client.py` |
| class | `TaskGeneratorService` | service | `src/modules/farm_manager/services/task/task_generator.py` |
| class | `TaskGeneratorService` | service | `src/modules/farm_manager/services/task/task_generator.py` |
| class | `TaskRepository` | service | `src/modules/farm_manager/services/task/task_repository.py` |
| class | `TaskService` | service | `src/modules/farm_manager/services/task/task_service.py` |
| class | `TaskService` | service | `src/modules/farm_manager/services/task/task_service.py` |
| class | `VirtualBlockService` | service | `src/modules/farm_manager/services/block/virtual_block_service.py` |
| class | `WeatherAPIClient` | service | `src/modules/farm_manager/services/weather/weather_client.py` |
| class | `WeatherCacheService` | service | `src/modules/farm_manager/services/weather/weather_cache_service.py` |
| class | `WeatherService` | service | `src/modules/farm_manager/services/weather/weather_service.py` |
| function | `_enrich_tasks_with_block_farm` | service | `src/modules/farm_manager/services/task/task_repository.py` |

### `finance` (55 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `APAgingPage` | frontend | `frontend/user-portal/src/pages/finance/APAgingPage.tsx` |
| component | `AccountCombobox` | frontend | `frontend/user-portal/src/components/finance/AccountCombobox.tsx` |
| component | `ApprovalRulesPage` | frontend | `frontend/user-portal/src/pages/finance/ApprovalRulesPage.tsx` |
| component | `AuditHistoryModal` | frontend | `frontend/user-portal/src/components/finance/AuditHistoryModal/AuditHistoryModal.tsx` |
| component | `BalanceSheetPage` | frontend | `frontend/user-portal/src/pages/finance/BalanceSheetPage.tsx` |
| component | `CashFlowStatementPage` | frontend | `frontend/user-portal/src/pages/finance/CashFlowStatementPage.tsx` |
| component | `ChartOfAccountsPage` | frontend | `frontend/user-portal/src/pages/finance/ChartOfAccountsPage.tsx` |
| component | `CostCenterCombobox` | frontend | `frontend/user-portal/src/components/finance/CostCenterCombobox/CostCenterCombobox.tsx` |
| component | `FinanceGate` | frontend | `frontend/user-portal/src/components/finance/FinanceGate.tsx` |
| component | `FinanceReportPage` | frontend | `frontend/user-portal/src/components/finance/FinanceReportPage/FinanceReportPage.tsx` |
| function | `FinanceStatusPhase` | frontend | `frontend/user-portal/src/components/finance/statusPhase.ts` |
| component | `FinanceUnreachableBanner` | frontend | `frontend/user-portal/src/components/finance/FinanceUnreachableBanner.tsx` |
| component | `IncomeStatementPage` | frontend | `frontend/user-portal/src/pages/finance/IncomeStatementPage.tsx` |
| component | `IncomingPreviewPage` | frontend | `frontend/user-portal/src/pages/finance/IncomingPreviewPage.tsx` |
| component | `ItemMappingPage` | frontend | `frontend/user-portal/src/pages/finance/ItemMappingPage.tsx` |
| component | `JournalEntriesPage` | frontend | `frontend/user-portal/src/pages/finance/JournalEntriesPage.tsx` |
| component | `ManualJournalEntryPage` | frontend | `frontend/user-portal/src/pages/finance/ManualJournalEntryPage.tsx` |
| component | `PaymentDetailPage` | frontend | `frontend/user-portal/src/pages/finance/PaymentDetailPage.tsx` |
| component | `PaymentsPage` | frontend | `frontend/user-portal/src/pages/finance/PaymentsPage.tsx` |
| component | `PeriodsPage` | frontend | `frontend/user-portal/src/pages/finance/PeriodsPage.tsx` |
| component | `PostingSetupPage` | frontend | `frontend/user-portal/src/pages/finance/PostingSetupPage.tsx` |
| component | `RecordPaymentPage` | frontend | `frontend/user-portal/src/pages/finance/RecordPaymentPage.tsx` |
| component | `StatusBadge` | frontend | `frontend/user-portal/src/components/finance/StatusBadge.tsx` |
| component | `TrialBalancePage` | frontend | `frontend/user-portal/src/pages/finance/TrialBalancePage.tsx` |
| component | `VendorSubLedgerPage` | frontend | `frontend/user-portal/src/pages/finance/VendorSubLedgerPage.tsx` |
| function | `approvalRulesService` | frontend | `frontend/user-portal/src/services/approvalRulesService.ts` |
| function | `companiesService` | frontend | `frontend/user-portal/src/services/companiesService.ts` |
| function | `costCentersService` | frontend | `frontend/user-portal/src/services/costCentersService.ts` |
| type | `finance types` | frontend | `frontend/user-portal/src/types/finance.ts` |
| function | `financeAccountsService` | frontend | `frontend/user-portal/src/services/financeAccountsService.ts` |
| function | `financeCompaniesService` | frontend | `frontend/user-portal/src/services/financeCompaniesService.ts` |
| function | `financeReportsService` | frontend | `frontend/user-portal/src/services/financeReportsService.ts` |
| function | `financeService` | frontend | `frontend/user-portal/src/services/financeService.ts` |
| function | `fiscalPeriodsService` | frontend | `frontend/user-portal/src/services/fiscalPeriodsService.ts` |
| function | `itemMappingService` | frontend | `frontend/user-portal/src/services/itemMappingService.ts` |
| function | `journalEntriesService` | frontend | `frontend/user-portal/src/services/journalEntriesService.ts` |
| function | `paymentsService` | frontend | `frontend/user-portal/src/services/paymentsService.ts` |
| function | `postingSetupService` | frontend | `frontend/user-portal/src/services/postingSetupService.ts` |
| function | `taxCodesService` | frontend | `frontend/user-portal/src/services/taxCodesService.ts` |
| function | `trialBalanceService` | frontend | `frontend/user-portal/src/services/trialBalanceService.ts` |
| hook | `useApprovalRules` | frontend | `frontend/user-portal/src/hooks/queries/useApprovalRules.ts` |
| hook | `useCompanies` | frontend | `frontend/user-portal/src/hooks/queries/useCompanies.ts` |
| hook | `useCostCenters` | frontend | `frontend/user-portal/src/hooks/queries/useCostCenters.ts` |
| hook | `useFinanceAccounts` | frontend | `frontend/user-portal/src/hooks/queries/useFinanceAccounts.ts` |
| hook | `useFinanceCompanies` | frontend | `frontend/user-portal/src/hooks/queries/useFinanceCompanies.ts` |
| hook | `useFinancePnl` | frontend | `frontend/user-portal/src/hooks/useFinancePnl.ts` |
| hook | `useFinanceReports` | frontend | `frontend/user-portal/src/hooks/queries/useFinanceReports.ts` |
| hook | `useFiscalPeriods` | frontend | `frontend/user-portal/src/hooks/queries/useFiscalPeriods.ts` |
| hook | `useItemMappings` | frontend | `frontend/user-portal/src/hooks/queries/useItemMappings.ts` |
| hook | `useItemMappingsMap` | frontend | `frontend/user-portal/src/hooks/queries/useItemMappingsMap.ts` |
| hook | `useJournalEntries` | frontend | `frontend/user-portal/src/hooks/queries/useJournalEntries.ts` |
| hook | `usePayments` | frontend | `frontend/user-portal/src/hooks/queries/usePayments.ts` |
| hook | `usePostingSetup` | frontend | `frontend/user-portal/src/hooks/queries/usePostingSetup.ts` |
| hook | `useTaxCodes` | frontend | `frontend/user-portal/src/hooks/queries/useTaxCodes.ts` |
| hook | `useTrialBalance` | frontend | `frontend/user-portal/src/hooks/queries/useTrialBalance.ts` |

### `finance_bridge` (5 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| class | `OutboxRepository` | service | `src/modules/finance_bridge/outbox_repository.py` |
| class | `OutboxWriter` | service | `src/modules/finance_bridge/outbox_writer.py` |
| function | `get_finance_reachability` | service | `src/modules/finance_bridge/reachability.py` |
| function | `is_finance_enabled_for_org / invalidate_tenant_flag_cache` | service | `src/modules/finance_bridge/tenant_flag.py` |
| function | `is_outbox_enabled` | service | `src/modules/finance_bridge/feature_flag.py` |

### `frontend` (7 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `NODE_ENV` | config | `docker-compose.yml` |
| config | `VITE_API_TARGET` | config | `docker-compose.yml` |
| config | `VITE_API_URL` | config | `docker-compose.yml` |
| function | `positiveIntegerInputProps` | frontend | `frontend/user-portal/src/utils/inputGuards.ts` |
| function | `positiveNumberInputProps` | frontend | `frontend/user-portal/src/utils/inputGuards.ts` |
| config | `theme` | frontend | `frontend/shared/src/theme/theme.ts` |
| file | `utils/index` | frontend | `frontend/user-portal/src/utils/index.ts` |

### `genetics` (68 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /genetics/accessions` | api | `src/modules/genetics/api/v1/accessions.py` |
| api_endpoint | `CRUD /genetics/lines` | api | `src/modules/genetics/api/v1/lines.py` |
| api_endpoint | `CRUD /genetics/media` | api | `src/modules/genetics/api/v1/media.py` |
| api_endpoint | `CRUD /genetics/observations` | api | `src/modules/genetics/api/v1/observations.py` |
| api_endpoint | `CRUD /genetics/propagations` | api | `src/modules/genetics/api/v1/propagations.py` |
| api_endpoint | `GET /genetics/accessions/{id}/labels` | api | `src/modules/genetics/api/v1/labels.py` |
| api_endpoint | `GET /genetics/dashboard` | api | `src/modules/genetics/api/v1/dashboard.py` |
| api_endpoint | `GET /genetics/lineage` | api | `src/modules/genetics/api/v1/lineage.py` |
| api_endpoint | `GET /public/genetics/i/{token}[/{vesselNo}]` | api | `src/modules/genetics/api/v1/public.py` |
| api_endpoint | `GET/DELETE /genetics/maintenance/orphans` | api | `src/modules/genetics/api/v1/maintenance.py` |
| function | `genetics response envelopes` | api | `src/modules/genetics/utils/responses.py` |
| config | `Genetics module settings` | config | `src/modules/genetics/config/settings.py` |
| file | `genetics module registration` | config | `src/modules/genetics/register.py` |
| component | `AccessionDetailPage` | frontend | `frontend/user-portal/src/pages/genetics/AccessionDetailPage.tsx` |
| component | `AmendPropagationModal` | frontend | `frontend/user-portal/src/components/genetics/AmendPropagationModal.tsx` |
| component | `BatchFormModal` | frontend | `frontend/user-portal/src/components/genetics/BatchFormModal.tsx` |
| component | `EditAccessionModal` | frontend | `frontend/user-portal/src/components/genetics/EditAccessionModal.tsx` |
| component | `GeneticsRepoPage` | frontend | `frontend/user-portal/src/pages/genetics/GeneticsRepoPage.tsx` |
| component | `GrowingProfilePanel` | frontend | `frontend/user-portal/src/components/genetics/GrowingProfilePanel.tsx` |
| component | `KIND_ICON_COMPONENTS` | frontend | `frontend/user-portal/src/components/genetics/kindIcons.ts` |
| component | `LabelInfoPage` | frontend | `frontend/user-portal/src/pages/public/LabelInfoPage.tsx` |
| component | `LineDetailPage` | frontend | `frontend/user-portal/src/pages/genetics/LineDetailPage.tsx` |
| component | `LineFormModal` | frontend | `frontend/user-portal/src/components/genetics/LineFormModal.tsx` |
| component | `LineYieldPanel` | frontend | `frontend/user-portal/src/components/genetics/LineYieldPanel.tsx` |
| component | `LineageTree` | frontend | `frontend/user-portal/src/components/genetics/LineageTree.tsx` |
| component | `LocationPicker` | frontend | `frontend/user-portal/src/components/genetics/LocationPicker.tsx` |
| component | `MediaLibraryPage` | frontend | `frontend/user-portal/src/pages/genetics/MediaLibraryPage.tsx` |
| component | `Modal` | frontend | `frontend/user-portal/src/components/genetics/Modal.tsx` |
| component | `ObservationModal` | frontend | `frontend/user-portal/src/components/genetics/ObservationModal.tsx` |
| component | `OrphanSweepCard` | frontend | `frontend/user-portal/src/components/settings/OrphanSweepCard.tsx` |
| component | `PrintLabelsModal` | frontend | `frontend/user-portal/src/components/genetics/PrintLabelsModal.tsx` |
| component | `PromoteTraitModal` | frontend | `frontend/user-portal/src/components/genetics/PromoteTraitModal.tsx` |
| component | `PropagateModal` | frontend | `frontend/user-portal/src/components/genetics/PropagateModal.tsx` |
| component | `RecipeFormModal` | frontend | `frontend/user-portal/src/components/genetics/RecipeFormModal.tsx` |
| component | `RegisterAccessionModal` | frontend | `frontend/user-portal/src/components/genetics/RegisterAccessionModal.tsx` |
| component | `RemoveLineModal` | frontend | `frontend/user-portal/src/components/genetics/RemoveLineModal.tsx` |
| component | `SplitAccessionModal` | frontend | `frontend/user-portal/src/components/genetics/SplitAccessionModal.tsx` |
| type | `genetics` | frontend | `frontend/user-portal/src/types/genetics.ts` |
| function | `genetics frontend permission helpers` | frontend | `frontend/user-portal/src/components/genetics/permissions.ts` |
| component | `genetics styled primitives` | frontend | `frontend/user-portal/src/components/genetics/styled.ts` |
| function | `geneticsApi` | frontend | `frontend/user-portal/src/services/geneticsApi.ts` |
| hook | `useGenetics` | frontend | `frontend/user-portal/src/hooks/genetics/useGenetics.ts` |
| hook | `useGrowingProfiles` | frontend | `frontend/user-portal/src/hooks/genetics/useGrowingProfiles.ts` |
| middleware | `genetics authorization` | middleware | `src/modules/genetics/middleware/auth.py` |
| pydantic_model | `Accession models` | model | `src/modules/genetics/models/accession.py` |
| pydantic_model | `Genetic line models` | model | `src/modules/genetics/models/line.py` |
| pydantic_model | `Genetics enumerations` | model | `src/modules/genetics/models/enums.py` |
| pydantic_model | `Lineage graph models` | model | `src/modules/genetics/models/lineage.py` |
| pydantic_model | `Medium recipe & batch models` | model | `src/modules/genetics/models/medium.py` |
| pydantic_model | `Observation models` | model | `src/modules/genetics/models/observation.py` |
| pydantic_model | `Propagation models` | model | `src/modules/genetics/models/propagation.py` |
| db_model | `genetic_accessions` | model | `src/modules/genetics/services/database.py` |
| db_model | `genetic_lines` | model | `src/modules/genetics/services/database.py` |
| db_model | `genetic_observations` | model | `src/modules/genetics/services/database.py` |
| db_model | `medium_batches` | model | `src/modules/genetics/services/database.py` |
| db_model | `medium_recipes` | model | `src/modules/genetics/services/database.py` |
| db_model | `propagation_events` | model | `src/modules/genetics/services/database.py` |
| class | `AccessionService` | service | `src/modules/genetics/services/accession/accession_service.py` |
| class | `DashboardService` | service | `src/modules/genetics/services/dashboard_service.py` |
| class | `GeneticsDatabaseManager` | service | `src/modules/genetics/services/database.py` |
| class | `LineService` | service | `src/modules/genetics/services/line/line_service.py` |
| class | `LineageService` | service | `src/modules/genetics/services/lineage/lineage_service.py` |
| class | `MaintenanceService` | service | `src/modules/genetics/services/maintenance/maintenance_service.py` |
| class | `MediumService` | service | `src/modules/genetics/services/medium/medium_service.py` |
| class | `ObservationService` | service | `src/modules/genetics/services/observation/observation_service.py` |
| class | `PropagationService` | service | `src/modules/genetics/services/propagation/propagation_service.py` |
| function | `genetics service helpers` | service | `src/modules/genetics/services/common.py` |
| function | `resolve_vessel` | service | `src/modules/genetics/services/accession/vessel_resolver.py` |

### `hr` (32 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /hr/contracts` | api | `src/modules/hr/api/v1/contracts.py` |
| api_endpoint | `CRUD /hr/employees` | api | `src/modules/hr/api/v1/employees.py` |
| api_endpoint | `CRUD /hr/insurance` | api | `src/modules/hr/api/v1/insurance.py` |
| api_endpoint | `CRUD /hr/performance` | api | `src/modules/hr/api/v1/performance.py` |
| api_endpoint | `CRUD /hr/visas` | api | `src/modules/hr/api/v1/visas.py` |
| api_endpoint | `GET /hr/dashboard` | api | `src/modules/hr/api/v1/dashboard.py` |
| component | `ContractTab` | frontend | `frontend/user-portal/src/components/hr/ContractTab.tsx` |
| component | `EmployeeCard` | frontend | `frontend/user-portal/src/components/hr/EmployeeCard.tsx` |
| component | `EmployeeDetailPage` | frontend | `frontend/user-portal/src/pages/hr/EmployeeDetailPage.tsx` |
| component | `EmployeeForm` | frontend | `frontend/user-portal/src/components/hr/EmployeeForm.tsx` |
| component | `EmployeeListPage` | frontend | `frontend/user-portal/src/pages/hr/EmployeeListPage.tsx` |
| component | `EmployeeTable` | frontend | `frontend/user-portal/src/components/hr/EmployeeTable.tsx` |
| component | `HRDashboardPage` | frontend | `frontend/user-portal/src/pages/hr/HRDashboardPage.tsx` |
| component | `InsuranceTab` | frontend | `frontend/user-portal/src/components/hr/InsuranceTab.tsx` |
| component | `PerformanceTab` | frontend | `frontend/user-portal/src/components/hr/PerformanceTab.tsx` |
| component | `VisaTab` | frontend | `frontend/user-portal/src/components/hr/VisaTab.tsx` |
| type | `hr types` | frontend | `frontend/user-portal/src/types/hr.ts` |
| function | `hrService` | frontend | `frontend/user-portal/src/services/hrService.ts` |
| class | `HRDatabaseManager` | infrastructure | `src/modules/hr/services/database.py` |
| pydantic_model | `Contract` | model | `src/modules/hr/models/contract.py` |
| pydantic_model | `Employee` | model | `src/modules/hr/models/employee.py` |
| db_model | `employee_contracts` | model | `src/modules/hr/services/employee/contract_repository.py` |
| db_model | `employee_insurance` | model | `src/modules/hr/services/employee/insurance_repository.py` |
| db_model | `employee_performance` | model | `src/modules/hr/services/employee/performance_repository.py` |
| db_model | `employee_visas` | model | `src/modules/hr/services/employee/visa_repository.py` |
| db_model | `employees` | model | `src/modules/hr/services/employee/employee_repository.py` |
| class | `EmployeeRepository` | repository | `src/modules/hr/services/employee/employee_repository.py` |
| class | `ContractService` | service | `src/modules/hr/services/employee/contract_service.py` |
| class | `EmployeeService` | service | `src/modules/hr/services/employee/employee_service.py` |
| class | `InsuranceService` | service | `src/modules/hr/services/employee/insurance_service.py` |
| class | `PerformanceService` | service | `src/modules/hr/services/employee/performance_service.py` |
| class | `VisaService` | service | `src/modules/hr/services/employee/visa_service.py` |

### `inventory` (7 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AssetInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/AssetInventoryList.tsx` |
| component | `HarvestInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/HarvestInventoryList.tsx` |
| component | `InputInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/InputInventoryList.tsx` |
| component | `InventoryDashboard` | frontend | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx` |
| component | `ReturnedInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/ReturnedInventoryList.tsx` |
| component | `WasteInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/WasteInventoryList.tsx` |
| type | `inventory types` | frontend | `frontend/user-portal/src/types/inventory.ts` |

### `logistics` (27 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /logistics/routes` | api | `src/modules/logistics/api/v1/routes.py` |
| api_endpoint | `CRUD /logistics/shipments` | api | `src/modules/logistics/api/v1/shipments.py` |
| api_endpoint | `CRUD /logistics/vehicles` | api | `src/modules/logistics/api/v1/vehicles.py` |
| api_endpoint | `GET /logistics/dashboard` | api | `src/modules/logistics/api/v1/dashboard.py` |
| component | `LogisticsDashboardPage` | frontend | `frontend/user-portal/src/pages/logistics/LogisticsDashboardPage.tsx` |
| component | `RouteForm` | frontend | `frontend/user-portal/src/components/logistics/RouteForm.tsx` |
| component | `RouteManagementPage` | frontend | `frontend/user-portal/src/pages/logistics/RouteManagementPage.tsx` |
| component | `RouteTable` | frontend | `frontend/user-portal/src/components/logistics/RouteTable.tsx` |
| component | `ShipmentCard` | frontend | `frontend/user-portal/src/components/logistics/ShipmentCard.tsx` |
| component | `ShipmentForm` | frontend | `frontend/user-portal/src/components/logistics/ShipmentForm.tsx` |
| component | `ShipmentTable` | frontend | `frontend/user-portal/src/components/logistics/ShipmentTable.tsx` |
| component | `ShipmentTrackingPage` | frontend | `frontend/user-portal/src/pages/logistics/ShipmentTrackingPage.tsx` |
| component | `VehicleCard` | frontend | `frontend/user-portal/src/components/logistics/VehicleCard.tsx` |
| component | `VehicleForm` | frontend | `frontend/user-portal/src/components/logistics/VehicleForm.tsx` |
| component | `VehicleManagementPage` | frontend | `frontend/user-portal/src/pages/logistics/VehicleManagementPage.tsx` |
| component | `VehicleTable` | frontend | `frontend/user-portal/src/components/logistics/VehicleTable.tsx` |
| type | `logistics types` | frontend | `frontend/user-portal/src/types/logistics.ts` |
| function | `logisticsService` | frontend | `frontend/user-portal/src/services/logisticsService.ts` |
| class | `LogisticsDatabaseManager` | infrastructure | `src/modules/logistics/services/database.py` |
| pydantic_model | `Shipment` | model | `src/modules/logistics/models/shipment.py` |
| db_model | `routes` | model | `src/modules/logistics/services/logistics/route_repository.py` |
| db_model | `shipments` | model | `src/modules/logistics/services/logistics/shipment_repository.py` |
| db_model | `vehicles` | model | `src/modules/logistics/services/logistics/vehicle_repository.py` |
| class | `ShipmentRepository` | repository | `src/modules/logistics/services/logistics/shipment_repository.py` |
| class | `RouteService` | service | `src/modules/logistics/services/logistics/route_service.py` |
| class | `ShipmentService` | service | `src/modules/logistics/services/logistics/shipment_service.py` |
| class | `VehicleService` | service | `src/modules/logistics/services/logistics/vehicle_service.py` |

### `map` (1 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| hook | `useMapDrawing` | frontend | `frontend/user-portal/src/hooks/map/useMapDrawing.ts` |

### `marketing` (31 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /marketing/budgets` | api | `src/modules/marketing/api/v1/budgets.py` |
| api_endpoint | `CRUD /marketing/campaigns` | api | `src/modules/marketing/api/v1/campaigns.py` |
| api_endpoint | `CRUD /marketing/channels` | api | `src/modules/marketing/api/v1/channels.py` |
| api_endpoint | `CRUD /marketing/events` | api | `src/modules/marketing/api/v1/events.py` |
| api_endpoint | `GET /marketing/dashboard` | api | `src/modules/marketing/api/v1/dashboard.py` |
| component | `BudgetForm` | frontend | `frontend/user-portal/src/components/marketing/BudgetForm.tsx` |
| component | `BudgetManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/BudgetManagementPage.tsx` |
| component | `BudgetTable` | frontend | `frontend/user-portal/src/components/marketing/BudgetTable.tsx` |
| component | `CampaignCard` | frontend | `frontend/user-portal/src/components/marketing/CampaignCard.tsx` |
| component | `CampaignForm` | frontend | `frontend/user-portal/src/components/marketing/CampaignForm.tsx` |
| component | `CampaignManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/CampaignManagementPage.tsx` |
| component | `CampaignTable` | frontend | `frontend/user-portal/src/components/marketing/CampaignTable.tsx` |
| component | `ChannelForm` | frontend | `frontend/user-portal/src/components/marketing/ChannelForm.tsx` |
| component | `ChannelManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/ChannelManagementPage.tsx` |
| component | `ChannelTable` | frontend | `frontend/user-portal/src/components/marketing/ChannelTable.tsx` |
| component | `EventForm` | frontend | `frontend/user-portal/src/components/marketing/EventForm.tsx` |
| component | `EventManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/EventManagementPage.tsx` |
| component | `EventTable` | frontend | `frontend/user-portal/src/components/marketing/EventTable.tsx` |
| component | `MarketingDashboardPage` | frontend | `frontend/user-portal/src/pages/marketing/MarketingDashboardPage.tsx` |
| type | `marketing types` | frontend | `frontend/user-portal/src/types/marketing.ts` |
| function | `marketingService` | frontend | `frontend/user-portal/src/services/marketingService.ts` |
| class | `MarketingDatabaseManager` | infrastructure | `src/modules/marketing/services/database.py` |
| pydantic_model | `Campaign` | model | `src/modules/marketing/models/campaign.py` |
| db_model | `marketing_budgets` | model | `src/modules/marketing/services/marketing/budget_repository.py` |
| db_model | `marketing_campaigns` | model | `src/modules/marketing/services/marketing/campaign_repository.py` |
| db_model | `marketing_channels` | model | `src/modules/marketing/services/marketing/channel_repository.py` |
| db_model | `marketing_events` | model | `src/modules/marketing/services/marketing/event_repository.py` |
| class | `BudgetService` | service | `src/modules/marketing/services/marketing/budget_service.py` |
| class | `CampaignService` | service | `src/modules/marketing/services/marketing/campaign_service.py` |
| class | `ChannelService` | service | `src/modules/marketing/services/marketing/channel_service.py` |
| class | `EventService` | service | `src/modules/marketing/services/marketing/event_service.py` |

### `mushroom` (22 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `BiologicalEfficiencyGauge` | frontend | `frontend/user-portal/src/components/mushroom/BiologicalEfficiencyGauge.tsx` |
| component | `DeleteRoomDialog` | frontend | `frontend/user-portal/src/components/mushroom/DeleteRoomDialog.tsx` |
| component | `FacilityCard` | frontend | `frontend/user-portal/src/components/mushroom/FacilityCard.tsx` |
| component | `GrowingRoomCard` | frontend | `frontend/user-portal/src/components/mushroom/GrowingRoomCard.tsx` |
| component | `GrowingRoomGrid` | frontend | `frontend/user-portal/src/components/mushroom/GrowingRoomGrid.tsx` |
| component | `HarvestEntryModal` | frontend | `frontend/user-portal/src/components/mushroom/HarvestEntryModal.tsx` |
| component | `MushroomDashboardPage` | frontend | `frontend/user-portal/src/pages/mushroom/MushroomDashboardPage.tsx` |
| component | `MushroomFacilityManager` | frontend | `frontend/user-portal/src/pages/mushroom/MushroomFacilityManager.tsx` |
| function | `MushroomPhaseTheme` | frontend | `frontend/user-portal/src/components/mushroom/phaseTheme.ts` |
| component | `MushroomRoomMonitor` | frontend | `frontend/user-portal/src/pages/mushroom/MushroomRoomMonitor.tsx` |
| component | `MushroomStrainLibrary` | frontend | `frontend/user-portal/src/pages/mushroom/MushroomStrainLibrary.tsx` |
| component | `RoomDetailsModal` | frontend | `frontend/user-portal/src/components/mushroom/RoomDetailsModal.tsx` |
| component | `StrainCard` | frontend | `frontend/user-portal/src/components/mushroom/StrainCard.tsx` |
| type | `mushroom types` | frontend | `frontend/user-portal/src/types/mushroom.ts` |
| hook | `useContamination` | frontend | `frontend/user-portal/src/hooks/mushroom/useContamination.ts` |
| hook | `useFacilityData` | frontend | `frontend/user-portal/src/hooks/mushroom/useFacilityData.ts` |
| hook | `useMushroomDashboard` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomDashboard.ts` |
| hook | `useMushroomHarvests` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomHarvests.ts` |
| hook | `useMushroomStrains` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomStrains.ts` |
| hook | `useRoomData` | frontend | `frontend/user-portal/src/hooks/mushroom/useRoomData.ts` |
| hook | `useRoomEnvironment` | frontend | `frontend/user-portal/src/hooks/mushroom/useRoomEnvironment.ts` |
| hook | `useSubstrateBatches` | frontend | `frontend/user-portal/src/hooks/mushroom/useSubstrateBatches.ts` |

### `operations` (6 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `BlockTaskList` | frontend | `frontend/user-portal/src/pages/operations/BlockTaskList.tsx` |
| component | `FarmBlocksView` | frontend | `frontend/user-portal/src/pages/operations/FarmBlocksView.tsx` |
| component | `HarvestEntryModal` | frontend | `frontend/user-portal/src/components/operations/HarvestEntryModal.tsx` |
| component | `OperationsDashboard` | frontend | `frontend/user-portal/src/pages/operations/OperationsDashboard.tsx` |
| component | `ReportAlertModal` | frontend | `frontend/user-portal/src/components/operations/ReportAlertModal.tsx` |
| component | `TaskCompletionModal` | frontend | `frontend/user-portal/src/components/operations/TaskCompletionModal.tsx` |

### `platform` (1 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| type | `capabilities types` | frontend | `frontend/user-portal/src/types/capabilities.ts` |

### `pnl` (8 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `PnLPage` | frontend | `frontend/user-portal/src/pages/pnl/PnLPage.tsx` |
| component | `PnlArAging` | frontend | `frontend/user-portal/src/components/pnl/PnlArAging.tsx` |
| component | `PnlBreakdownCharts` | frontend | `frontend/user-portal/src/components/pnl/PnlBreakdownCharts.tsx` |
| component | `PnlFiltersBar` | frontend | `frontend/user-portal/src/components/pnl/PnlFiltersBar.tsx` |
| component | `PnlKpiCards` | frontend | `frontend/user-portal/src/components/pnl/PnlKpiCards.tsx` |
| component | `PnlRevenueConfidence` | frontend | `frontend/user-portal/src/components/pnl/PnlRevenueConfidence.tsx` |
| component | `PnlRevenueTrendChart` | frontend | `frontend/user-portal/src/components/pnl/PnlRevenueTrendChart.tsx` |
| component | `PnlStatementTable` | frontend | `frontend/user-portal/src/components/pnl/PnlStatementTable.tsx` |

### `protocols` (9 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| function | `ProtocolCategoryIcons` | frontend | `frontend/user-portal/src/components/protocols/categoryIcons.ts` |
| component | `ProtocolFormModal` | frontend | `frontend/user-portal/src/components/protocols/ProtocolFormModal.tsx` |
| component | `ProtocolPicker` | frontend | `frontend/user-portal/src/components/protocols/ProtocolPicker.tsx` |
| function | `ProtocolStatusPhase` | frontend | `frontend/user-portal/src/components/protocols/statusPhase.ts` |
| component | `ProtocolViewModal` | frontend | `frontend/user-portal/src/components/protocols/ProtocolViewModal.tsx` |
| component | `ProtocolsPage` | frontend | `frontend/user-portal/src/pages/protocols/ProtocolsPage.tsx` |
| type | `protocols types` | frontend | `frontend/user-portal/src/types/protocols.ts` |
| function | `protocolsApi` | frontend | `frontend/user-portal/src/services/protocolsApi.ts` |
| hook | `useProtocols` | frontend | `frontend/user-portal/src/hooks/protocols/useProtocols.ts` |

### `purchasing` (26 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `APInvoiceDetailPage` | frontend | `frontend/user-portal/src/pages/purchasing/APInvoiceDetailPage.tsx` |
| component | `APInvoiceFormPage` | frontend | `frontend/user-portal/src/pages/purchasing/APInvoiceFormPage.tsx` |
| component | `APInvoicesPage` | frontend | `frontend/user-portal/src/pages/purchasing/APInvoicesPage.tsx` |
| component | `ApprovalInboxPage` | frontend | `frontend/user-portal/src/pages/purchasing/ApprovalInboxPage.tsx` |
| component | `GoodsReceiptDetailPage` | frontend | `frontend/user-portal/src/pages/purchasing/GoodsReceiptDetailPage.tsx` |
| component | `GoodsReceiptFormPage` | frontend | `frontend/user-portal/src/pages/purchasing/GoodsReceiptFormPage.tsx` |
| component | `GoodsReceiptsPage` | frontend | `frontend/user-portal/src/pages/purchasing/GoodsReceiptsPage.tsx` |
| component | `PaymentTermsPage` | frontend | `frontend/user-portal/src/pages/purchasing/PaymentTermsPage.tsx` |
| component | `PurchaseItemsPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseItemsPage.tsx` |
| component | `PurchaseOrderDetailPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseOrderDetailPage.tsx` |
| component | `PurchaseOrderFormPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseOrderFormPage.tsx` |
| component | `PurchaseOrdersPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseOrdersPage.tsx` |
| component | `PurchaseRequestDetailPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseRequestDetailPage.tsx` |
| component | `PurchaseRequestFormPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseRequestFormPage.tsx` |
| component | `PurchaseRequestsPage` | frontend | `frontend/user-portal/src/pages/purchasing/PurchaseRequestsPage.tsx` |
| function | `PurchasingStatusPhase` | frontend | `frontend/user-portal/src/pages/purchasing/statusPhase.ts` |
| component | `VendorsPage` | frontend | `frontend/user-portal/src/pages/purchasing/VendorsPage.tsx` |
| function | `apInvoicesService` | frontend | `frontend/user-portal/src/services/apInvoicesService.ts` |
| function | `attachmentsService` | frontend | `frontend/user-portal/src/services/attachmentsService.ts` |
| function | `goodsReceiptsService` | frontend | `frontend/user-portal/src/services/goodsReceiptsService.ts` |
| function | `purchasingApi` | frontend | `frontend/user-portal/src/services/purchasingApi.ts` |
| hook | `useAPInvoices` | frontend | `frontend/user-portal/src/hooks/queries/useAPInvoices.ts` |
| hook | `useAttachments` | frontend | `frontend/user-portal/src/hooks/queries/useAttachments.ts` |
| hook | `useGoodsReceipts` | frontend | `frontend/user-portal/src/hooks/queries/useGoodsReceipts.ts` |
| hook | `useIncomingDocs` | frontend | `frontend/user-portal/src/hooks/queries/useIncomingDocs.ts` |
| hook | `usePurchasing` | frontend | `frontend/user-portal/src/hooks/queries/usePurchasing.ts` |

### `sales` (100 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /sales (config)` | api | `src/modules/sales/api/v1/config.py` |
| api_endpoint | `CRUD /sales/ar-credit-notes` | api | `src/modules/sales/api/v1/ar_credit_notes.py` |
| api_endpoint | `CRUD /sales/ar-invoices` | api | `src/modules/sales/api/v1/ar_invoices.py` |
| api_endpoint | `CRUD /sales/customer-receipts` | api | `src/modules/sales/api/v1/customer_receipts.py` |
| api_endpoint | `CRUD /sales/dashboard` | api | `src/modules/sales/api/v1/dashboard.py` |
| api_endpoint | `CRUD /sales/deliveries` | api | `src/modules/sales/api/v1/deliveries.py` |
| api_endpoint | `CRUD /sales/orders (legacy)` | api | `src/modules/sales/api/v1/orders.py` |
| api_endpoint | `CRUD /sales/orders-v2` | api | `src/modules/sales/api/v1/sales_orders.py` |
| api_endpoint | `CRUD /sales/quotes` | api | `src/modules/sales/api/v1/quotes.py` |
| api_endpoint | `CRUD /sales/return-requests` | api | `src/modules/sales/api/v1/return_requests.py` |
| api_endpoint | `CRUD /sales/returns (legacy)` | api | `src/modules/sales/api/v1/returns.py` |
| api_endpoint | `CRUD /sales/returns-v2` | api | `src/modules/sales/api/v1/returns_v2.py` |
| component | `ARAgingReportPage` | frontend | `frontend/user-portal/src/pages/sales/ARAgingReportPage.tsx` |
| component | `ARInvoiceDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ARInvoiceDetailPage.tsx` |
| component | `ARInvoiceFormPage` | frontend | `frontend/user-portal/src/pages/sales/ARInvoiceFormPage.tsx` |
| component | `ARInvoicesPage` | frontend | `frontend/user-portal/src/pages/sales/ARInvoicesPage.tsx` |
| component | `AddOrderItemModal` | frontend | `frontend/user-portal/src/components/sales/AddOrderItemModal.tsx` |
| component | `ArCreditNoteDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNoteDetailPage.tsx` |
| component | `ArCreditNoteFormPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNoteFormPage.tsx` |
| component | `ArCreditNotesPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNotesPage.tsx` |
| component | `CompanyCombobox` | frontend | `frontend/user-portal/src/components/sales/CompanyCombobox.tsx` |
| component | `CurrencyCombobox` | frontend | `frontend/user-portal/src/components/sales/CurrencyCombobox.tsx` |
| component | `CustomerCombobox` | frontend | `frontend/user-portal/src/components/sales/CustomerCombobox.tsx` |
| component | `CustomerReceiptDetailPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptDetailPage.tsx` |
| component | `CustomerReceiptFormPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptFormPage.tsx` |
| component | `CustomerReceiptsPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptsPage.tsx` |
| component | `DeleteOrderConfirmModal` | frontend | `frontend/user-portal/src/components/sales/DeleteOrderConfirmModal.tsx` |
| component | `DeliveriesPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveriesPage.tsx` |
| component | `DeliveryDetailPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveryDetailPage.tsx` |
| component | `DeliveryFormPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveryFormPage.tsx` |
| component | `OrderCard` | frontend | `frontend/user-portal/src/components/sales/OrderCard.tsx` |
| component | `OrderForm` | frontend | `frontend/user-portal/src/components/sales/OrderForm.tsx` |
| component | `OrderTable` | frontend | `frontend/user-portal/src/components/sales/OrderTable.tsx` |
| component | `PaymentTermsCombobox` | frontend | `frontend/user-portal/src/components/sales/PaymentTermsCombobox.tsx` |
| component | `QuickServiceChargeModal` | frontend | `frontend/user-portal/src/components/sales/QuickServiceChargeModal.tsx` |
| component | `QuoteDetailPage` | frontend | `frontend/user-portal/src/pages/sales/QuoteDetailPage.tsx` |
| component | `QuoteFormPage` | frontend | `frontend/user-portal/src/pages/sales/QuoteFormPage.tsx` |
| component | `QuotesPage` | frontend | `frontend/user-portal/src/pages/sales/QuotesPage.tsx` |
| component | `ReportReturnModal` | frontend | `frontend/user-portal/src/components/sales/ReportReturnModal.tsx` |
| component | `ReturnDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnDetailPage.tsx` |
| component | `ReturnFormPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnFormPage.tsx` |
| component | `ReturnRequestDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestDetailPage.tsx` |
| component | `ReturnRequestFormPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestFormPage.tsx` |
| component | `ReturnRequestsPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestsPage.tsx` |
| component | `ReturnsPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnsPage.tsx` |
| component | `ReturnsV2Page` | frontend | `frontend/user-portal/src/pages/sales/ReturnsV2Page.tsx` |
| component | `SalesActionTiles` | frontend | `frontend/user-portal/src/components/sales/SalesActionTiles.tsx` |
| component | `SalesAuditHistoryModal` | frontend | `frontend/user-portal/src/components/sales/SalesAuditHistoryModal.tsx` |
| component | `SalesDashboardPage` | frontend | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx` |
| component | `SalesItemCombobox` | frontend | `frontend/user-portal/src/components/sales/SalesItemCombobox.tsx` |
| component | `SalesItemsPage` | frontend | `frontend/user-portal/src/pages/sales/SalesItemsPage.tsx` |
| component | `SalesOrderDetailPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrderDetailPage.tsx` |
| component | `SalesOrderFormPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrderFormPage.tsx` |
| component | `SalesOrdersPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrdersPage.tsx` |
| component | `SalesOrdersV2Page` | frontend | `frontend/user-portal/src/pages/sales/SalesOrdersV2Page.tsx` |
| function | `SalesStatusPhase` | frontend | `frontend/user-portal/src/components/sales/statusPhase.ts` |
| component | `StockPage` | frontend | `frontend/user-portal/src/pages/sales/StockPage.tsx` |
| type | `returns types` | frontend | `frontend/user-portal/src/types/returns.ts` |
| type | `sales types` | frontend | `frontend/user-portal/src/types/sales.ts` |
| function | `salesApi` | frontend | `frontend/user-portal/src/services/salesApi.ts` |
| function | `salesService` | frontend | `frontend/user-portal/src/services/salesService.ts` |
| hook | `useArAging` | frontend | `frontend/user-portal/src/hooks/queries/useArAging.ts` |
| hook | `useArCreditNotes` | frontend | `frontend/user-portal/src/hooks/queries/useArCreditNotes.ts` |
| hook | `useArInvoices` | frontend | `frontend/user-portal/src/hooks/queries/useArInvoices.ts` |
| hook | `useCustomerReceipts` | frontend | `frontend/user-portal/src/hooks/queries/useCustomerReceipts.ts` |
| hook | `useDeliveries` | frontend | `frontend/user-portal/src/hooks/queries/useDeliveries.ts` |
| hook | `useQuotes` | frontend | `frontend/user-portal/src/hooks/queries/useQuotes.ts` |
| hook | `useReturnRequests` | frontend | `frontend/user-portal/src/hooks/queries/useReturnRequests.ts` |
| hook | `useReturns` | frontend | `frontend/user-portal/src/hooks/queries/useReturns.ts` |
| hook | `useSaleItemFinanceExt` | frontend | `frontend/user-portal/src/hooks/queries/useSaleItemFinanceExt.ts` |
| hook | `useSales` | frontend | `frontend/user-portal/src/hooks/queries/useSales.ts` |
| hook | `useSalesAudit` | frontend | `frontend/user-portal/src/hooks/queries/useSalesAudit.ts` |
| hook | `useSalesOrders` | frontend | `frontend/user-portal/src/hooks/queries/useSalesOrders.ts` |
| hook | `useTenantBaseCurrency` | frontend | `frontend/user-portal/src/hooks/queries/useTenantBaseCurrency.ts` |
| class | `CurrentUser + JWT deps` | middleware | `src/modules/sales/middleware/auth.py` |
| pydantic_model | `AR Credit Note models` | model | `src/modules/sales/models/ar_credit_notes.py` |
| pydantic_model | `AR Invoice models` | model | `src/modules/sales/models/ar_invoices.py` |
| pydantic_model | `Customer Receipt models` | model | `src/modules/sales/models/customer_receipts.py` |
| pydantic_model | `Delivery Note models` | model | `src/modules/sales/models/deliveries.py` |
| pydantic_model | `Purchase Order (legacy stub)` | model | `src/modules/sales/models/purchase_order.py` |
| pydantic_model | `Quote models` | model | `src/modules/sales/models/quotes.py` |
| pydantic_model | `Return Note v2 models` | model | `src/modules/sales/models/returns.py` |
| pydantic_model | `Return Order (legacy) models` | model | `src/modules/sales/models/return_order.py` |
| pydantic_model | `Return Request models` | model | `src/modules/sales/models/return_requests.py` |
| pydantic_model | `Sales Order (legacy) models` | model | `src/modules/sales/models/sales_order.py` |
| pydantic_model | `Sales Order v2 models` | model | `src/modules/sales/models/sales_orders.py` |
| class | `ARCreditNoteService` | service | `src/modules/sales/services/ar_credit_note_service.py` |
| class | `ARInvoiceService` | service | `src/modules/sales/services/ar_invoice_service.py` |
| class | `CustomerReceiptService` | service | `src/modules/sales/services/customer_receipt_service.py` |
| class | `DeliveryService` | service | `src/modules/sales/services/delivery_service.py` |
| class | `OrderRepository (legacy)` | service | `src/modules/sales/services/sales/order_repository.py` |
| class | `OrderService (legacy)` | service | `src/modules/sales/services/sales/order_service.py` |
| class | `PurchaseOrderRepository (legacy stub)` | service | `src/modules/sales/services/sales/purchase_order_repository.py` |
| class | `PurchaseOrderService (legacy stub)` | service | `src/modules/sales/services/sales/purchase_order_service.py` |
| class | `QuoteService` | service | `src/modules/sales/services/quote_service.py` |
| class | `RTNService` | service | `src/modules/sales/services/rtn_service.py` |
| class | `ReturnRequestService` | service | `src/modules/sales/services/return_request_service.py` |
| class | `ReturnService (legacy)` | service | `src/modules/sales/services/sales/return_service.py` |
| class | `SalesDatabaseManager` | service | `src/modules/sales/services/database.py` |
| class | `SalesOrderService` | service | `src/modules/sales/services/sales_order_service.py` |

### `settings` (4 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `DeploymentSettingsCard` | frontend | `frontend/user-portal/src/components/settings/DeploymentSettingsCard.tsx` |
| component | `ModulesSettingsCard` | frontend | `frontend/user-portal/src/components/settings/ModulesSettingsCard.tsx` |
| component | `Settings` | frontend | `frontend/user-portal/src/pages/settings/Settings.tsx` |
| component | `TelegramBotSettings` | frontend | `frontend/user-portal/src/components/settings/TelegramBotSettings.tsx` |

### `shared` (20 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| file | `App` | frontend | `frontend/user-portal/src/App.tsx` |
| component | `AttachmentList` | frontend | `frontend/user-portal/src/components/attachments/AttachmentList.tsx` |
| component | `AutoNameBanner` | frontend | `frontend/user-portal/src/components/common/AutoNameBanner.tsx` |
| component | `DivisionSelector` | frontend | `frontend/user-portal/src/pages/division/DivisionSelector.tsx` |
| component | `DivisionSwitcher` | frontend | `frontend/user-portal/src/components/layout/DivisionSwitcher.tsx` |
| component | `DrawingControls` | frontend | `frontend/user-portal/src/components/map/DrawingControls.tsx` |
| component | `HelpButton` | frontend | `frontend/user-portal/src/components/tutorials/HelpButton.tsx` |
| component | `MainLayout` | frontend | `frontend/user-portal/src/components/layout/MainLayout.tsx` |
| component | `MapContainer` | frontend | `frontend/user-portal/src/components/map/MapContainer.tsx` |
| component | `MapSearchBar` | frontend | `frontend/user-portal/src/components/map/MapSearchBar.tsx` |
| component | `NotFound` | frontend | `frontend/user-portal/src/pages/NotFound.tsx` |
| component | `Profile` | frontend | `frontend/user-portal/src/pages/profile/Profile.tsx` |
| component | `ProtectedRoute` | frontend | `frontend/user-portal/src/components/common/ProtectedRoute.tsx` |
| component | `ToastContainer` | frontend | `frontend/user-portal/src/components/common/ToastContainer.tsx` |
| component | `UnsavedChangesDialog` | frontend | `frontend/user-portal/src/components/common/UnsavedChangesDialog.tsx` |
| file | `react-query.config` | frontend | `frontend/user-portal/src/config/react-query.config.ts` |
| type | `shared types barrel` | frontend | `frontend/shared/src/types/index.ts` |
| type | `shared widget types` | frontend | `frontend/shared/src/types/widget.types.ts` |
| hook | `useFullscreen` | frontend | `frontend/user-portal/src/hooks/useFullscreen.ts` |
| hook | `useTutorial` | frontend | `frontend/user-portal/src/hooks/tutorials/useTutorial.ts` |

### `system` (4 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| function | `auditLogService` | frontend | `frontend/user-portal/src/services/auditLogService.ts` |
| function | `systemService` | frontend | `frontend/user-portal/src/services/systemService.ts` |
| hook | `useAuditLog` | frontend | `frontend/user-portal/src/hooks/queries/useAuditLog.ts` |
| hook | `useCapabilities` | frontend | `frontend/user-portal/src/hooks/useCapabilities.ts` |

### `tenant` (3 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| function | `tenantBootstrapService` | frontend | `frontend/user-portal/src/services/tenantBootstrapService.ts` |
| store | `useDivisionStore` | frontend | `frontend/user-portal/src/stores/division.store.ts` |
| hook | `useOrganizations` | frontend | `frontend/user-portal/src/hooks/queries/useOrganizations.ts` |

### `tools` (5 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `ChemicalsCatalog` | frontend | `frontend/user-portal/src/pages/tools/ChemicalsCatalog.tsx` |
| component | `FertilizerCostCalculator` | frontend | `frontend/user-portal/src/pages/tools/FertilizerCostCalculator.tsx` |
| type | `tools types` | frontend | `frontend/user-portal/src/types/tools.ts` |
| function | `toolsApi` | frontend | `frontend/user-portal/src/services/toolsApi.ts` |
| hook | `useTools` | frontend | `frontend/user-portal/src/hooks/queries/useTools.ts` |

## Cross-Module Dependencies

| Source Module | Edge | Target Module |
|---------------|------|---------------|
| `core.middleware.permissions` | depends_on | `core.middleware.auth` |
| `core.middleware.rate_limit` | depends_on | `core.config.Settings` |
| `sales.service.sales_order_service` | depends_on | `finance.api.customer_ext` |
| `sales.service.ar_invoice_service` | depends_on | `finance.api.customer_ext` |
| `sales.service.ar_invoice_service` | depends_on | `finance.api.item_ext` |
| `sales.service.legacy.order_service` | depends_on | `farm_manager.service.database` |
| `sales.service.legacy.return_service` | depends_on | `farm_manager.service.database` |
| `sales.api.config` | depends_on | `farm_manager.service.farming_year_service` |
| `sales.api.dashboard` | depends_on | `farm_manager.service.database` |
| `genetics.service.propagation_service` | depends_on | `genetics.service.accession_service` |
| `genetics.service.propagation_service` | depends_on | `genetics.service.line_service` |
| `genetics.service.propagation_service` | depends_on | `genetics.model.enums` |
| `genetics.service.accession_service` | depends_on | `genetics.service.line_service` |
| `genetics.service.observation_service` | depends_on | `genetics.service.line_service` |
| `genetics.service.observation_service` | depends_on | `genetics.service.accession_service` |
| `genetics.service.lineage_service` | depends_on | `genetics.service.propagation_service` |
| `genetics.service.lineage_service` | depends_on | `genetics.service.medium_service` |
| `genetics.register` | depends_on | `core.middleware.auth` |
| `genetics.middleware.auth` | depends_on | `core.middleware.auth` |
| `genetics.api.accessions` | depends_on | `genetics.api.public` |
| `genetics.api.accessions` | depends_on | `genetics.service.vessel_resolver` |
| `genetics.api.public` | depends_on | `genetics.service.vessel_resolver` |
| `genetics.api.public` | depends_on | `genetics.service.accession_service` |
| `genetics.api.public` | depends_on | `genetics.service.line_service` |
| `genetics.api.public` | depends_on | `core.model.organization` |
| `genetics.api.public` | depends_on | `core.middleware.auth` |
| `core.api.organizations` | depends_on | `core.model.organization` |
| `core.api.main` | depends_on | `core.middleware.rate_limit` |
| `core.api.main` | depends_on | `core.middleware.timing` |
| `core.api.main` | depends_on | `core.middleware.division_context` |
| `core.api.main` | depends_on | `core.service.database` |
| `core.api.main` | depends_on | `core.cache.redis_cache` |
| `core.api.main` | depends_on | `core.service.port_manager` |
| `core.api.main` | depends_on | `core.service.module_manager` |
| `core.api.main` | depends_on | `core.infrastructure.plugin_system` |
| `core.api.main` | depends_on | `core.infrastructure.logging_config` |
| `core.api.main` | depends_on | `core.model.user` |
| `core.api.health` | depends_on | `core.cache.redis_cache` |
| `core.api.health` | depends_on | `core.middleware.timing` |
| `core.api.auth` | depends_on | `core.service.auth_service` |
| `core.api.auth` | depends_on | `core.service.user_service` |
| `core.api.auth` | depends_on | `core.service.mfa_service` |
| `core.api.auth` | depends_on | `core.service.cf_access_service` |
| `core.api.auth` | depends_on | `core.service.deployment_settings_service` |
| `core.api.auth` | depends_on | `core.middleware.auth` |
| `core.api.auth` | depends_on | `core.middleware.rate_limit` |
| `core.api.auth` | depends_on | `core.middleware.cf_access` |
| `core.api.auth` | depends_on | `core.model.user` |
| `core.api.auth` | depends_on | `core.model.mfa` |
| `core.api.admin` | depends_on | `core.model.deployment_settings` |
| `core.api.admin` | depends_on | `core.model.user` |
| `core.api.admin` | depends_on | `core.service.deployment_settings_service` |
| `core.api.admin` | depends_on | `core.service.database` |
| `core.api.admin` | depends_on | `core.service.user_service` |
| `core.api.admin` | depends_on | `core.middleware.auth` |
| `core.api.admin` | depends_on | `core.middleware.permissions` |
| `core.api.users` | depends_on | `core.model.user` |
| `core.api.users` | depends_on | `core.service.user_service` |
| `core.api.users` | depends_on | `core.middleware.auth` |
| `core.api.users` | depends_on | `core.middleware.permissions` |
| `core.api.users` | depends_on | `core.service.database` |
| `core.api.dashboard` | depends_on | `core.model.dashboard` |
| `core.api.dashboard` | depends_on | `core.model.user` |
| `core.api.dashboard` | depends_on | `core.service.dashboard_service` |
| `core.api.dashboard` | depends_on | `core.middleware.auth` |
| `core.api.dashboard` | depends_on | `core.service.database` |
| `core.api.divisions` | depends_on | `core.model.division` |
| `core.api.divisions` | depends_on | `core.model.user` |
| `core.api.divisions` | depends_on | `core.service.division_service` |
| `core.api.divisions` | depends_on | `core.middleware.auth` |
| `core.api.industries` | depends_on | `core.model.division` |
| `core.api.industries` | depends_on | `core.model.user` |
| `core.api.industries` | depends_on | `core.middleware.auth` |
| `core.api.industries` | depends_on | `core.infrastructure.plugin_system` |
| `core.api.modules` | depends_on | `core.model.user` |
| `core.api.modules` | depends_on | `core.model.module` |
| `core.api.modules` | depends_on | `core.service.module_manager` |
| `core.api.modules` | depends_on | `core.middleware.permissions` |
| `core.api.modules` | depends_on | `core.middleware.auth` |
| `core.api.modules` | depends_on | `core.service.database` |
| `core.api.organizations` | depends_on | `core.model.division` |
| `core.api.organizations` | depends_on | `core.model.user` |
| `core.api.organizations` | depends_on | `core.middleware.auth` |
| `core.api.organizations` | depends_on | `core.service.organization_service` |
| `core.api.organizations` | depends_on | `core.service.division_service` |
| `core.api.organizations` | depends_on | `core.cache.redis_cache` |
| `core.api.organizations` | depends_on | `finance_bridge.tenant_flag` |
| `core.api.system` | depends_on | `core.model.user` |
| `core.api.system` | depends_on | `core.middleware.auth` |
| `core.api.system` | depends_on | `core.cache.redis_cache` |
| `core.api.system` | depends_on | `finance_bridge.reachability` |
| `core.api.system` | depends_on | `finance_bridge.tenant_flag` |
| `core.api.system` | depends_on | `core.service.database` |
| `core.service.auth_service` | depends_on | `core.model.user` |
| `core.service.auth_service` | depends_on | `core.service.database` |
| `core.service.auth_service` | depends_on | `core.service.cf_access_service` |
| `core.service.auth_service` | depends_on | `core.service.deployment_settings_service` |
| `core.service.auth_service` | depends_on | `core.service.mfa_service` |
| `core.service.auth_service` | depends_on | `core.middleware.rate_limit` |
| `core.service.cf_access_service` | depends_on | `core.service.deployment_settings_service` |
| `core.service.database` | depends_on | `core.config.settings` |
| `core.service.deployment_settings_service` | depends_on | `core.config.settings` |
| `core.service.deployment_settings_service` | depends_on | `core.service.database` |
| `core.service.mfa_service` | depends_on | `core.model.user` |
| `core.service.mfa_service` | depends_on | `core.service.database` |
| `core.service.mfa_service` | depends_on | `core.config.settings` |
| `core.service.user_service` | depends_on | `core.model.user` |
| `core.service.user_service` | depends_on | `core.service.database` |
| `core.service.division_service` | depends_on | `core.model.division` |
| `core.service.division_service` | depends_on | `core.service.database` |
| `core.service.organization_service` | depends_on | `core.model.organization` |
| `core.service.organization_service` | depends_on | `core.service.database` |
| `core.service.module_manager` | depends_on | `core.model.module` |
| `core.service.module_manager` | depends_on | `core.service.database` |
| `core.service.module_manager` | depends_on | `core.service.port_manager` |
| `core.service.module_manager` | depends_on | `core.service.proxy_manager` |
| `core.service.dashboard_service` | depends_on | `core.model.dashboard` |
| `core.documents.chain_reconciler` | depends_on | `core.documents.document_status` |
| `finance_bridge.outbox_writer` | depends_on | `core.cache.redis_cache` |
| `finance_bridge.outbox_writer` | depends_on | `finance_bridge.feature_flag` |
| `finance_bridge.outbox_writer` | depends_on | `finance_bridge.tenant_flag` |
| `finance_bridge.tenant_flag` | depends_on | `core.config.settings` |
| `finance_bridge.reachability` | depends_on | `core.config.settings` |
| `core.config.settings` | depends_on | `core.model.user` |
| `farm_manager.api.blocks.delete_block` | depends_on | `farm_manager.service.CascadeDeletionService` |
| `farm_manager.api.blocks.refresh_plant_data` | depends_on | `farm_manager.service.PlantDataEnhancedRepository` |
| `farm_manager.api.blocks.empty_virtual_block` | depends_on | `farm_manager.service.VirtualBlockService` |
| `farm_manager.api.blocks.preview_empty_virtual_block` | depends_on | `farm_manager.service.VirtualBlockService` |
| `farm_manager.api.blocks.get_block_children` | depends_on | `farm_manager.service.VirtualBlockService` |
| `farm_manager.api.ai_dashboard` | depends_on | `farm_manager.service.AIDashboardService` |
| `farm_manager.api.ai_hub` | depends_on | `farm_manager.service.AIHubService` |
| `farm_manager.api.ai_hub` | depends_on | `core.config.settings` |
| `farm_manager.api.global_ai_chat` | depends_on | `farm_manager.service.GlobalAIChatService` |
| `farm_manager.api.farm_level_ai_chat` | depends_on | `farm_manager.service.FarmLevelAIChatService` |
| `farm_manager.api.cameras` | depends_on | `farm_manager.service.SenseHubConnectionService` |
| `farm_manager.api.cameras` | depends_on | `farm_manager.service.SenseHubCacheQueryService` |
| `farm_manager.api.sensehub_cache` | depends_on | `farm_manager.service.SenseHubCacheQueryService` |
| `farm_manager.api.sensehub_cache` | depends_on | `farm_manager.service.SenseHubSyncService` |
| `farm_manager.api.watchdog` | depends_on | `farm_manager.service.WatchdogConfigService` |
| `farm_manager.api.watchdog` | depends_on | `farm_manager.service.TelegramService` |
| `farm_manager.api.watchdog` | depends_on | `farm_manager.service.WatchdogService` |
| `farm_manager.api.watchdog` | depends_on | `farm_manager.service.WatchdogScheduler` |
