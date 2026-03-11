# Database Map

> Generated: 2026-02-24 10:11 UTC  
> Source: MongoDB `mapper_nodes` (node_type=db_model, layer=model)

## Overview

A64 Core Platform uses MongoDB 7.0 as primary database.
This map covers all collections, document schemas, and inter-collection relationships.

**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md)

## Collections by Module (50 models)

### Module: `ai_analytics`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `ChatQueryResponse` | `src/modules/ai_analytics/models/chat.py:110` | AI chat request/response models with query info, visualization suggestions, cost info. | ChatQueryRequest, ChatQueryResponse, SchemaResponse |
| `ai_query_log` | `src/services/database.py` | MongoDB collection: ai_query_log - tracks AI query usage and costs (Vertex AI) |

### Module: `core`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `DashboardConfig` | `src/models/dashboard.py:144` | Core dashboard widget models for configurable dashboard layouts. | ChartWidgetData, StatWidgetData, DashboardConfig, CCMWidget |
| `ModuleConfig` | `src/models/module.py:46` | Module management models: config, status, health, audit log. | ModuleStatus, ModuleHealth, ModuleConfig, ModuleInDB |
| `UserRole` | `src/models/user.py:15` | Core user models: role enum, registration, authentication tokens, MFA. | UserRole, UserBase, UserCreate, UserResponse, TokenPayload, UserInDB |
| `admin_audit_log` | `src/services/database.py` | MongoDB collection: admin_audit_log - audit trail for admin actions (role changes, status updates) |
| `installed_modules` | `src/services/database.py` | MongoDB collection: installed_modules - tracks installed platform modules |
| `mfa_audit_log` | `src/services/database.py` | MongoDB collection: mfa_audit_log - audit trail for MFA enable/disable/verify actions |
| `mfa_backup_codes` | `src/services/database.py` | MongoDB collection: mfa_backup_codes - stores hashed MFA backup codes |
| `mfa_pending_tokens` | `src/services/auth_service.py` | MongoDB collection: mfa_pending_tokens - temporary tokens during MFA login flow |
| `module_audit_log` | `src/services/database.py` | MongoDB collection: module_audit_log - audit trail for module install/uninstall operations |
| `refresh_tokens` | `src/services/database.py` | MongoDB collection: refresh_tokens - stores JWT refresh tokens with rotation |
| `user_mfa` | `src/services/database.py` | MongoDB collection: user_mfa - stores MFA secrets and TOTP configuration |
| `users` | `src/services/database.py` | MongoDB collection: users - stores user accounts, auth info, MFA settings |
| `verification_tokens` | `src/services/database.py` | MongoDB collection: verification_tokens - stores email verification and password reset tokens |

### Module: `crm`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Customer` | `src/modules/crm/models/customer.py:68` | Customer model with type, status, address, and contact info. | Customer, CustomerCreate, CustomerType, CustomerStatus |
| `customers` | `src/modules/crm/services/customer/customer_repository.py` | MongoDB collection: customers - CRM customer records (individual and business) |

