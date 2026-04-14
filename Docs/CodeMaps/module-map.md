# Module Map

> Generated: 2026-04-14 12:39 UTC  
> Source: MongoDB `mapper_nodes` (grouped by module)

## Backend Module Architecture

A64 Core Platform is organized into modular business applications.
Each module contains API, service, and model layers.

**Related Maps:** [api-map.md](api-map.md) | [service-map.md](service-map.md) | [database-map.md](database-map.md)

## Module Overview

| Module | Nodes | Layers Present |
|--------|-------|----------------|
| `ai_analytics` | 8 | api, model, service |
| `auth` | 12 | api, frontend |
| `core` | 127 | api, config, core, middleware, model, service |
| `crm` | 10 | api, frontend, infrastructure, model, repository, service |
| `dashboard` | 7 | api, frontend |
| `farm` | 81 | frontend |
| `farm_manager` | 137 | api, config, infrastructure, model, repository, service |
| `frontend` | 31 | config, frontend |
| `hr` | 25 | api, frontend, infrastructure, model, repository, service |
| `logistics` | 19 | api, frontend, infrastructure, model, repository, service |
| `marketing` | 22 | api, frontend, infrastructure, model, service |
| `sales` | 26 | api, frontend, infrastructure, model, repository, service |
| `shared` | 15 | frontend |

## Module Details

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

### `auth` (12 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `admin router` | api | `src/api/v1/admin.py` |
| api_endpoint | `auth router` | api | `src/api/v1/auth.py` |
| api_endpoint | `users router` | api | `src/api/v1/users.py` |
| component | `BackupCodesModal` | frontend | `frontend/user-portal/src/components/auth/BackupCodesModal.tsx` |
| component | `Login` | frontend | `frontend/user-portal/src/pages/auth/Login.tsx` |
| component | `MFARouteGuards` | frontend | `frontend/user-portal/src/components/common/MFARouteGuards.tsx` |
| component | `MFASetupPage` | frontend | `frontend/user-portal/src/pages/auth/MFASetupPage.tsx` |
| component | `MFAVerifyPage` | frontend | `frontend/user-portal/src/pages/auth/MFAVerifyPage.tsx` |
| component | `Register` | frontend | `frontend/user-portal/src/pages/auth/Register.tsx` |
| function | `authService` | frontend | `frontend/user-portal/src/services/auth.service.ts` |
| store | `useAuthStore` | frontend | `frontend/user-portal/src/stores/auth.store.ts` |
| hook | `useMFA` | frontend | `frontend/user-portal/src/hooks/queries/useMFA.ts` |

