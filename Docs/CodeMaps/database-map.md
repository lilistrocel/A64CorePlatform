# Database Map

> Generated: 2026-08-07 08:14 UTC  
> Source: MongoDB `mapper_nodes` (node_type=db_model, layer=model)

## Overview

A64 Core Platform uses MongoDB 7.0 as primary database.
This map covers all collections, document schemas, and inter-collection relationships.

**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md)

## Collections by Module (58 models)

### Module: `ai_analytics`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `ChatQueryResponse` | `src/modules/ai_analytics/models/chat.py:110` | AI chat request/response models with query info, visualization suggestions, cost info. | ChatQueryRequest, ChatQueryResponse, SchemaResponse |
| `ai_query_log` | `src/services/database.py` | MongoDB collection: ai_query_log - tracks AI query usage and costs (Vertex AI) |

### Module: `core`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `ChartWidgetData / StatWidgetData / WidgetDataResponse` | `src/models/dashboard.py:17` | CCM Dashboard widget data shapes: chart widgets (line/bar/pie with multi-series support) and stat widgets (value + trend), plus data-source descriptors (module vs. system-metric origin) and the bulk-fetch request/response envelope used by POST /dashboard/widgets/bulk. | ChartSeries, ChartWidgetData, StatWidgetData, ModuleDataSource, SystemDataSource |
| `DeploymentSettingItem / DeploymentSettingsResponse` | `src/models/deployment_settings.py:15` | NEW TODAY. Request/response schemas for GET/PATCH /api/v1/admin/deployment-settings. DeploymentSettingItem carries `value` for ordinary keys but only `isSet`/`maskedHint` (last 4 chars) for the two Cloudflare secrets (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD) — there is deliberately no field or endpoint that returns them in full. DeploymentSettingsPatchRequest requires `currentPassword` (guardrail c in deployment_settings_service.update) alongside the `changes` dict of only the keys being modified. | DeploymentSettingItem, DeploymentSettingsResponse, DeploymentSettingsPatchReques |
| `IndustryType / Division / DivisionResponse` | `src/models/division.py:15` | IndustryType enum (vegetable_fruits, mushroom) plus the full Division CRUD schema family. Division is scoped to an organizationId and carries a unique-per-org divisionCode. DivisionSelectResponse is returned by POST /divisions/{id}/select confirming the new active division. | IndustryType, DivisionBase, DivisionCreate, DivisionUpdate, Division, DivisionRe |
| `ModuleConfig / ModuleStatusResponse / PortAllocation` | `src/models/module.py:46` | Docker Compose module-management schema family backing core.api.modules and core.service.module_manager/port_manager: install config (image, license key, resource limits, security profile), runtime status/health enums, audit log entries, and the port-allocation range/registry types used by PortManager. | ModuleStatus, ModuleHealth, ModuleConfig, ModuleInDB, ModuleResponse, ModuleList |
| `Organization / OrganizationModules / PublicInfoPageConfig` | `src/models/organization.py:14` | Top-level tenancy model. OrganizationModules (Wave 0 T-059) holds per-tenant module toggles: financeEnabled (hides finance UI + gates the outbox writer) and publicInfoPage (T-804 — PublicInfoPageConfig: what a scanned genetics label may reveal publicly; every show* flag — showOperatorName/showMediumIngredients/showProtocolSteps/showFacilityName — defaults False as a deliberate privacy/trade-secret decision, while `enabled` defaults True so the page works out of the box). PublicInfoPageConfigUpdate is a fully-optional partial-update twin of PublicInfoPageConfig specifically so OrganizationService.update_modules can merge one changed flag (e.g. {"enabled": false}) onto the stored config without resetting sibling privacy flags to their model defaults. Read directly by genetics.api.public to gate the anonymous public label-info response shape; ignored entirely by the authenticated shape. | PublicInfoPageConfig, PublicInfoPageConfigUpdate, OrganizationModules, Organizat |
| `UserMFA / MFABackupCode / MFAAuditLog` | `src/models/mfa.py:13` | Database-schema models for the user_mfa / mfa_backup_codes / mfa_audit_log collections that core.service.database indexes but core.service.mfa_service does not currently use (that service keeps all MFA state inline on the users document instead) — this file appears to be a parallel/legacy schema design for a separate-collection MFA store. MFALoginRequired (imported by core.api.auth as the response type for a pending MFA challenge) is the one type from this file actually wired into the live auth flow today. | MFAMethod, MFAStatus, MFASetupResponse, MFAVerifyRequest, MFAEnableRequest, MFAD |
| `UserRole / UserCreate / UserResponse / TokenResponse / MFA* models` | `src/models/user.py:15` | Core user/auth Pydantic models. UserRole enum includes finance (accountant/finance_admin/auditor) and purchasing (procurement_officer/procurement_manager) roles alongside the base hierarchy. UserCreate/PasswordResetConfirm enforce password complexity (upper/lower/digit/special, 8-128 chars) via validators. UserResponse carries two fields added TODAY: authProvider ('password' | 'cloudflare_access', defaults 'password' for pre-existing accounts) and nameAutoDerived (True for Cloudflare-JIT-provisioned users whose name was guessed from the email local-part, cleared the moment the user edits either name field). TokenResponse/MFA* models back every auth.py and admin.py endpoint response shape. | UserRole, UserBase, UserCreate, UserUpdate, UserOrganizationAssignment, UserResp |
| `platform_settings` | `src/services/deployment_settings_service.py` | MongoDB collection: platform_settings - singleton document (_id: 'deployment') holding deployment-wide config: PUBLIC_BASE_URL/FRONTEND_URL identity and CF_ACCESS_* Cloudflare Access settings. Written only via deployment_settings_service.update(); resolution order for any managed key is env var -> this document -> unset (env acts as a lock making the DB value non-editable). |