### Module: `farm_manager`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Block` | `src/modules/farm_manager/models/block.py:244` | Block model with status lifecycle, KPI, IoT controller, virtual crop support. | Block, BlockCreate, BlockUpdate, BlockStatus, BlockKPI, IoTController |
| `BlockAlert` | `src/modules/farm_manager/models/block_alert.py:72` | Block alert model with severity, status, category, and comments. | BlockAlert, BlockAlertCreate, AlertSeverity, AlertStatus |
| `BlockArchive` | `src/modules/farm_manager/models/block_archive.py:28` | Archive record for completed block cycles with yield and alert summaries. | BlockArchive, BlockArchiveAnalytics |
| `BlockHarvest` | `src/modules/farm_manager/models/block_harvest.py:61` | Harvest record model with quality grades and metadata. | BlockHarvest, BlockHarvestCreate, QualityGrade |
| `CurrentWeather` | `src/modules/farm_manager/models/weather.py:78` | Weather models: current conditions, agricultural forecast, cache entries. | CurrentWeather, AgriWeatherData, WeatherCacheEntry |
| `DashboardSummary` | `src/modules/farm_manager/models/dashboard.py:108` | Dashboard summary models with block states, harvest data, and farming year context. | DashboardSummary, DashboardResponse, DashboardSummaryResponse |
| `Farm` | `src/modules/farm_manager/models/farm.py:71` | Farm Pydantic model with location, boundary, metadata, and farmId. | Farm, FarmCreate, FarmUpdate, FarmBase |
| `FarmAnalyticsResponse` | `src/modules/farm_manager/models/farm_analytics.py:93` | Farm analytics response models: aggregated metrics, state breakdown, trends. | FarmAnalyticsResponse, AggregatedMetrics, StateBreakdown |
| `FarmTask` | `src/modules/farm_manager/models/farm_task.py:180` | Farm task model with type, priority, status, and harvest entry support. | FarmTask, FarmTaskCreate, TaskType, TaskStatus, HarvestEntry |
| `GlobalAnalyticsResponse` | `src/modules/farm_manager/models/global_analytics.py:79` | Global analytics response aggregating across all farms. | GlobalAnalyticsResponse, GlobalAggregatedMetrics |
| `HarvestInventory` | `src/modules/farm_manager/models/inventory.py:397` | Comprehensive inventory models: harvest, input, asset, waste types with movements and transfers. | HarvestInventory, InputInventory, AssetInventory, WasteInventory, InventoryMovem |
| `PlantData` | `src/modules/farm_manager/models/plant_data.py:101` | Simple plant data model (legacy format). | PlantData, PlantDataCreate |
| `PlantDataEnhanced` | `src/modules/farm_manager/models/plant_data_enhanced.py:441` | Enhanced plant library with growth cycles, fertigation, environmental requirements. | PlantDataEnhanced, PlantDataEnhancedCreate, GrowthCycleDuration, FertigationSche |
| `alerts` | `src/modules/farm_manager/services/database.py` | MongoDB collection: alerts - block alerts with severity, status, and resolution |
| `block_archives` | `src/modules/farm_manager/services/database.py` | MongoDB collection: block_archives - archived growing cycles for historical reference |
| `block_cycles` | `src/modules/farm_manager/services/database.py` | MongoDB collection: block_cycles - historical growing cycles for blocks |
| `block_harvests` | `src/modules/farm_manager/services/database.py` | MongoDB collection: block_harvests - harvest records per block with farming year |
| `blocks` | `src/modules/farm_manager/services/database.py` | MongoDB collection: blocks - stores farm blocks (physical and virtual) with state machine |
| `daily_harvests` | `src/modules/farm_manager/services/database.py` | MongoDB collection: daily_harvests - individual daily harvest entries |
| `farm_assignments` | `src/modules/farm_manager/services/database.py` | MongoDB collection: farm_assignments - maps users to farms for access control |
| `farm_tasks` | `src/modules/farm_manager/services/task/task_repository.py` | MongoDB collection: farm_tasks - operations task manager for farming activities |
| `farmer_assignments` | `src/modules/farm_manager/services/task/task_service.py` | MongoDB collection: farmer_assignments - assigns farmers/workers to specific farms |
| `farms` | `src/modules/farm_manager/services/farm/farm_repository.py` | MongoDB collection: farms - stores farm documents with location, manager, and metadata |
| `harvests` | `src/modules/farm_manager/services/database.py` | MongoDB collection: harvests - aggregated harvest summaries |
| `inventory_asset` | `src/modules/farm_manager/services/database.py` | MongoDB collection: inventory_asset - farm equipment and asset tracking |
| `inventory_harvest` | `src/modules/farm_manager/services/database.py` | MongoDB collection: inventory_harvest - harvest inventory items with quality grades |
| `inventory_input` | `src/modules/farm_manager/services/database.py` | MongoDB collection: inventory_input - farm input supplies (seeds, fertilizer, chemicals) |
| `inventory_movements` | `src/modules/farm_manager/services/database.py` | MongoDB collection: inventory_movements - tracks inventory transfers and usage |
| `plant_data` | `src/modules/farm_manager/services/plant_data/plant_data_repository.py` | MongoDB collection: plant_data - simple plant catalog schema |
| `plant_data_enhanced` | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py` | MongoDB collection: plant_data_enhanced - comprehensive plant library with growth cycles, farm type compatibility |
| `plantings` | `src/modules/farm_manager/services/planting/planting_repository.py` | MongoDB collection: plantings - stores planting plans with block assignments |
| `products` | `src/modules/farm_manager/services/database.py` | MongoDB collection: products - master product catalog for inventory |
| `stock_inventory` | `src/modules/farm_manager/services/database.py` | MongoDB collection: stock_inventory - farm stock/harvest inventory for FIFO tracking |
| `system_config` | `src/modules/farm_manager/services/config_service.py` | MongoDB collection: system_config - stores farming year config and spacing standards |
| `weather_cache` | `src/modules/farm_manager/services/weather/weather_cache_service.py` | MongoDB collection: weather_cache - caches WeatherBit API responses |

### Module: `hr`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Contract` | `src/modules/hr/models/contract.py:59` | Employment contract model with type, status, salary. | Contract, ContractCreate, ContractType |
| `Employee` | `src/modules/hr/models/employee.py:116` | Employee model with Arabic name support, Emirates ID, emergency contacts. | Employee, EmployeeCreate, EmployeeStatus |
| `employee_contracts` | `src/modules/hr/services/employee/contract_repository.py` | MongoDB collection: employee_contracts - employment contract records |
| `employee_insurance` | `src/modules/hr/services/employee/insurance_repository.py` | MongoDB collection: employee_insurance - employee insurance policy records |
| `employee_performance` | `src/modules/hr/services/employee/performance_repository.py` | MongoDB collection: employee_performance - performance review records |
| `employee_visas` | `src/modules/hr/services/employee/visa_repository.py` | MongoDB collection: employee_visas - visa and work permit tracking (UAE) |
| `employees` | `src/modules/hr/services/employee/employee_repository.py` | MongoDB collection: employees - HR employee records with Arabic name support |