### `core` (127 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `DELETE /api/v1/admin/users/{user_id}` | api | `src/api/v1/admin.py` |
| api_endpoint | `DELETE /api/v1/modules/{module_name}` | api | `src/api/v1/modules.py` |
| config | `FastAPI app` | api | `src/main.py` |
| api_endpoint | `GET /api/health` | api | `src/api/health.py` |
| api_endpoint | `GET /api/metrics` | api | `src/api/health.py` |
| api_endpoint | `GET /api/ready` | api | `src/api/health.py` |
| api_endpoint | `GET /api/v1/admin/users` | api | `src/api/v1/admin.py` |
| api_endpoint | `GET /api/v1/auth/me` | api | `src/api/v1/auth.py` |
| api_endpoint | `GET /api/v1/dashboard/summary` | api | `src/api/v1/dashboard.py` |
| api_endpoint | `GET /api/v1/dashboard/widgets/{widget_id}/data` | api | `src/api/v1/dashboard.py` |
| api_endpoint | `PATCH /api/v1/admin/users/{user_id}/role` | api | `src/api/v1/admin.py` |
| api_endpoint | `POST /api/v1/auth/login` | api | `src/api/v1/auth.py` |
| api_endpoint | `POST /api/v1/auth/logout` | api | `src/api/v1/auth.py` |
| api_endpoint | `POST /api/v1/auth/mfa/verify` | api | `src/api/v1/auth.py` |
| api_endpoint | `POST /api/v1/auth/refresh` | api | `src/api/v1/auth.py` |
| api_endpoint | `POST /api/v1/auth/register` | api | `src/api/v1/auth.py` |
| api_endpoint | `POST /api/v1/modules/install` | api | `src/api/v1/modules.py` |
| api_endpoint | `PUT /api/v1/admin/users/{user_id}/mfa/reset` | api | `src/api/v1/admin.py` |
| file | `api/health.py` | api | `src/api/health.py` |
| file | `api/routes.py` | api | `src/api/routes.py` |
| file | `api/v1/admin.py` | api | `src/api/v1/admin.py` |
| file | `api/v1/auth.py` | api | `src/api/v1/auth.py` |
| file | `api/v1/dashboard.py` | api | `src/api/v1/dashboard.py` |
| file | `api/v1/modules.py` | api | `src/api/v1/modules.py` |
| file | `api/v1/users.py` | api | `src/api/v1/users.py` |
| config | `api_router` | api | `src/api/routes.py` |
| api_endpoint | `divisions router` | api | `src/api/v1/divisions.py` |
| api_endpoint | `health router` | api | `src/api/health.py` |
| api_endpoint | `industries router` | api | `src/api/v1/industries.py` |
| file | `main.py` | api | `src/main.py` |
| api_endpoint | `modules router` | api | `src/api/v1/modules.py` |
| api_endpoint | `organizations router` | api | `src/api/v1/organizations.py` |
| config | `ADMIN_EMAIL` | config | `.env.example` |
| config | `ADMIN_PASSWORD` | config | `.env.example` |
| config | `ALLOWED_ORIGINS` | config | `src/config/settings.py` |
| config | `ANTHROPIC_API_KEY` | config | `.env.example` |
| config | `ANTHROPIC_MODEL` | config | `.env.example` |
| config | `API_KEY_PREFIX` | config | `src/config/settings.py` |
| config | `APP_NAME` | config | `src/config/settings.py` |
| config | `BACKUP_ENCRYPTION_KEY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_DAILY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_MONTHLY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_WEEKLY` | config | `docker-compose.yml` |
| config | `DEBUG` | config | `src/config/settings.py` |
| config | `DOCKER_REGISTRY_PASSWORD` | config | `.env.example` |
| config | `DOCKER_REGISTRY_URL` | config | `.env.example` |
| config | `DOCKER_REGISTRY_USERNAME` | config | `.env.example` |
| config | `ENCRYPT_BACKUPS` | config | `docker-compose.yml` |
| config | `ENVIRONMENT` | config | `src/config/settings.py` |
| config | `FARM_AI_DAILY_LIMIT` | config | `src/config/settings.py` |
| config | `FARM_AI_MAX_TOKENS` | config | `src/config/settings.py` |
| config | `FROM_EMAIL` | config | `src/config/settings.py` |
| config | `FRONTEND_URL` | config | `src/config/settings.py` |
| config | `GOOGLE_APPLICATION_CREDENTIALS` | config | `docker-compose.yml` |
| config | `GOOGLE_CLOUD_PROJECT` | config | `src/config/settings.py` |
| config | `HOST` | config | `src/config/settings.py` |
| config | `LICENSE_ENCRYPTION_KEY` | config | `.env.example` |
| config | `LICENSE_VALIDATION_MODE` | config | `.env.example` |
| config | `LOG_LEVEL` | config | `src/config/settings.py` |
| config | `MAX_MODULES` | config | `.env.example` |
| config | `MAX_MODULES_PER_USER` | config | `.env.example` |
| config | `MODULE_INSTALL_TIMEOUT` | config | `.env.example` |
| config | `MODULE_REGISTRY_PATH` | config | `.env.example` |
| config | `MONGODB_DB_NAME` | config | `src/config/settings.py` |
| config | `MONGODB_URL` | config | `src/config/settings.py` |
| config | `MONGO_APP_PASSWORD` | config | `.env.example` |
| config | `MONGO_APP_USER` | config | `.env.example` |
| config | `MONGO_INITDB_DATABASE` | config | `docker-compose.yml` |
| config | `MONGO_ROOT_PASSWORD` | config | `.env.example` |
| config | `MONGO_ROOT_USERNAME` | config | `.env.example` |
| config | `MYSQL_DB_NAME` | config | `.env.example` |
| config | `MYSQL_HOST` | config | `.env.example` |
| config | `MYSQL_PASSWORD` | config | `.env.example` |
| config | `MYSQL_PORT` | config | `.env.example` |
| config | `MYSQL_USER` | config | `.env.example` |
| config | `PORT` | config | `src/config/settings.py` |
| config | `PYTHONPATH` | config | `docker-compose.yml` |
| config | `RATE_LIMIT_ADMIN` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_GUEST` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_MODERATOR` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_SUPER_ADMIN` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_USER` | config | `src/config/settings.py` |
| config | `REDIS_PASSWORD` | config | `.env.example` |
| config | `REDIS_URL` | config | `.env.example` |
| config | `SECRET_KEY` | config | `src/config/settings.py` |
| class | `Settings` | config | `src/config/settings.py` |
| config | `TRUSTED_REGISTRIES` | config | `.env.example` |
| config | `UVICORN_WORKERS` | config | `docker-compose.yml` |
| config | `VERTEX_AI_LOCATION` | config | `src/config/settings.py` |
| config | `VERTEX_AI_MAX_OUTPUT_TOKENS` | config | `src/config/settings.py` |
| config | `VERTEX_AI_MODEL` | config | `src/config/settings.py` |
| config | `VERTEX_AI_TEMPERATURE` | config | `src/config/settings.py` |
| class | `JSONFormatter` | core | `src/core/logging_config.py` |
| class | `ModuleManifest` | core | `src/core/plugin_system/plugin_manager.py` |
| class | `PluginManager` | core | `src/core/plugin_system/plugin_manager.py` |
| class | `RedisCache` | core | `src/core/cache/redis_cache.py` |
| function | `cache_response` | core | `src/core/cache/decorators.py` |
| class | `LoginRateLimiter` | middleware | `src/middleware/rate_limit.py` |
| class | `MFARateLimiter` | middleware | `src/middleware/rate_limit.py` |
| middleware | `RateLimitMiddleware` | middleware | `src/middleware/rate_limit.py` |
| class | `RateLimiter` | middleware | `src/middleware/rate_limit.py` |
| class | `RateLimiter` | middleware | `src/middleware/rate_limit.py` |
| class | `RoleChecker` | middleware | `src/middleware/permissions.py` |
| class | `TimingMiddleware` | middleware | `src/middleware/timing.py` |
| function | `get_current_active_user` | middleware | `src/middleware/auth.py` |
| function | `rate_limit_dependency` | middleware | `src/middleware/rate_limit.py` |
| pydantic_model | `DashboardConfig` | model | `src/models/dashboard.py` |
| pydantic_model | `ModuleConfig` | model | `src/models/module.py` |
| pydantic_model | `UserRole` | model | `src/models/user.py` |
| db_model | `admin_audit_log` | model | `src/services/database.py` |
| db_model | `installed_modules` | model | `src/services/database.py` |
| db_model | `mfa_audit_log` | model | `src/services/database.py` |
| db_model | `mfa_backup_codes` | model | `src/services/database.py` |
| db_model | `mfa_pending_tokens` | model | `src/services/auth_service.py` |
| db_model | `module_audit_log` | model | `src/services/database.py` |
| db_model | `refresh_tokens` | model | `src/services/database.py` |
| db_model | `user_mfa` | model | `src/services/database.py` |
| db_model | `users` | model | `src/services/database.py` |
| db_model | `verification_tokens` | model | `src/services/database.py` |
| class | `AuthService` | service | `src/services/auth_service.py` |
| class | `DashboardService` | service | `src/services/dashboard_service.py` |
| class | `MFAService` | service | `src/services/mfa_service.py` |
| class | `ModuleManager` | service | `src/services/module_manager.py` |
| class | `MongoDBManager` | service | `src/services/database.py` |
| class | `PortManager` | service | `src/services/port_manager.py` |
| class | `ProxyManager` | service | `src/services/proxy_manager.py` |
| class | `UserService` | service | `src/services/user_service.py` |