### Module: `crm`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Customer` | `src/modules/crm/models/customer.py:68` | Customer model with type, status, address, and contact info. | Customer, CustomerCreate, CustomerType, CustomerStatus |
| `customers` | `src/modules/crm/services/customer/customer_repository.py` | MongoDB collection: customers - CRM customer records (individual and business) |

### Module: `farm_manager`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Block` | `src/modules/farm_manager/models/block.py:244` | Block model with status lifecycle, KPI, IoT controller, virtual crop support. Stamps productMotherId + productName from the planted variety's PlantMother at planting. | Block, BlockCreate, BlockUpdate, BlockStatus, BlockKPI, IoTController |
| `BlockAlert` | `src/modules/farm_manager/models/block_alert.py:72` | Block alert model with severity, status, category, and comments. | BlockAlert, BlockAlertCreate, AlertSeverity, AlertStatus |
| `BlockArchive` | `src/modules/farm_manager/models/block_archive.py:28` | Archive record for completed block cycles with yield and alert summaries. Carries productMotherId + productName copied from the block at archive time. | BlockArchive, BlockArchiveAnalytics |
| `BlockHarvest` | `src/modules/farm_manager/models/block_harvest.py:61` | Harvest record model with quality grades and metadata. | BlockHarvest, BlockHarvestCreate, QualityGrade |
| `CurrentWeather` | `src/modules/farm_manager/models/weather.py:78` | Weather models: current conditions, agricultural forecast, cache entries. | CurrentWeather, AgriWeatherData, WeatherCacheEntry |
| `DashboardSummary` | `src/modules/farm_manager/models/dashboard.py:108` | Dashboard summary models with block states, harvest data, and farming year context. | DashboardSummary, DashboardResponse, DashboardSummaryResponse |
| `Farm` | `src/modules/farm_manager/models/farm.py:71` | Farm Pydantic model with location, boundary, metadata, and farmId. | Farm, FarmCreate, FarmUpdate, FarmBase |
| `FarmAnalyticsResponse` | `src/modules/farm_manager/models/farm_analytics.py:93` | Farm analytics response models: aggregated metrics, state breakdown, trends. | FarmAnalyticsResponse, AggregatedMetrics, StateBreakdown |
| `FarmTask` | `src/modules/farm_manager/models/farm_task.py:180` | Complete farm task document stored in the farm_tasks collection. Includes taskData (harvestEntries, totalHarvest, notes, photoUrls), status, completion tracking, divisionId/organizationId scoping. | FarmTask |
| `FarmTask` | `src/modules/farm_manager/models/farm_task.py:180` | Farm task model with type, priority, status, and harvest entry support. | FarmTask, FarmTaskCreate, TaskType, TaskStatus, HarvestEntry |
| `FarmTaskCreate` | `src/modules/farm_manager/models/farm_task.py:160` | Request schema for creating a new farm task (farmId, blockId, taskType, scheduledDate, priority, assignedTo, triggerStateChange). | FarmTaskCreate |
| `FarmTaskListResponse` | `src/modules/farm_manager/models/farm_task.py:288` | Paginated list response wrapper for FarmTask. | FarmTaskListResponse |
| `FarmTaskUpdate` | `src/modules/farm_manager/models/farm_task.py:279` | Partial-update schema for tasks (scheduledDate, dueDate, status, priority, description). | FarmTaskUpdate |
| `FarmTaskWithDetails` | `src/modules/farm_manager/models/farm_task.py:257` | v1.11.0 NEW: FarmTask extended with joined block/farm context. Optional fields: blockCode, blockName, targetCrop, targetCropName, actualPlantCount, expectedYieldKg (from blocks); farmCode, farmName (from farms). Used by Operations task UI and harvest-entry modals so clients don't need follow-up fetches. | FarmTaskWithDetails |
| `GlobalAnalyticsResponse` | `src/modules/farm_manager/models/global_analytics.py:79` | Global analytics response aggregating across all farms. | GlobalAnalyticsResponse, GlobalAggregatedMetrics |
| `HarvestEntry` | `src/modules/farm_manager/models/farm_task.py:49` | Single harvest entry attached to a daily_harvest task (entryId, userId, userEmail, timestamp, quantity, grade, notes). | HarvestEntry |
| `HarvestEntryCreate` | `src/modules/farm_manager/models/farm_task.py:243` | Request schema for adding a harvest entry (quantity > 0, grade, optional notes). | HarvestEntryCreate |
| `HarvestGrade` | `src/modules/farm_manager/models/farm_task.py:40` | Enum: A, B, C, D, Waste. | HarvestGrade |
| `HarvestInventory` | `src/modules/farm_manager/models/inventory.py:397` | Comprehensive inventory models: harvest, input, asset, waste types with movements and transfers. | HarvestInventory, InputInventory, AssetInventory, WasteInventory, InventoryMovem |
| `HarvestTotal` | `src/modules/farm_manager/models/farm_task.py:73` | Aggregated harvest totals (totalQuantity, gradeBreakdown per grade, contributors, entryCount). | HarvestTotal |
| `PlantData` | `src/modules/farm_manager/models/plant_data.py:101` | Simple plant data model (legacy format). | PlantData, PlantDataCreate |
| `PlantDataEnhanced` | `src/modules/farm_manager/models/plant_data_enhanced.py:441` | Enhanced plant library with growth cycles, fertigation, environmental requirements. Now variety-aware: carries motherPlantId + varietyName linking each row to its PlantMother. | PlantDataEnhanced, PlantDataEnhancedCreate, GrowthCycleDuration, FertigationSche |
| `PlantMother` | `src/modules/farm_manager/models/plant_mother.py:72` | Plant Library product/folder: plantName, scientificName, plantType. Groups variety rows (PlantDataEnhanced) under one mother; varieties reference it via motherPlantId. | PlantMother, PlantMotherBase, PlantMotherCreate, PlantMotherUpdate, PlantMotherW |
| `TaskCompletionData` | `src/modules/farm_manager/models/farm_task.py:250` | Request schema for completing a non-harvest task (notes, photoUrls, triggerTransition for Phase 2 block state change). | TaskCompletionData |
| `TaskData` | `src/modules/farm_manager/models/farm_task.py:106` | Task-specific completion data: harvestEntries list, totalHarvest, notes, photoUrls. Validators coerce None to empty list for backward compatibility. | TaskData |
| `TaskPriority` | `src/modules/farm_manager/models/farm_task.py:33` | Enum: high, medium, low. | TaskPriority |
| `TaskStatus` | `src/modules/farm_manager/models/farm_task.py:25` | Enum: pending, in_progress, completed, cancelled. | TaskStatus |
| `TaskType` | `src/modules/farm_manager/models/farm_task.py:14` | Enum: planting, fruiting_check, harvest_readiness, daily_harvest, harvest_completion, cleaning, custom. | TaskType |
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
| `plant_mothers` | `src/modules/farm_manager/services/plant_data/plant_mother_repository.py` | MongoDB collection: plant_mothers - Plant Library product/folder catalog (plantName, scientificName, plantType); each doc groups variety rows stored in plant_data_enhanced. |
| `plantings` | `src/modules/farm_manager/services/planting/planting_repository.py` | MongoDB collection: plantings - stores planting plans with block assignments |
| `products` | `src/modules/farm_manager/services/database.py` | MongoDB collection: products - master product catalog for inventory |
| `stock_inventory` | `src/modules/farm_manager/services/database.py` | MongoDB collection: stock_inventory - farm stock/harvest inventory for FIFO tracking |
| `system_config` | `src/modules/farm_manager/services/config_service.py` | MongoDB collection: system_config - stores farming year config and spacing standards |
| `weather_cache` | `src/modules/farm_manager/services/weather/weather_cache_service.py` | MongoDB collection: weather_cache - caches WeatherBit API responses |