### Module: `logistics`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Shipment` | `src/modules/logistics/models/shipment.py:76` | Shipment model with cargo items, tracking, and order assignment. | Shipment, ShipmentCreate, ShipmentStatus, CargoItem |
| `routes` | `src/modules/logistics/services/logistics/route_repository.py` | MongoDB collection: routes - delivery route definitions with stops |
| `shipments` | `src/modules/logistics/services/logistics/shipment_repository.py` | MongoDB collection: shipments - shipment tracking records |
| `vehicles` | `src/modules/logistics/services/logistics/vehicle_repository.py` | MongoDB collection: vehicles - fleet vehicle records with maintenance tracking |

### Module: `marketing`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Campaign` | `src/modules/marketing/models/campaign.py:67` | Marketing campaign model with status, metrics, and channel assignments. | Campaign, CampaignCreate, CampaignStatus, CampaignMetrics |
| `marketing_budgets` | `src/modules/marketing/services/marketing/budget_repository.py` | MongoDB collection: marketing_budgets - marketing budget allocations |
| `marketing_campaigns` | `src/modules/marketing/services/marketing/campaign_repository.py` | MongoDB collection: marketing_campaigns - marketing campaign records |
| `marketing_channels` | `src/modules/marketing/services/marketing/channel_repository.py` | MongoDB collection: marketing_channels - marketing channel definitions |
| `marketing_events` | `src/modules/marketing/services/marketing/event_repository.py` | MongoDB collection: marketing_events - marketing event records |

### Module: `sales`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `ReturnOrder` | `src/modules/sales/models/return_order.py:122` | Return order model with reason, condition, restocking support. | ReturnOrder, ReturnOrderCreate, ReturnReason, ReturnCondition |
| `SalesOrder` | `src/modules/sales/models/sales_order.py:102` | Sales order model with line items, shipping address, payment status. | SalesOrder, SalesOrderCreate, SalesOrderStatus, PaymentStatus |
| `harvest_inventory` | `src/modules/sales/services/sales/inventory_repository.py` | MongoDB collection: harvest_inventory - sales module harvest inventory with quality grades |
| `purchase_orders` | `src/modules/sales/services/sales/purchase_order_repository.py` | MongoDB collection: purchase_orders - purchase order records from suppliers |
| `return_orders` | `src/modules/sales/services/sales/return_service.py` | MongoDB collection: return_orders - customer return/refund order records |
| `sales_orders` | `src/modules/sales/services/sales/order_repository.py` | MongoDB collection: sales_orders - sales order records with items and payment status |

## Service → Collection Access

