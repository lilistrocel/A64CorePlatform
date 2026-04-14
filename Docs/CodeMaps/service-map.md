# Service Map

> Generated: 2026-04-14 12:39 UTC  
> Source: MongoDB `mapper_nodes` (layer=service)

## Overview

Service layer implements business logic and orchestrates data access.
Services are injected into API endpoints via FastAPI dependency injection.

**Related Maps:** [api-map.md](api-map.md) | [database-map.md](database-map.md) | [module-map.md](module-map.md)

## Services by Module (60 total)

### `ai_analytics`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `CostTrackingService` | `src/modules/ai_analytics/services/cost_tracking_service.py:16` | CostTrackingService | Logs AI query costs to 'ai_query_log' collection for usage tracking. |
| `GeminiService` | `src/modules/ai_analytics/services/gemini_service.py:23` | GeminiService | Vertex AI Gemini API client for NL-to-MongoDB query generation. |
| `QueryEngine` | `src/modules/ai_analytics/services/query_engine.py:27` | QueryEngine | Full NL-to-MongoDB pipeline: schema discovery, Gemini query gen, execution, formatting. |
| `QueryValidator` | `src/modules/ai_analytics/utils/validators.py:20` | QueryValidator | Validates generated MongoDB queries for safety (blocks destructive operations). |
| `SchemaService` | `src/modules/ai_analytics/services/schema_service.py:17` | SchemaService | Auto-discovers MongoDB collection schemas by sampling documents. |

### `core`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `AuthService` | `src/services/auth_service.py:47` | register_user, register_user_with_tokens, login_user, refres | Auth business logic: registration, login, token management, email verify, password reset, MFA |
| `DashboardService` | `src/services/dashboard_service.py:20` | generate_sales_trend_data, generate_revenue_breakdown_data,  | Widget data service generating mock/live data for dashboard charts and stat widgets |
| `MFAService` | `src/services/mfa_service.py:127` | generate_totp_secret, generate_totp_uri, generate_qr_code_ba | TOTP-based MFA service with Fernet-encrypted secrets and SHA-256 hashed backup codes |
| `ModuleManager` | `src/services/module_manager.py:127` | install_module, _create_container, uninstall_module, get_ins | Docker-based module lifecycle manager: install/uninstall containers, audit logging, NGINX routing |
| `MongoDBManager` | `src/services/database.py:18` | connect, disconnect, get_database, health_check | Async MongoDB manager using Motor; handles connection pooling and index creation on startup |
| `PortManager` | `src/services/port_manager.py:25` | allocate_ports, release_ports, get_module_ports, is_port_ava | Auto port allocation in range 9000-19999 using MongoDB registry; prevents conflicts |
| `ProxyManager` | `src/services/proxy_manager.py:25` | generate_module_config, add_module_route, remove_module_rout | Generates and manages NGINX location block configs for dynamically installed modules |
| `UserService` | `src/services/user_service.py:20` | get_user_by_id, get_user_by_email, list_users, update_user,  | User CRUD business logic with pagination, filtering, and soft-delete support |

### `crm`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `CustomerService` | `src/modules/crm/services/customer/customer_service.py:20` | CustomerService | Customer CRUD orchestration with CustomerRepository. |