### Module: `genetics`

| Collection/Model | File | Description |
|------------------|------|-------------|
| `Accession models` | `src/modules/genetics/models/accession.py:1` | T-800 Physical material carrying dual generation counters (cloneGeneration G, filialGeneration F) and a parents list supporting 0, 1 or 2 entries with independently nullable accessionIds for half-known ancestry. generationLabel is a computed field, never persisted. T-804: publicToken (secrets-based Crockford base32, unique, backing the public label-info route), labelledVesselCount (a high-water mark that is NEVER decremented by split — the sticker is physical and permanent, the record is not) and sourceVesselNumbers. T-805: ParentRef.vesselNo records which physical vessel of a parent batch a propagation/split was taken from — same field/shape/validation reused on ObservationBase (T-805b). | Accession, AccessionCreate, AccessionUpdate, AccessionSplit, ParentRef, StorageL |
| `Genetic line models` | `src/modules/genetics/models/line.py:1` | T-800 The named identity, spanning plants, fungi and animals. Provenance records unknown origin as a state rather than a blank field. | Line, LineCreate, LineUpdate, LineStats, LineWithStats, Provenance, Trait |
| `Genetics enumerations` | `src/modules/genetics/models/enums.py:1` | T-800 Shared vocabulary. _SEXUAL_METHODS is the single source of truth for generation numbering; PropagationMethod.reproduction_mode and .max_parents derive from it. | OrganismKind, ProvenanceType, DerivationType, VesselForm, AccessionStatus, Paren |
| `Lineage graph models` | `src/modules/genetics/models/lineage.py:1` | T-800 Flat nodes+edges response shape for the DAG, plus the linear ancestry breadcrumb with branching and unknown-origin flags. T-805: LineageEdge.kind distinguishes a propagation-derived edge from a split-derived edge, since split() copies generations/parents verbatim and is not a propagation. | LineageGraph, LineageNode, LineageEdge, AncestryChain, AncestryStep |
| `Medium recipe & batch models` | `src/modules/genetics/models/medium.py:1` | T-800 Versioned formulations plus per-pour batches. Additives are modelled apart from base ingredients so trialled elements stay queryable; batches carry ingredientsSnapshot/additivesSnapshot. | Recipe, RecipeCreate, RecipeUpdate, Batch, BatchCreate, BatchUpdate, BatchQC, In |
| `Observation models` | `src/modules/genetics/models/observation.py:1` | T-800 Dated notes with optional quantitative metrics. isNovelTrait is what makes an observation promotable into its own line. T-805b: ObservationBase.vesselNo records which physical vessel of the observed accession the note applies to — same field/shape/validation as ParentRef.vesselNo (T-805a); capture-only, not yet surfaced anywhere in the UI. | Observation, ObservationCreate, ObservationUpdate, ObservationMetrics, PromoteTr |
| `Propagation models` | `src/modules/genetics/models/propagation.py:1` | T-800 The traceability edge: method, operator, date and medium alongside the parent pointers. reproductionMode is stored so historic events survive enum changes. T-808: amendedAt/amendedBy record when/who corrected performedAt; PropagationAmend is the single-field (performedAt-only) request model, PropagationAmendResult wraps the updated event plus accessionsUpdated/accessionsSkipped counts. | PropagationEvent, PropagationCreate, PropagationTarget, PropagationResult, Propa |
| `genetic_accessions` | `src/modules/genetics/services/database.py` | MongoDB collection: genetic_accessions - physical material with dual G/F generation counters, batch quantity and parents[]. Unique on accessionId and accessionCode; parents.accessionId indexed for lineage traversal. |
| `genetic_lines` | `src/modules/genetics/services/database.py` | MongoDB collection: genetic_lines - named genetic identities (strain/variety/bloodline) across plants, fungi and animals. Unique on lineId and code; indexed on kind, parentLineId, tags. |
| `genetic_observations` | `src/modules/genetics/services/database.py` | MongoDB collection: genetic_observations - dated notes per accession with metrics, novel-trait flag and promotedToLineId back-reference. |
| `medium_batches` | `src/modules/genetics/services/database.py` | MongoDB collection: medium_batches - one document per pour, snapshotting the recipe formulation so later recipe edits never rewrite history. |
| `medium_recipes` | `src/modules/genetics/services/database.py` | MongoDB collection: medium_recipes - versioned agar/substrate formulations. additives.name and ingredients.name indexed for the experiment readout. |
| `propagation_events` | `src/modules/genetics/services/database.py` | MongoDB collection: propagation_events - the clone/cross audit edge recording method, reproduction mode, operator, date and medium batch. |

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
| `AR Credit Note models` | `src/modules/sales/models/ar_credit_notes.py:1` | Pydantic schemas for AR Credit Note + allocations (T-100.11). | ARCreditNoteCreate, ARCreditNoteUpdate, ARCreditNoteResponse, ARCreditNoteListIt |
| `AR Invoice models` | `src/modules/sales/models/ar_invoices.py:1` | Pydantic schemas for AR Invoice document, lines, totals, transitions (T-100.9a). | ARInvoiceCreate, ARInvoiceUpdate, ARInvoiceResponse, ARInvoiceListItem, ARInvoic |
| `Customer Receipt models` | `src/modules/sales/models/customer_receipts.py:1` | Pydantic schemas for Customer Receipt + allocation entries (T-100.10). | CustomerReceiptCreate, CustomerReceiptUpdate, CustomerReceiptResponse, CustomerR |
| `Delivery Note models` | `src/modules/sales/models/deliveries.py:1` | Pydantic schemas for Delivery Note document and lines (T-100.8). | DeliveryCreate, DeliveryUpdate, DeliveryResponse, DeliveryListItem, DeliveryLine |
| `Purchase Order (legacy stub)` | `src/modules/sales/models/purchase_order.py:1` | Legacy PO schemas retained for dashboard. Sales-side PO routes were removed in T-070.0; current POs are in purchasing module. | PurchaseOrder, PurchaseOrderCreate, PurchaseOrderUpdate, PurchaseOrderStatus, Pu |
| `Quote models` | `src/modules/sales/models/quotes.py:1` | Pydantic schemas for Sales Quote document, lines, totals, transitions (T-100.6). | QuoteCreate, QuoteUpdate, QuoteResponse, QuoteListItem, QuoteLineCreate, QuoteLi |
| `Return Note v2 models` | `src/modules/sales/models/returns.py:1` | Pydantic schemas for Return Note (RTN) v2 document and lines (T-100.11). | ReturnCreate, ReturnUpdate, ReturnResponse, ReturnListItem, ReturnLineCreate, Re |
| `Return Order (legacy) models` | `src/modules/sales/models/return_order.py:1` | Legacy return-order schemas with reason/condition enums and process-return payloads. | ReturnOrder, ReturnOrderCreate, ReturnOrderUpdate, ReturnStatus, ReturnReason, R |
| `Return Request models` | `src/modules/sales/models/return_requests.py:1` | Pydantic schemas for Return Request (RMA) document and lines (T-100.11). | ReturnRequestCreate, ReturnRequestUpdate, ReturnRequestResponse, ReturnRequestLi |
| `Sales Order (legacy) models` | `src/modules/sales/models/sales_order.py:1` | Legacy Pydantic schemas for sales_orders collection. Status enum, allocation, delete preview, report-return flows. | SalesOrder, SalesOrderCreate, SalesOrderUpdate, SalesOrderStatus, PaymentStatus, |
| `Sales Order v2 models` | `src/modules/sales/models/sales_orders.py:1` | Pydantic schemas for Sales Order v2 (T-100.7) including credit-check snapshot and from-quote request. | SalesOrderCreate, SalesOrderUpdate, SalesOrderResponse, SalesOrderListItem, Sale |