| Service | Access | Collection | Context |
|---------|--------|------------|---------|
| `farm_manager.service.FarmAnalyticsService` | reads_from | `farm_manager.service.BlockRepository` | FarmAnalyticsService reads block data for analytics calculations. |
| `farm_manager.service.FarmAnalyticsService` | reads_from | `farm_manager.service.HarvestRepository` | FarmAnalyticsService reads harvest data for yield analytics. |
| `farm_manager.service.GlobalAnalyticsService` | reads_from | `farm_manager.service.FarmRepository` | GlobalAnalyticsService reads farm list to iterate across all farms. |
| `farm_manager.service.FarmAIChatService` | reads_from | `core.config.Settings` | FarmAIChatService reads GOOGLE_CLOUD_PROJECT, VERTEX_AI_MODEL, etc. from setting |
| `ai_analytics.service.GeminiService` | reads_from | `core.config.Settings` | GeminiService reads VERTEX_AI_MODEL and GOOGLE_CLOUD_PROJECT from settings. |
| `FarmRepository` | reads_from | `collection_farms` | self.collection_name = 'farms' |
| `BlockRepository` | reads_from | `collection_blocks` | db.blocks.find/insert/update |
| `PlantDataRepository` | reads_from | `collection_plant_data` | db.plant_data.find/insert/update |
| `PlantDataEnhancedRepository` | reads_from | `collection_plant_data_enhanced` | COLLECTION = 'plant_data_enhanced' |
| `PlantingRepository` | reads_from | `collection_plantings` | farm_db.db.plantings.find/insert |
| `HarvestRepository` | reads_from | `collection_block_harvests` | db.block_harvests |
| `AlertRepository` | reads_from | `collection_alerts` | db.alerts |
| `ArchiveRepository` | reads_from | `collection_block_archives` | db.block_archives |
| `TaskRepository` | reads_from | `collection_farm_tasks` | db.farm_tasks.find/insert/update |
| `ConfigService` | reads_from | `collection_system_config` | COLLECTION_NAME = 'system_config' |
| `FarmingYearService` | reads_from | `collection_system_config` | COLLECTION_NAME = 'system_config' |
| `WeatherCacheService` | reads_from | `collection_weather_cache` | COLLECTION_NAME = 'weather_cache' |
| `CostTrackingService` | reads_from | `collection_ai_query_log` | self.collection = self.db['ai_query_log'] |
| `AuthService` | reads_from | `collection_users` | db.users.find_one/insert_one/update_one |
| `AuthService` | reads_from | `collection_refresh_tokens` | db.refresh_tokens.find_one/insert_one/update_one |
| `AuthService` | reads_from | `collection_mfa_pending_tokens` | db.mfa_pending_tokens.insert_one/find_one/update_one |
| `UserService` | reads_from | `collection_users` | db.users.find_one/count_documents/update_one |
| `MfaService` | reads_from | `collection_users` | db.users.find_one/update_one (MFA fields) |
| `EmployeeRepository` | reads_from | `collection_employees` | self.collection_name = 'employees' |
| `ContractRepository` | reads_from | `collection_employee_contracts` | self.collection_name = 'employee_contracts' |
| `VisaRepository` | reads_from | `collection_employee_visas` | self.collection_name = 'employee_visas' |
| `InsuranceRepository` | reads_from | `collection_employee_insurance` | self.collection_name = 'employee_insurance' |
| `PerformanceRepository` | reads_from | `collection_employee_performance` | self.collection_name = 'employee_performance' |
| `CustomerRepository` | reads_from | `collection_customers` | self.collection_name = 'customers' |
| `OrderRepository` | reads_from | `collection_sales_orders` | self.collection_name = 'sales_orders' |
| `InventoryRepository` | reads_from | `collection_harvest_inventory` | self.collection_name = 'harvest_inventory' |
| `PurchaseOrderRepository` | reads_from | `collection_purchase_orders` | self.collection_name = 'purchase_orders' |
| `ReturnService` | reads_from | `collection_return_orders` | self.collection_name = 'return_orders' |
| `VehicleRepository` | reads_from | `collection_vehicles` | self.collection_name = 'vehicles' |
| `RouteRepository` | reads_from | `collection_routes` | self.collection_name = 'routes' |
| `ShipmentRepository` | reads_from | `collection_shipments` | self.collection_name = 'shipments' |
| `CampaignRepository` | reads_from | `collection_marketing_campaigns` | self.collection_name = 'marketing_campaigns' |
| `BudgetRepository` | reads_from | `collection_marketing_budgets` | self.collection_name = 'marketing_budgets' |
| `ChannelRepository` | reads_from | `collection_marketing_channels` | self.collection_name = 'marketing_channels' |
| `EventRepository` | reads_from | `collection_marketing_events` | self.collection_name = 'marketing_events' |
| `farm_manager.service.FarmRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | FarmRepository reads/writes 'farms' collection via farm_db. |
| `farm_manager.service.BlockRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | BlockRepository reads/writes 'blocks' collection via farm_db. |
| `farm_manager.service.HarvestRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | HarvestRepository reads/writes 'block_harvests' collection via farm_db. |
| `farm_manager.service.AlertRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | AlertRepository reads/writes 'block_alerts' collection via farm_db. |
| `farm_manager.service.ArchiveRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | ArchiveRepository reads/writes 'block_archives' collection via farm_db. |
| `farm_manager.service.TaskRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | TaskRepository reads/writes 'farm_tasks' collection via farm_db. |
| `hr.service.EmployeeRepository` | stores_in | `hr.service.HRDatabaseManager` | EmployeeRepository reads/writes 'employees' collection via hr_db. |
| `crm.service.CustomerRepository` | stores_in | `crm.service.CRMDatabaseManager` | CustomerRepository reads/writes 'customers' collection via crm_db. |
| `sales.service.OrderRepository` | stores_in | `sales.service.SalesDatabaseManager` | OrderRepository reads/writes 'sales_orders' collection via sales_db. |
| `logistics.service.ShipmentRepository` | stores_in | `logistics.service.LogisticsDatabaseManager` | ShipmentRepository reads/writes 'shipments' collection via logistics_db. |