### `crm` (10 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /crm/customers` | api | `src/modules/crm/api/v1/customers.py` |
| component | `CRMPage` | frontend | `frontend/user-portal/src/pages/crm/CRMPage.tsx` |
| component | `CustomerDetailPage` | frontend | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx` |
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
| api_endpoint | `dashboard router` | api | `src/api/v1/dashboard.py` |
| component | `AddWidgetModal` | frontend | `frontend/user-portal/src/components/dashboard/AddWidgetModal.tsx` |
| component | `Dashboard` | frontend | `frontend/user-portal/src/pages/dashboard/Dashboard.tsx` |
| function | `dashboardDataService` | frontend | `frontend/user-portal/src/services/dashboard-data.service.ts` |
| function | `dashboardService` | frontend | `frontend/user-portal/src/services/dashboard.service.ts` |
| hook | `useDashboard` | frontend | `frontend/user-portal/src/hooks/queries/useDashboard.ts` |
| store | `useDashboardStore` | frontend | `frontend/user-portal/src/stores/dashboard.store.ts` |

### `farm` (81 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AIAnalytics` | frontend | `frontend/user-portal/src/pages/ai/AIAnalytics.tsx` |
| component | `AIAnalyticsChat` | frontend | `frontend/user-portal/src/components/ai/AIAnalyticsChat.tsx` |
| component | `AddPlantDataModal` | frontend | `frontend/user-portal/src/components/farm/AddPlantDataModal.tsx` |
| component | `AddVirtualCropModal` | frontend | `frontend/user-portal/src/components/farm/AddVirtualCropModal.tsx` |
| component | `BlockAlertsTab` | frontend | `frontend/user-portal/src/components/farm/BlockAlertsTab.tsx` |
| component | `BlockAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/BlockAnalyticsModal.tsx` |
| component | `BlockArchivesTab` | frontend | `frontend/user-portal/src/components/farm/BlockArchivesTab.tsx` |
| component | `BlockAutomationTab` | frontend | `frontend/user-portal/src/components/farm/BlockAutomationTab.tsx` |
| component | `BlockCard` | frontend | `frontend/user-portal/src/components/farm/BlockCard.tsx` |
| component | `BlockDetail` | frontend | `frontend/user-portal/src/components/farm/BlockDetail.tsx` |
| component | `BlockDetailsModal` | frontend | `frontend/user-portal/src/components/farm/BlockDetailsModal.tsx` |
| component | `BlockGrid` | frontend | `frontend/user-portal/src/components/farm/BlockGrid.tsx` |
| component | `BlockGrid (dashboard)` | frontend | `frontend/user-portal/src/components/farm/dashboard/BlockGrid.tsx` |
| component | `BlockHarvestEntryModal` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestEntryModal.tsx` |
| component | `BlockHarvestsTab` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestsTab.tsx` |
| component | `BlockTaskList` | frontend | `frontend/user-portal/src/pages/operations/BlockTaskList.tsx` |
| component | `CompactBlockCard` | frontend | `frontend/user-portal/src/components/farm/dashboard/CompactBlockCard.tsx` |
| component | `CreateBlockModal` | frontend | `frontend/user-portal/src/components/farm/CreateBlockModal.tsx` |
| component | `CreateFarmModal` | frontend | `frontend/user-portal/src/components/farm/CreateFarmModal.tsx` |
| component | `DashboardFilters` | frontend | `frontend/user-portal/src/components/farm/dashboard/DashboardFilters.tsx` |
| component | `DashboardHeader` | frontend | `frontend/user-portal/src/components/farm/dashboard/DashboardHeader.tsx` |
| component | `DashboardSettings` | frontend | `frontend/user-portal/src/components/farm/dashboard/DashboardSettings.tsx` |
| component | `EditBlockModal` | frontend | `frontend/user-portal/src/components/farm/EditBlockModal.tsx` |
| component | `EditFarmBoundaryModal` | frontend | `frontend/user-portal/src/components/farm/EditFarmBoundaryModal.tsx` |
| component | `EditFarmModal` | frontend | `frontend/user-portal/src/components/farm/EditFarmModal.tsx` |
| component | `EditPlantDataModal` | frontend | `frontend/user-portal/src/components/farm/EditPlantDataModal.tsx` |
| component | `EmptyVirtualBlockModal` | frontend | `frontend/user-portal/src/components/farm/EmptyVirtualBlockModal.tsx` |
| component | `FarmAIChat` | frontend | `frontend/user-portal/src/components/farm/FarmAIChat.tsx` |
| component | `FarmAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/FarmAnalyticsModal.tsx` |
| component | `FarmBlocksView` | frontend | `frontend/user-portal/src/pages/operations/FarmBlocksView.tsx` |
| component | `FarmCard` | frontend | `frontend/user-portal/src/components/farm/FarmCard.tsx` |
| component | `FarmDashboard` | frontend | `frontend/user-portal/src/components/farm/FarmDashboard.tsx` |
| component | `FarmDashboardPage` | frontend | `frontend/user-portal/src/pages/farm/FarmDashboardPage.tsx` |
| component | `FarmDetail` | frontend | `frontend/user-portal/src/components/farm/FarmDetail.tsx` |
| component | `FarmHistoryTab` | frontend | `frontend/user-portal/src/components/farm/FarmHistoryTab.tsx` |
| component | `FarmList` | frontend | `frontend/user-portal/src/components/farm/FarmList.tsx` |
| component | `FarmManager` | frontend | `frontend/user-portal/src/pages/farm/FarmManager.tsx` |
| component | `FarmMapView` | frontend | `frontend/user-portal/src/components/farm/FarmMapView.tsx` |
| component | `FarmSelector` | frontend | `frontend/user-portal/src/components/farm/dashboard/FarmSelector.tsx` |
| component | `FarmingYearSelector` | frontend | `frontend/user-portal/src/components/farm/FarmingYearSelector.tsx` |
| component | `GlobalFarmAnalyticsModal` | frontend | `frontend/user-portal/src/components/farm/GlobalFarmAnalyticsModal.tsx` |
| component | `InventoryDashboard` | frontend | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx` |
| component | `OperationsDashboard` | frontend | `frontend/user-portal/src/pages/operations/OperationsDashboard.tsx` |
| component | `PendingTasksWarningModal` | frontend | `frontend/user-portal/src/components/farm/PendingTasksWarningModal.tsx` |
| component | `PhysicalBlockCard` | frontend | `frontend/user-portal/src/components/farm/PhysicalBlockCard.tsx` |
| component | `PhysicalBlockGrid` | frontend | `frontend/user-portal/src/components/farm/PhysicalBlockGrid.tsx` |
| component | `PlantAssignmentModal` | frontend | `frontend/user-portal/src/components/farm/PlantAssignmentModal.tsx` |
| component | `PlantDataCard` | frontend | `frontend/user-portal/src/components/farm/PlantDataCard.tsx` |
| component | `PlantDataDetail` | frontend | `frontend/user-portal/src/components/farm/PlantDataDetail.tsx` |
| component | `PlantDataLibrary` | frontend | `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx` |
| component | `QuickPlanModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/QuickPlanModal.tsx` |
| component | `ResolveAlertModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/ResolveAlertModal.tsx` |
| component | `WasteInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/WasteInventoryList.tsx` |
| type | `alert types` | frontend | `frontend/user-portal/src/types/alerts.ts` |
| function | `alertsApi` | frontend | `frontend/user-portal/src/services/alertsApi.ts` |
| type | `analytics types` | frontend | `frontend/user-portal/src/types/analytics.ts` |
| type | `farm types` | frontend | `frontend/user-portal/src/types/farm.ts` |
| type | `farm-analytics types` | frontend | `frontend/user-portal/src/types/farm-analytics.ts` |
| type | `farmAI types` | frontend | `frontend/user-portal/src/types/farmAI.ts` |
| function | `farmApi` | frontend | `frontend/user-portal/src/services/farmApi.ts` |
| type | `global-analytics types` | frontend | `frontend/user-portal/src/types/global-analytics.ts` |
| type | `inventory types` | frontend | `frontend/user-portal/src/types/inventory.ts` |
| function | `inventoryApi` | frontend | `frontend/user-portal/src/services/inventoryApi.ts` |
| file | `mapConfig` | frontend | `frontend/user-portal/src/config/mapConfig.ts` |
| function | `plantDataEnhancedApi` | frontend | `frontend/user-portal/src/services/plantDataEnhancedApi.ts` |
| type | `task types` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| function | `tasksApi` | frontend | `frontend/user-portal/src/services/tasksApi.ts` |
| hook | `useAIAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useAIAnalytics.ts` |
| hook | `useBlockActions` | frontend | `frontend/user-portal/src/hooks/farm/useBlockActions.ts` |
| hook | `useBlockAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useBlockAnalytics.ts` |
| hook | `useDashboardConfig` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardConfig.ts` |
| hook | `useDashboardData` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardData.ts` |
| hook | `useDashboardFilters` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardFilters.ts` |
| hook | `useFarmAIChat` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAIChat.ts` |
| hook | `useFarmAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAnalytics.ts` |
| hook | `useFarmingYears` | frontend | `frontend/user-portal/src/hooks/queries/useFarmingYears.ts` |
| hook | `useFarms` | frontend | `frontend/user-portal/src/hooks/queries/useFarms.ts` |
| hook | `useGlobalAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useGlobalAnalytics.ts` |
| hook | `useMapDrawing` | frontend | `frontend/user-portal/src/hooks/map/useMapDrawing.ts` |
| hook | `useWeatherData` | frontend | `frontend/user-portal/src/hooks/farm/useWeatherData.ts` |
| function | `weatherApi` | frontend | `frontend/user-portal/src/services/weatherApi.ts` |

### `farm_manager` (137 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /config` | api | `src/modules/farm_manager/api/v1/config.py` |
| api_endpoint | `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | api | `src/modules/farm_manager/api/v1/block_alerts.py` |
| api_endpoint | `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | api | `src/modules/farm_manager/api/v1/block_harvests.py` |
| api_endpoint | `CRUD /inventory` | api | `src/modules/farm_manager/api/v1/inventory.py` |
| api_endpoint | `CRUD /plant-data` | api | `src/modules/farm_manager/api/v1/plant_data.py` |
| api_endpoint | `CRUD /plant-data-enhanced` | api | `src/modules/farm_manager/api/v1/plant_data_enhanced.py` |
| api_endpoint | `CRUD /plantings` | api | `src/modules/farm_manager/api/v1/plantings.py` |
| api_endpoint | `CRUD /sensehub` | api | `src/modules/farm_manager/api/v1/sensehub.py` |
| api_endpoint | `CRUD /tasks` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| api_endpoint | `DELETE /farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/farms.py` |
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
| api_endpoint | `PATCH /farms/{farm_id}` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `PATCH /farms/{farm_id}/blocks/{block_id}/status` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /farms` | api | `src/modules/farm_manager/api/v1/farms.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks` | api | `src/modules/farm_manager/api/v1/blocks.py` |
| api_endpoint | `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | api | `src/modules/farm_manager/api/v1/farm_ai_chat.py` |
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