### `farm_manager`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `AlertService` | `src/modules/farm_manager/services/block/alert_service.py:23` | AlertService | Block alert CRUD with resolve/dismiss and active alert queries. |
| `ArchiveService` | `src/modules/farm_manager/services/block/archive_service.py:22` | ArchiveService | Block archive CRUD with performance analytics and crop comparison. |
| `BlockAnalyticsService` | `src/modules/farm_manager/services/block/analytics_service.py:36` | BlockAnalyticsService | Block-level analytics: yield trends, timeline, task stats, performance metrics. |
| `BlockService` | `src/modules/farm_manager/services/block/block_service_new.py:30` | BlockService | Block lifecycle management with VALID_TRANSITIONS state machine, KPI recalc, archiving. |
| `CascadeDeletionService` | `src/modules/farm_manager/services/cascade_deletion_service.py:25` | CascadeDeletionService | Cascade deletion: moves farms/blocks/harvests/archives to deleted_* collections. |
| `ConfigService` | `src/modules/farm_manager/services/config_service.py:22` | ConfigService | Spacing standards configuration stored in 'system_config' collection. |
| `FarmAIChatService` | `src/modules/farm_manager/services/farm_ai/service.py:62` | FarmAIChatService | Orchestrates Vertex AI Gemini chat with SenseHub tool execution and confirmation flow. |
| `FarmAnalyticsService` | `src/modules/farm_manager/services/farm/farm_analytics_service.py:34` | FarmAnalyticsService | Computes farm-level analytics: yield metrics, state breakdown, block comparison. |
| `FarmService` | `src/modules/farm_manager/services/farm/farm_service.py:20` | FarmService | Farm CRUD orchestration delegating to FarmRepository. |
| `FarmingYearService` | `src/modules/farm_manager/services/farming_year_service.py:25` | FarmingYearService | Configurable farming year periods for analytics date ranges. |
| `GlobalAnalyticsService` | `src/modules/farm_manager/services/global_analytics_service.py:29` | GlobalAnalyticsService | Cross-farm analytics aggregation using FarmAnalyticsService and FarmRepository. |
| `HarvestAggregatorService` | `src/modules/farm_manager/services/task/harvest_aggregator.py:19` | HarvestAggregatorService | Daily aggregation of harvest entries into block_harvests (runs at 23:00). |
| `HarvestAggregatorService` | `src/modules/farm_manager/services/task/harvest_aggregator.py` | HarvestAggregatorService | Cron-driven aggregator for daily harvest tasks. Aggregates entries at 23:00, creates harvest records, updates block KPIs, generates next-day task if block still HARVESTING. |
| `HarvestService` | `src/modules/farm_manager/services/block/harvest_service.py:28` | HarvestService | Block harvest CRUD with quality grade mapping to inventory integration. |
| `PlantDataEnhancedService` | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py:25` | PlantDataEnhancedService | Enhanced plant data CRUD with growth cycles, fertigation, search, clone. |
| `PlantDataService` | `src/modules/farm_manager/services/plant_data/plant_data_service.py:20` | PlantDataService | Simple plant data CRUD with CSV import/export. |
| `PlantingService` | `src/modules/farm_manager/services/planting/planting_service.py:22` | PlantingService | Planting plan management: create plan, mark planted, list plantings. |
| `SenseHubClient` | `src/modules/farm_manager/services/sensehub/sensehub_client.py:26` | SenseHubClient | HTTP client for SenseHub edge devices: equipment, automations, alerts, relay control. |
| `SenseHubConnectionService` | `src/modules/farm_manager/services/sensehub/sensehub_connection_service.py:23` | SenseHubConnectionService | SenseHub connection lifecycle: connect, disconnect, status, get_client, get_mcp_client. |
| `SenseHubMCPClient` | `src/modules/farm_manager/services/sensehub/sensehub_mcp_client.py:36` | SenseHubMCPClient | MCP protocol client for SenseHub with dynamic tool discovery via SSE transport. |
| `TaskGeneratorService` | `src/modules/farm_manager/services/task/task_generator.py:21` | TaskGeneratorService | Auto-generates tasks on block state transitions (e.g. planting, harvesting). |
| `TaskGeneratorService` | `src/modules/farm_manager/services/task/task_generator.py` | TaskGeneratorService | Auto-generates tasks from block cycle state transitions. |
| `TaskRepository` | `src/modules/farm_manager/services/task/task_repository.py:75` | TaskRepository | Data access layer for farm tasks. Handles CRUD, get_by_farm/get_by_block/get_my_tasks pagination, complete_task, add_harvest_entry, aggregate_daily_harvest. |
| `TaskService` | `src/modules/farm_manager/services/task/task_service.py:25` | TaskService | Farm task CRUD: create, assign, complete, harvest entry, cancel. |
| `TaskService` | `src/modules/farm_manager/services/task/task_service.py:25` | TaskService | Business logic layer for farm tasks. v1.11.0: get_task/get_farm_tasks/get_block_tasks/get_my_tasks now return FarmTaskWithDetails via _enrich_tasks_with_block_farm. Also handles task completion + optional block state transition. |
| `VirtualBlockService` | `src/modules/farm_manager/services/block/virtual_block_service.py:24` | VirtualBlockService | Multi-crop virtual block management: add/empty virtual crops under parent blocks. |
| `WeatherAPIClient` | `src/modules/farm_manager/services/weather/weather_client.py:26` | WeatherAPIClient | HTTP client for WeatherBit API (current, forecast, agri data). |
| `WeatherCacheService` | `src/modules/farm_manager/services/weather/weather_cache_service.py:22` | WeatherCacheService | Server-side weather response caching with TTL management. |
| `WeatherService` | `src/modules/farm_manager/services/weather/weather_service.py:72` | WeatherService | Weather data retrieval via WeatherBit API with caching. |
| `_enrich_tasks_with_block_farm` | `src/modules/farm_manager/services/task/task_repository.py:22` | _enrich_tasks_with_block_farm | v1.11.0 helper: batched $in lookup against blocks and farms collections to enrich FarmTask list into FarmTaskWithDetails (attaches blockCode, blockName, farmCode, farmName, targetCrop, targetCropName, actualPlantCount, expectedYieldKg). Single round-trip per collection regardless of task count. |

### `hr`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `ContractService` | `src/modules/hr/services/employee/contract_service.py:20` | ContractService | Employment contract CRUD with ContractRepository. |
| `EmployeeService` | `src/modules/hr/services/employee/employee_service.py:20` | EmployeeService | Employee CRUD orchestration with EmployeeRepository. |
| `InsuranceService` | `src/modules/hr/services/employee/insurance_service.py:20` | InsuranceService | Insurance policy CRUD with InsuranceRepository. |
| `PerformanceService` | `src/modules/hr/services/employee/performance_service.py:20` | PerformanceService | Performance review CRUD with PerformanceRepository. |
| `VisaService` | `src/modules/hr/services/employee/visa_service.py:20` | VisaService | Visa tracking CRUD with VisaRepository. |

### `logistics`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `RouteService` | `src/modules/logistics/services/logistics/route_service.py:19` | RouteService | Delivery route CRUD with RouteRepository. |
| `ShipmentService` | `src/modules/logistics/services/logistics/shipment_service.py:28` | ShipmentService | Shipment orchestration integrating with sales OrderService for order fulfillment. |
| `VehicleService` | `src/modules/logistics/services/logistics/vehicle_service.py:19` | VehicleService | Vehicle fleet CRUD with VehicleRepository. |

### `marketing`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `BudgetService` | `src/modules/marketing/services/marketing/budget_service.py:19` | BudgetService | Budget allocation CRUD with BudgetRepository. |
| `CampaignService` | `src/modules/marketing/services/marketing/campaign_service.py:21` | CampaignService | Campaign orchestration using BudgetRepository and ChannelRepository. |
| `ChannelService` | `src/modules/marketing/services/marketing/channel_service.py:19` | ChannelService | Marketing channel CRUD with ChannelRepository. |
| `EventService` | `src/modules/marketing/services/marketing/event_service.py:20` | EventService | Marketing event CRUD with EventRepository. |

### `sales`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `InventoryService` | `src/modules/sales/services/sales/inventory_service.py:19` | InventoryService | Sales harvest inventory CRUD with InventoryRepository. |
| `OrderService` | `src/modules/sales/services/sales/order_service.py:26` | OrderService | Sales order orchestration integrating with CRM customers and farm inventory. |
| `PurchaseOrderService` | `src/modules/sales/services/sales/purchase_order_service.py:19` | PurchaseOrderService | Purchase order CRUD with PurchaseOrderRepository. |
| `ReturnService` | `src/modules/sales/services/sales/return_service.py:28` | ReturnService | Sales returns processing with restocking to inventory. |

## Dependency Injection Graph

| Consumer | Uses | Provider | Context |
|----------|------|----------|---------|
| `farm_manager.service.FarmService` | uses | `farm_manager.service.FarmRepository` | FarmService delegates DB operations to FarmRepository. |
| `farm_manager.service.BlockService` | uses | `farm_manager.service.BlockRepository` | BlockService delegates DB operations to BlockRepository. |
| `farm_manager.service.BlockService` | uses | `farm_manager.service.HarvestRepository` | BlockService reads harvest data for KPI calculation. |
| `farm_manager.service.HarvestService` | uses | `farm_manager.service.HarvestRepository` | HarvestService delegates DB operations to HarvestRepository. |
| `farm_manager.service.HarvestService` | uses | `farm_manager.service.BlockRepository` | HarvestService reads block info to validate and update KPI. |
| `farm_manager.service.AlertService` | uses | `farm_manager.service.AlertRepository` | AlertService delegates DB operations to AlertRepository. |
| `farm_manager.service.ArchiveService` | uses | `farm_manager.service.ArchiveRepository` | ArchiveService delegates DB operations to ArchiveRepository. |
| `farm_manager.service.TaskService` | uses | `farm_manager.service.TaskRepository` | TaskService delegates DB operations to TaskRepository. |
| `farm_manager.service.VirtualBlockService` | uses | `farm_manager.service.BlockRepository` | VirtualBlockService reads/writes block data via BlockReposit |
| `farm_manager.service.VirtualBlockService` | uses | `farm_manager.service.PlantDataEnhancedRepository` | VirtualBlockService looks up plant data for virtual crop cre |
| `farm_manager.service.PlantDataService` | uses | `farm_manager.service.PlantDataRepository` | PlantDataService delegates DB operations to PlantDataReposit |
| `farm_manager.service.PlantDataEnhancedService` | uses | `farm_manager.service.PlantDataEnhancedRepository` | PlantDataEnhancedService delegates DB operations to PlantDat |
| `farm_manager.service.PlantingService` | uses | `farm_manager.service.PlantingRepository` | PlantingService delegates DB operations to PlantingRepositor |
| `farm_manager.service.WeatherService` | uses | `farm_manager.service.WeatherAPIClient` | WeatherService calls WeatherBit API via WeatherAPIClient. |
| `farm_manager.service.CascadeDeletionService` | uses | `farm_manager.service.FarmDatabaseManager` | CascadeDeletionService accesses deleted_* collections via fa |
| `hr.service.EmployeeService` | uses | `hr.service.EmployeeRepository` | EmployeeService delegates DB operations to EmployeeRepositor |
| `crm.service.CustomerService` | uses | `crm.service.CustomerRepository` | CustomerService delegates DB operations to CustomerRepositor |
| `sales.service.OrderService` | uses | `sales.service.OrderRepository` | OrderService delegates DB operations to OrderRepository. |
| `logistics.service.ShipmentService` | uses | `logistics.service.ShipmentRepository` | ShipmentService delegates DB operations to ShipmentRepositor |
| `marketing.service.CampaignService` | uses | `marketing.service.BudgetService` | CampaignService uses BudgetService for budget allocation. |
| `page::FarmDashboardPage` | uses | `hook::useDashboardData` | FarmDashboardPage uses useDashboardData hook to fetch block  |
| `page::FarmDashboardPage` | uses | `hook::useDashboardConfig` | FarmDashboardPage uses useDashboardConfig for dashboard sett |
| `page::FarmDashboardPage` | uses | `hook::useDashboardFilters` | FarmDashboardPage uses useDashboardFilters for block filteri |
| `component::FarmList` | uses | `hook::useFarms` | FarmList uses useDeleteFarm mutation hook |
| `component::FarmDetail` | uses | `hook::useFarms` | FarmDetail uses useFarm, useFarmSummary, useFarmBlocks hooks |
| `component::CompactBlockCard` | uses | `hook::useBlockActions` | CompactBlockCard uses useBlockActions for quick transitions |
| `component::FarmAnalyticsModal` | uses | `hook::useFarmAnalytics` | FarmAnalyticsModal uses useFarmAnalytics hook |
| `component::BlockAnalyticsModal` | uses | `hook::useBlockAnalytics` | BlockAnalyticsModal uses useBlockAnalytics hook |
| `component::GlobalFarmAnalyticsModal` | uses | `hook::useGlobalAnalytics` | GlobalFarmAnalyticsModal uses useGlobalAnalytics hook |
| `component::FarmAIChat` | uses | `hook::useFarmAIChat` | FarmAIChat uses useFarmAIChat hook |
| `component::AIAnalyticsChat` | uses | `hook::useAIAnalytics` | AIAnalyticsChat uses useAIAnalytics hook |
| `component::CreateFarmModal` | uses | `hook::useMapDrawing` | CreateFarmModal uses useMapDrawing for boundary drawing |
| `component::CreateFarmModal` | uses | `hook::useUnsavedChanges` | CreateFarmModal uses useUnsavedChanges for form dirty state |
| `component::CreateBlockModal` | uses | `hook::useMapDrawing` | CreateBlockModal uses useMapDrawing for boundary drawing |
| `page::PlantDataLibrary` | uses | `store::useAuthStore` | PlantDataLibrary uses useAuthStore |
| `page::Login` | uses | `store::useAuthStore` | Login uses useAuthStore for login action |
| `page::Login` | uses | `hook::usePageVisibility` | Login uses usePageVisibility |
| `page::Dashboard` | uses | `store::useDashboardStore` | Dashboard uses useDashboardStore |
| `component::ProtectedRoute` | uses | `store::useAuthStore` | ProtectedRoute uses useAuthStore to check auth |
| `component::MFARouteGuards` | uses | `store::useAuthStore` | MFARouteGuards uses useAuthStore to check MFA state |
| `component::MFARouteGuards` | uses | `hook::useMFA` | MFARouteGuards imports getCachedVerifyState from useMFA |
| `component::ToastContainer` | uses | `store::useToastStore` | ToastContainer uses useToastStore |
| `component::MainLayout` | uses | `store::useAuthStore` | MainLayout uses useAuthStore for user info |
| `farm_manager.api.v1.tasks.router` | uses | `farm_manager.models.farm_task.FarmTaskWithDetails` | line 12: imports FarmTaskWithDetails as response model for l |
| `farm_manager.services.task.task_repository._enrich_tasks_with_block_farm` | uses | `farm_manager.models.farm_task.FarmTaskWithDetails` | line 60: FarmTaskWithDetails(**task.model_dump(), blockCode= |
| `farm_manager.models.farm_task.FarmTask` | uses | `farm_manager.models.farm_task.TaskData` | taskData: TaskData field |
| `farm_manager.models.farm_task.TaskData` | uses | `farm_manager.models.farm_task.HarvestEntry` | harvestEntries: List[HarvestEntry] |
| `farm_manager.models.farm_task.TaskData` | uses | `farm_manager.models.farm_task.HarvestTotal` | totalHarvest: Optional[HarvestTotal] |
| `frontend.components.operations.HarvestEntryModal` | uses | `frontend.types.tasks.TaskWithDetails` | reads blockCode/blockName/targetCropName/actualPlantCount/ex |
| `frontend.components.operations.HarvestEntryModal` | uses | `frontend.utils.inputGuards.positiveNumberInputProps` | spreads positiveNumberInputProps onto harvest quantity input |
| `frontend.components.farm.BlockHarvestEntryModal` | uses | `frontend.utils.inputGuards.positiveNumberInputProps` | spreads positiveNumberInputProps onto harvest quantity input |