## Service → Collection Access

| Service | Access | Collection | Context |
|---------|--------|------------|---------|
| `farm_manager.service.FarmAnalyticsService` | reads_from | `farm_manager.service.BlockRepository` | FarmAnalyticsService reads block data for analytics calculations. |
| `farm_manager.service.FarmAnalyticsService` | reads_from | `farm_manager.service.HarvestRepository` | FarmAnalyticsService reads harvest data for yield analytics. |
| `farm_manager.service.GlobalAnalyticsService` | reads_from | `farm_manager.service.FarmRepository` | GlobalAnalyticsService reads farm list to iterate across all farms. |
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
| `genetics.service.line_service` | reads_from | `collection_genetic_accessions` | _bulk_stats aggregates accession rollups per line. |
| `genetics.service.medium_service` | reads_from | `collection_genetic_accessions` | find_accessions_by_additive walks additive -> batches -> accessions. |
| `genetics.service.lineage_service` | reads_from | `collection_genetic_accessions` | Breadth-first traversal over parents.accessionId, one query per depth level. |
| `genetics.service.dashboard_service` | reads_from | `collection_genetic_accessions` | Counts live material, vessels and the senescence watch list. |
| `genetics.service.maintenance_service` | reads_from | `collection_genetic_lines` | _existing_line_ids builds the reference set every other collection's lineId is d |
| `core.api.health` | reads_from | `core.service.database` | mongodb.health_check() for /health and /ready |
| `core.api.dashboard` | reads_from | `collection_farms` | farm count/active aggregation |
| `core.api.dashboard` | reads_from | `collection_blocks` | block count + state breakdown aggregation |
| `core.api.dashboard` | reads_from | `collection_employees` | employee count/active aggregation |
| `core.api.dashboard` | reads_from | `collection_customers` | customer count/active aggregation |
| `core.api.dashboard` | reads_from | `collection_sales_orders` | order count + status breakdown aggregation |
| `core.api.dashboard` | reads_from | `collection_vehicles` | vehicle count + status breakdown aggregation |
| `core.api.dashboard` | reads_from | `collection_shipments` | shipment count + status breakdown aggregation |
| `core.api.dashboard` | reads_from | `collection_campaigns` | campaign count/active aggregation |
| `core.api.dashboard` | reads_from | `collection_users` | user count/active aggregation |
| `core.api.modules` | reads_from | `collection_module_audit_log` | GET /modules/audit-log paginated + filtered query |
| `core.api.organizations` | reads_from | `collection_organizations` | get_organization / list_organizations |
| `core.service.deployment_settings_service` | reads_from | `collection_users` | verify actor's current password before applying changes |
| `core.service.division_service` | reads_from | `collection_organizations` | create_division validates the parent org exists |
| `finance_bridge.tenant_flag` | reads_from | `collection_organizations` | modules.financeEnabled projection on cache miss |
| `finance_bridge.outbox_repository` | reads_from | `collection_finance_outbox` | consumer worker status-transition queries via atomic findOneAndUpdate |
| `core.service.deployment_settings_service` | reads_from | `collection_platform_settings` | db.platform_settings.find_one/update_one({'_id': 'deployment'}) |
| `PlantMotherRepository` | reads_from | `collection_plant_mothers` | PlantMotherRepository reads/writes the 'plant_mothers' collection. |
| `farm_manager.service.FarmRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | FarmRepository reads/writes 'farms' collection via farm_db. |
| `farm_manager.service.BlockRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | BlockRepository reads/writes 'blocks' collection via farm_db. |
| `farm_manager.service.HarvestRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | HarvestRepository reads/writes 'block_harvests' collection via farm_db. |
| `farm_manager.service.AlertRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | AlertRepository reads/writes 'block_alerts' collection via farm_db. |
| `farm_manager.service.ArchiveRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | ArchiveRepository reads/writes 'block_archives' collection via farm_db. |
| `farm_manager.service.TaskRepository` | stores_in | `farm_manager.service.FarmDatabaseManager` | TaskRepository reads/writes 'farm_tasks' collection via farm_db. |
| `hr.service.EmployeeRepository` | stores_in | `hr.service.HRDatabaseManager` | EmployeeRepository reads/writes 'employees' collection via hr_db. |
| `crm.service.CustomerRepository` | stores_in | `crm.service.CRMDatabaseManager` | CustomerRepository reads/writes 'customers' collection via crm_db. |
| `logistics.service.ShipmentRepository` | stores_in | `logistics.service.LogisticsDatabaseManager` | ShipmentRepository reads/writes 'shipments' collection via logistics_db. |
| `sales.service.delivery_service` | stores_in | `finance_bridge.outbox_writer` | On DRAFT->OPEN transition, publishes delivery_posted event via OutboxWriter to f |
| `sales.service.ar_invoice_service` | stores_in | `finance_bridge.outbox_writer` | On DRAFT->OPEN transition, publishes sales_invoice_posted event via OutboxWriter |
| `sales.service.customer_receipt_service` | stores_in | `finance_bridge.outbox_writer` | On DRAFT->OPEN transition, publishes customer_payment_received event via OutboxW |
| `sales.service.rtn_service` | stores_in | `finance_bridge.outbox_writer` | On DRAFT->OPEN transition, publishes return_posted event via OutboxWriter (DR In |
| `sales.service.ar_credit_note_service` | stores_in | `finance_bridge.outbox_writer` | On DRAFT->OPEN transition, publishes credit_note_posted event via OutboxWriter ( |
| `genetics.service.line_service` | stores_in | `collection_genetic_lines` | CRUD against genetic_lines. |
| `genetics.service.accession_service` | stores_in | `collection_genetic_accessions` | CRUD and split against genetic_accessions. |
| `genetics.service.propagation_service` | stores_in | `collection_propagation_events` | Writes the propagation event after its child accessions. |
| `genetics.service.propagation_service` | stores_in | `collection_genetic_accessions` | amend_event cascades a corrected performedAt to child accessions' acquiredAt whe |
| `genetics.service.medium_service` | stores_in | `collection_medium_recipes` | Recipe CRUD with version bumping on formulation change. |
| `genetics.service.medium_service` | stores_in | `collection_medium_batches` | Batch creation snapshots the recipe formulation. |
| `genetics.service.observation_service` | stores_in | `collection_genetic_observations` | CRUD against genetic_observations plus promotedToLineId back-reference. |
| `genetics.service.maintenance_service` | stores_in | `collection_genetic_accessions` | Diffs accession lineIds against existing lines; deletes the orphaned subset by e |
| `genetics.service.maintenance_service` | stores_in | `collection_propagation_events` | Diffs every referenced lineId on each propagation event; deletes the orphaned su |
| `genetics.service.maintenance_service` | stores_in | `collection_genetic_observations` | Diffs observation lineIds against existing lines; deletes the orphaned subset. |
| `genetics.service.line_service` | stores_in | `collection_genetic_accessions` | cascade_purge_line removes gathered accession ids under a purged line. |
| `genetics.service.line_service` | stores_in | `collection_propagation_events` | cascade_purge_line removes gathered propagation-event ids under a purged line. |
| `genetics.service.line_service` | stores_in | `collection_genetic_observations` | cascade_purge_line removes gathered observation ids under a purged line. |
| `core.api.main` | stores_in | `collection_users` | seed_admin() inserts/promotes the default super_admin user |
| `core.api.main` | stores_in | `collection_organizations` | seed_admin() inserts the default organization if none exists |
| `core.api.admin` | stores_in | `collection_users` | role/status/organization updates, soft delete, MFA reset |
| `core.api.admin` | stores_in | `collection_admin_audit_log` | mfa_reset audit entry |
| `core.api.users` | stores_in | `collection_users` | metadata.tutorialsSeen via $addToSet / $set |
| `core.api.organizations` | stores_in | `collection_admin_audit_log` | organization.modules.updated audit entry with before/after snapshot |
| `core.service.auth_service` | stores_in | `collection_users` | insert on register, lastLoginAt/passwordHash/isEmailVerified updates, JIT-provis |
| `core.service.auth_service` | stores_in | `collection_refresh_tokens` | insert on every login/refresh, revoke on logout/reset-password |
| `core.service.auth_service` | stores_in | `collection_verification_tokens` | email verification + password reset tokens |
| `core.service.auth_service` | stores_in | `collection_mfa_pending_tokens` | short-lived MFA challenge tokens issued by _issue_mfa_challenge |
| `core.service.deployment_settings_service` | stores_in | `collection_platform_settings` | singleton doc _id='deployment' — new today |
| `core.service.deployment_settings_service` | stores_in | `collection_admin_audit_log` | deployment_settings.updated audit entry with masked before/after |