### `frontend` (31 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `NODE_ENV` | config | `docker-compose.yml` |
| config | `VITE_API_TARGET` | config | `docker-compose.yml` |
| config | `VITE_API_URL` | config | `docker-compose.yml` |
| component | `AIAnalyticsChat` | frontend | `frontend/user-portal/src/components/ai/AIAnalyticsChat.tsx` |
| component | `AIHubChat` | frontend | `frontend/user-portal/src/components/ai/AIHubChat.tsx` |
| component | `App` | frontend | `frontend/user-portal/src/App.tsx` |
| component | `BlockDetail` | frontend | `frontend/user-portal/src/components/farm/BlockDetail.tsx` |
| component | `BlockHarvestEntryModal` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestEntryModal.tsx` |
| component | `CRMPage` | frontend | `frontend/user-portal/src/pages/crm/CRMPage.tsx` |
| component | `CompactBlockCard` | frontend | `frontend/user-portal/src/components/farm/dashboard/CompactBlockCard.tsx` |
| component | `CustomerDetailPage` | frontend | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx` |
| component | `FarmDashboard` | frontend | `frontend/user-portal/src/components/farm/FarmDashboard.tsx` |
| component | `FarmDashboardPage` | frontend | `frontend/user-portal/src/pages/farm/FarmDashboardPage.tsx` |
| component | `HRDashboardPage` | frontend | `frontend/user-portal/src/pages/hr/HRDashboardPage.tsx` |
| type | `HarvestEntry` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| component | `HarvestEntryModal (mushroom)` | frontend | `frontend/user-portal/src/components/mushroom/HarvestEntryModal.tsx` |
| component | `HarvestEntryModal (operations)` | frontend | `frontend/user-portal/src/components/operations/HarvestEntryModal.tsx` |
| type | `HarvestGrade` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| type | `HarvestSummary` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| component | `InventoryDashboard` | frontend | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx` |
| component | `MushroomFacilityManager` | frontend | `frontend/user-portal/src/pages/mushroom/MushroomFacilityManager.tsx` |
| type | `PaginatedTasksResponse` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| component | `SalesDashboardPage` | frontend | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx` |
| type | `Task` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| type | `TaskStatus` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| type | `TaskType` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| type | `TaskWithDetails` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| function | `positiveIntegerInputProps` | frontend | `frontend/user-portal/src/utils/inputGuards.ts` |
| function | `positiveNumberInputProps` | frontend | `frontend/user-portal/src/utils/inputGuards.ts` |
| config | `theme` | frontend | `frontend/shared/src/theme/theme.ts` |
| file | `utils/index` | frontend | `frontend/user-portal/src/utils/index.ts` |

### `hr` (25 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /hr/contracts` | api | `src/modules/hr/api/v1/contracts.py` |
| api_endpoint | `CRUD /hr/employees` | api | `src/modules/hr/api/v1/employees.py` |
| api_endpoint | `CRUD /hr/insurance` | api | `src/modules/hr/api/v1/insurance.py` |
| api_endpoint | `CRUD /hr/performance` | api | `src/modules/hr/api/v1/performance.py` |
| api_endpoint | `CRUD /hr/visas` | api | `src/modules/hr/api/v1/visas.py` |
| api_endpoint | `GET /hr/dashboard` | api | `src/modules/hr/api/v1/dashboard.py` |
| component | `EmployeeDetailPage` | frontend | `frontend/user-portal/src/pages/hr/EmployeeDetailPage.tsx` |
| component | `EmployeeListPage` | frontend | `frontend/user-portal/src/pages/hr/EmployeeListPage.tsx` |
| component | `HRDashboardPage` | frontend | `frontend/user-portal/src/pages/hr/HRDashboardPage.tsx` |
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

### `logistics` (19 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /logistics/routes` | api | `src/modules/logistics/api/v1/routes.py` |
| api_endpoint | `CRUD /logistics/shipments` | api | `src/modules/logistics/api/v1/shipments.py` |
| api_endpoint | `CRUD /logistics/vehicles` | api | `src/modules/logistics/api/v1/vehicles.py` |
| api_endpoint | `GET /logistics/dashboard` | api | `src/modules/logistics/api/v1/dashboard.py` |
| component | `LogisticsDashboardPage` | frontend | `frontend/user-portal/src/pages/logistics/LogisticsDashboardPage.tsx` |
| component | `RouteManagementPage` | frontend | `frontend/user-portal/src/pages/logistics/RouteManagementPage.tsx` |
| component | `ShipmentTrackingPage` | frontend | `frontend/user-portal/src/pages/logistics/ShipmentTrackingPage.tsx` |
| component | `VehicleManagementPage` | frontend | `frontend/user-portal/src/pages/logistics/VehicleManagementPage.tsx` |
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

### `marketing` (22 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /marketing/budgets` | api | `src/modules/marketing/api/v1/budgets.py` |
| api_endpoint | `CRUD /marketing/campaigns` | api | `src/modules/marketing/api/v1/campaigns.py` |
| api_endpoint | `CRUD /marketing/channels` | api | `src/modules/marketing/api/v1/channels.py` |
| api_endpoint | `CRUD /marketing/events` | api | `src/modules/marketing/api/v1/events.py` |
| api_endpoint | `GET /marketing/dashboard` | api | `src/modules/marketing/api/v1/dashboard.py` |
| component | `BudgetManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/BudgetManagementPage.tsx` |
| component | `CampaignManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/CampaignManagementPage.tsx` |
| component | `ChannelManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/ChannelManagementPage.tsx` |
| component | `EventManagementPage` | frontend | `frontend/user-portal/src/pages/marketing/EventManagementPage.tsx` |
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

### `sales` (26 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /sales/inventory` | api | `src/modules/sales/api/v1/inventory.py` |
| api_endpoint | `CRUD /sales/orders` | api | `src/modules/sales/api/v1/orders.py` |
| api_endpoint | `CRUD /sales/purchase-orders` | api | `src/modules/sales/api/v1/purchase_orders.py` |
| api_endpoint | `CRUD /sales/returns` | api | `src/modules/sales/api/v1/returns.py` |
| api_endpoint | `GET /sales/dashboard` | api | `src/modules/sales/api/v1/dashboard.py` |
| component | `InventoryPage` | frontend | `frontend/user-portal/src/pages/sales/InventoryPage.tsx` |
| component | `PurchaseOrdersPage` | frontend | `frontend/user-portal/src/pages/sales/PurchaseOrdersPage.tsx` |
| component | `ReturnsPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnsPage.tsx` |
| component | `SalesDashboardPage` | frontend | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx` |
| component | `SalesOrdersPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrdersPage.tsx` |
| type | `returns types` | frontend | `frontend/user-portal/src/types/returns.ts` |
| type | `sales types` | frontend | `frontend/user-portal/src/types/sales.ts` |
| function | `salesService` | frontend | `frontend/user-portal/src/services/salesService.ts` |
| hook | `useSales` | frontend | `frontend/user-portal/src/hooks/queries/useSales.ts` |
| class | `SalesDatabaseManager` | infrastructure | `src/modules/sales/services/database.py` |
| pydantic_model | `ReturnOrder` | model | `src/modules/sales/models/return_order.py` |
| pydantic_model | `SalesOrder` | model | `src/modules/sales/models/sales_order.py` |
| db_model | `harvest_inventory` | model | `src/modules/sales/services/sales/inventory_repository.py` |
| db_model | `purchase_orders` | model | `src/modules/sales/services/sales/purchase_order_repository.py` |
| db_model | `return_orders` | model | `src/modules/sales/services/sales/return_service.py` |
| db_model | `sales_orders` | model | `src/modules/sales/services/sales/order_repository.py` |
| class | `OrderRepository` | repository | `src/modules/sales/services/sales/order_repository.py` |
| class | `InventoryService` | service | `src/modules/sales/services/sales/inventory_service.py` |
| class | `OrderService` | service | `src/modules/sales/services/sales/order_service.py` |
| class | `PurchaseOrderService` | service | `src/modules/sales/services/sales/purchase_order_service.py` |
| class | `ReturnService` | service | `src/modules/sales/services/sales/return_service.py` |

### `shared` (15 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| file | `App` | frontend | `frontend/user-portal/src/App.tsx` |
| component | `ClearCache` | frontend | `frontend/user-portal/src/pages/debug/ClearCache.tsx` |
| component | `MainLayout` | frontend | `frontend/user-portal/src/components/layout/MainLayout.tsx` |
| component | `NotFound` | frontend | `frontend/user-portal/src/pages/NotFound.tsx` |
| component | `Profile` | frontend | `frontend/user-portal/src/pages/profile/Profile.tsx` |
| component | `ProtectedRoute` | frontend | `frontend/user-portal/src/components/common/ProtectedRoute.tsx` |
| component | `Settings` | frontend | `frontend/user-portal/src/pages/settings/Settings.tsx` |
| component | `ToastContainer` | frontend | `frontend/user-portal/src/components/common/ToastContainer.tsx` |
| component | `UnsavedChangesDialog` | frontend | `frontend/user-portal/src/components/common/UnsavedChangesDialog.tsx` |
| component | `UserManagementPage` | frontend | `frontend/user-portal/src/pages/admin/UserManagementPage.tsx` |
| function | `apiClient` | frontend | `frontend/user-portal/src/services/api.ts` |
| file | `react-query.config` | frontend | `frontend/user-portal/src/config/react-query.config.ts` |
| hook | `usePageVisibility` | frontend | `frontend/user-portal/src/hooks/usePageVisibility.ts` |
| store | `useToastStore` | frontend | `frontend/user-portal/src/stores/toast.store.ts` |
| hook | `useUnsavedChanges` | frontend | `frontend/user-portal/src/hooks/useUnsavedChanges.ts` |

## Cross-Module Dependencies

| Source Module | Edge | Target Module |
|---------------|------|---------------|
| `farm_manager.api.farms.create_farm` | depends_on | `core.middleware.auth` |
| `sales.service.OrderService` | depends_on | `crm.service.CustomerRepository` |
| `sales.service.OrderService` | depends_on | `farm_manager.service.FarmDatabaseManager` |
| `logistics.service.ShipmentService` | depends_on | `sales.service.OrderService` |
