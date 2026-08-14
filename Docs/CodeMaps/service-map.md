# Service Map

> Generated: 2026-08-07 08:14 UTC  
> Source: MongoDB `mapper_nodes` (layer=service)

## Overview

Service layer implements business logic and orchestrates data access.
Services are injected into API endpoints via FastAPI dependency injection.

**Related Maps:** [api-map.md](api-map.md) | [database-map.md](database-map.md) | [module-map.md](module-map.md)

## Services by Module (91 total)

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
| `AuthService` | `src/services/auth_service.py:85` | auth_service, AuthService, pending_activation_exception, PEN | Registration, password login, refresh-token rotation, email verification, password reset, and MFA-aware login. Shared helpers: _issue_tokens_for_user (byte-identical token-issuance tail for every login path), _issue_mfa_challenge, pending_activation_exception (the identical 403 pending_activation shape returned by password login and Cloudflare Access login for an inactive account). login_via_cf_access (new today) takes a verified CFAccessIdentity from cf_access_service, JIT-provisions an inactive user on first sight (guarded by CF_ACCESS_JIT_PROVISION), and otherwise issues the exact same app JWT as password login — Cloudflare replaces the credential check, not the session. |
| `DashboardService` | `src/services/dashboard_service.py:20` | DashboardService | Mock/generated widget data for the CCM Dashboard (sales-trend, revenue-breakdown, user-activity charts; total-users, active-sessions, api-requests stats). get_widget_data/refresh_widget_data/get_bulk_widget_data back the /dashboard/widgets/* endpoints. No database access — data is randomly generated per call, a placeholder pending real metric wiring. |
| `DivisionService` | `src/services/division_service.py:28` | division_service, DivisionService | CRUD for divisions (scoped to an organization, mapped to an IndustryType). create_division (validates parent org exists, unique divisionCode per org), get_division, list_divisions, list_divisions_for_user (currently org-scoped only, ACL-based filtering deferred), update_division (divisionCode conflict check), select_division (persists user.defaultDivisionId so future requests context-switch automatically). |
| `MFAService` | `src/services/mfa_service.py:127` | mfa_service, MFAService, encrypt_totp_secret, decrypt_totp_s | TOTP-based MFA. TOTP secrets encrypted at rest with Fernet (PBKDF2-derived key from SECRET_KEY, 100k iterations, dedicated salt). setup_mfa (pending secret + QR code), enable_mfa (verifies code, generates 10 SHA-256-hashed backup codes), disable_mfa (requires password + TOTP/backup code), verify_mfa_code (TOTP with replay protection via mfaLastUsedCounter, falls back to backup codes), get_mfa_status, regenerate_backup_codes. All state lives on the users document (mfaSecret, mfaBackupCodes, mfaPendingSecret, etc.) despite database.py declaring separate user_mfa/mfa_backup_codes/mfa_audit_log collection indexes that this implementation does not use. |
| `ModuleManager` | `src/services/module_manager.py:127` | module_manager, ModuleManager | Docker Compose-based module lifecycle: install_module (license validation, trusted-registry image check, container creation with security profile detection/sandboxing), uninstall_module (graceful stop, container removal, NGINX route removal), get_installed_modules (paginated), get_module_status (CPU/memory/uptime via Docker stats), audit logging for every operation. Delegates port allocation to PortManager and reverse-proxy config to ProxyManager. |
| `MongoDBManager` | `src/services/database.py:18` | mongodb, MongoDBManager | Motor async MongoDB connection manager (pool size 10-50). connect()/disconnect()/health_check()/get_database() plus _create_indexes(), which declares every core index: users (email/userId unique, role, createdAt), refresh_tokens (tokenId unique, userId, TTL on expiresAt), verification_tokens (tokenId unique, userId, email, tokenType, TTL), installed_modules, module_audit_log (90-day TTL), ai_query_log, user_mfa/mfa_backup_codes/mfa_audit_log, admin_audit_log. Single global `mongodb` instance imported by every other service in this task. |
| `OrganizationService` | `src/services/organization_service.py:28` | organization_service, OrganizationService | CRUD for organizations (top-level tenancy unit). create_organization (unique slug), get_organization, list_organizations, update_organization (slug-conflict check), update_modules — Wave 0 T-059.4 + T-804 follow-up: partial update of modules.financeEnabled and modules.publicInfoPage (deep-merges the publicInfoPage patch onto the stored config plus PublicInfoPageConfig defaults so patching one flag, e.g. `enabled`, never resets a sibling privacy flag like showOperatorName). |
| `PortManager` | `src/services/port_manager.py:25` | PortManager, get_port_manager, init_port_manager | Automatic port allocation (9001-19999 range) for installed modules, backed by the port_registry MongoDB collection. allocate_ports (with rollback on partial failure), release_ports, get_module_ports, is_port_available, get_port_statistics, generate_proxy_route, parse_ports_from_config. Injected into module_manager as module_manager.port_manager during app startup (src/main.py). |
| `ProxyManager` | `src/services/proxy_manager.py:25` | ProxyManager, get_proxy_manager | Generates and manages NGINX reverse-proxy location blocks for installed modules (clean URLs instead of raw ports) — generate_module_config, create_proxy_route, remove_proxy_route, reload_nginx (via docker exec on the nginx container + config test before reload), get_module_route_url. No database access; operates on the NGINX config directory + Docker. |
| `UserService` | `src/services/user_service.py:20` | user_service, UserService | get_user_by_id/get_user_by_email (excludes soft-deleted), list_users (paginated, regex search + role/isActive filters), update_user (clears nameAutoDerived the moment a Cloudflare-JIT-provisioned user sets a real first/last name — new today), assign_organization (super_admin-only tenant assignment, partial — only overwrites divisionAccess/defaultDivisionId when explicitly supplied), delete_user (soft delete + refresh-token revocation), change_user_role, activate_user, deactivate_user (revokes refresh tokens). |
| `deployment_settings_service` | `src/services/deployment_settings_service.py` | get_resolved, get_value, update, mask_value, record_cf_acces | Resolves and updates deployment-wide config (PUBLIC_BASE_URL/FRONTEND_URL, CF_ACCESS_*). Resolution order per key: env var -> platform_settings DB doc -> unset. update() enforces 4 guardrails: CF_ACCESS_TEAM_DOMAIN validated against Cloudflare JWKS, CF_ACCESS_EXCLUSIVE requires a prior successful CF Access login, current password re-verification, and admin_audit_log write with masked values. Sole writer of the platform_settings collection. |
| `verify_cf_access_token / CFAccessIdentity` | `src/services/cf_access_service.py:1` | verify_cf_access_token, CFAccessIdentity | NEW TODAY. Cloudflare Access JWT verification — the only place that decides whether a Cf-Access-Jwt-Assertion token is genuine: fetches and caches the team's JWKS (1hr TTL, rate-limited forced refresh on unrecognized kid, monotonic clock), verifies RS256 signature + audience + issuer + expiry, and returns a CFAccessIdentity. Deliberately has no dev-bypass / skip-verification flag (explicit project rule, not an oversight). |

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
| `PlantDataEnhancedService` | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py:25` | PlantDataEnhancedService | Enhanced plant data CRUD with growth cycles, fertigation, search, clone. Now mother/variety-aware: CSV import resolves/creates PlantMother rows and stamps motherPlantId/varietyName; supports variety-create under a mother. |
| `PlantDataService` | `src/modules/farm_manager/services/plant_data/plant_data_service.py:20` | PlantDataService | Simple plant data CRUD with CSV import/export. |
| `PlantMotherService` | `src/modules/farm_manager/services/plant_data/plant_mother_service.py:33` | PlantMotherService | Plant Library mother CRUD and variety orchestration: create/list/get/update/delete mothers, list varieties, create variety for mother (delegates variety-create to PlantDataEnhancedService). |
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

### `finance_bridge`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `OutboxRepository` | `src/modules/finance_bridge/outbox_repository.py:41` | OutboxRepository | Query helpers over the finance_outbox collection for the consumer worker (finance_consumer service, outside this task's scope) — pending/processing/processed/failed status transitions via atomic findOneAndUpdate to prevent double-processing under concurrent consumer instances. |
| `OutboxWriter` | `src/modules/finance_bridge/outbox_writer.py:59` | OutboxWriter | OutboxWriter.publish() is the single entry point for main-app code to emit finance domain events into the finance_outbox collection. No-op when FINANCE_OUTBOX_ENABLED is off (feature_flag.is_outbox_enabled) or when the target tenant has modules.financeEnabled=false (tenant_flag.is_finance_enabled_for_org, Redis-cached 60s). Validates payload against contracts.finance_events.EVENT_TYPE_REGISTRY before writing (fail-fast at the producer); accepts an optional Motor session so the outbox insert can participate in the caller's transaction; duplicate eventId is treated as idempotent success. |
| `get_finance_reachability` | `src/modules/finance_bridge/reachability.py:1` | get_finance_reachability, invalidate_reachability_cache | Wave 0 T-059.2 — deployment-wide (not per-tenant) cached health ping against the finance microservice's GET /api/v1/system/health (1s timeout). Redis-cached reachable+version for FINANCE_CAPABILITY_CACHE_TTL_S; on any failure caches (False, None) so the capabilities endpoint degrades cheaply and consistently instead of a fresh network call on every request. |
| `is_finance_enabled_for_org / invalidate_tenant_flag_cache` | `src/modules/finance_bridge/tenant_flag.py:1` | is_finance_enabled_for_org, invalidate_tenant_flag_cache | Wave 0 T-059.1 — per-tenant financeEnabled lookup, Redis-cached (org:{organizationId}:financeEnabled, TTL=FINANCE_CAPABILITY_CACHE_TTL_S) so the outbox writer and capabilities endpoint don't pay a Mongo read per call. Missing orgs and missing/unset flags both default to True. invalidate_tenant_flag_cache is called by core.api.organizations' PATCH /modules so a toggle is visible within ms instead of waiting out the TTL. |
| `is_outbox_enabled` | `src/modules/finance_bridge/feature_flag.py:15` | is_outbox_enabled | Reads the FINANCE_OUTBOX_ENABLED environment variable (truthy: true/1/yes, case-insensitive). Gates OutboxWriter.publish() so the main app runs safely with the finance service entirely undeployed. |

### `genetics`

| Service | File | Exports | Description |
|---------|------|---------|-------------|
| `AccessionService` | `src/modules/genetics/services/accession/accession_service.py:1` | mint_code, create_accession, get_accession, get_by_code, lis | T-800 Physical material CRUD, accession-code minting (sequence restarts per line+generation), and split_accession which copies generations and parents verbatim so a split is not mistaken for a propagation. |
| `DashboardService` | `src/modules/genetics/services/dashboard_service.py:1` | get_dashboard, GeneticsDashboard, KindBreakdown, SENESCENCE_ | T-800 Repo-wide counters. SENESCENCE_WATCH_GENERATION (5) flags active accessions deep in a clone chain as re-isolation candidates. |
| `GeneticsDatabaseManager` | `src/modules/genetics/services/database.py:1` | genetics_db, LINES, ACCESSIONS, PROPAGATIONS, RECIPES, BATCH | T-800 Collection-name constants and index creation. Delegates connection management to the core MongoDB manager. Indexes parents.accessionId for the lineage traversal hot path. |
| `LineService` | `src/modules/genetics/services/line/line_service.py:1` | create_line, get_line, list_lines, get_line_with_stats, upda | T-800 Genetic line CRUD plus _bulk_stats — one aggregation for accession rollups across many lines, and a second for derived-line counts. T-807: line_dependents() counts everything that would be orphaned (accessions, propagation events, observations, child lines, harvests); purge_line() hard-deletes only at zero dependents, else 409 naming what blocks it. T-809: cascade_purge_line() is the confirmed escalation — gathers explicit id lists (never a broad filter) for accessions/propagation events/observations under the line and removes them plus the line itself; hard-refuses unconditionally (409, even with a correct confirm) when harvests or child lines exist; dry_run=True returns the same preview shape without deleting. |
| `LineageService` | `src/modules/genetics/services/lineage/lineage_service.py:1` | build_graph, get_ancestry | T-800 Breadth-first DAG traversal, batched one query per depth level and capped by MAX_LINEAGE_DEPTH / MAX_LINEAGE_NODES. get_ancestry follows the primary parent per hop and flags branching plus unrecorded origins. |
| `MaintenanceService` | `src/modules/genetics/services/maintenance/maintenance_service.py:1` | find_orphans, delete_orphans | T-809. find_orphans() diffs accessions/propagation-event lineIds/observations against the current set of existing line ids (_existing_line_ids) and reports the leftovers — found live: accession T808-TEST-G1-002 whose line no longer existed. delete_orphans() removes exactly that reported set by explicit id list, never a broad filter; dry_run=True computes the same result without writing. |
| `MediumService` | `src/modules/genetics/services/medium/medium_service.py:1` | create_recipe, get_recipe, list_recipes, update_recipe, crea | T-800 Recipes and batches. Editing any formulation field bumps recipe version; batches snapshot ingredients/additives at pour time so history is never rewritten. find_accessions_by_additive matches batch snapshots, not live recipes. |
| `ObservationService` | `src/modules/genetics/services/observation/observation_service.py:1` | create_observation, get_observation, list_observations, upda | T-800 Observations plus promote_trait: creates a child line parented to the observed material's line and mints a founding accession whose parent is the observed accession, keeping the physical chain unbroken. |
| `PropagationService` | `src/modules/genetics/services/propagation/propagation_service.py:1` | derive_generations, propagate, get_event, list_events, get_e | T-800 CORE RULE lives here. derive_generations: asexual method -> G+1 with F inherited; sexual method -> F+1 with G reset to 0. A spore print off a G5 fruit is F1-G0, not G6. Children are written before the event so an orphaned accession is recoverable but a dangling event is not. T-808: amend_event() corrects performedAt only, cascades to resultAccessionIds' acquiredAt where still equal to the OLD performedAt, stamps amendedAt/amendedBy, returns (event, accessions_updated, accessions_skipped). |
| `genetics service helpers` | `src/modules/genetics/services/common.py:1` | doc_to_model, model_to_doc, slugify_code, generation_label,  | T-800 id<->{entity}Id renaming, code generation (PO-BLU-G2-014 / PO-BLU-F1-G2-003), and stripping computed fields such as generationLabel before persistence. |
| `resolve_vessel` | `src/modules/genetics/services/accession/vessel_resolver.py:36` | resolve_vessel | T-804/T-805. Walks split() chains forward (capped) so a scan of a split-off physical vessel resolves to the CHILD accession record that currently holds it, without the printed label ever needing to be reprinted — labelledVesselCount is a high-water mark on the parent, never decremented, so the ordinal on the sticker stays meaningful across splits. Shared verbatim by the public route, the authenticated by-token route (genetics.api.accessions), and labels.py's lineage/parentage rendering. |

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
| `ARCreditNoteService` | `src/modules/sales/services/ar_credit_note_service.py:1` | create_ar_credit_note, get_ar_credit_note, list_ar_credit_no | T-100.11 AR Credit Note (ARC) business logic. Allocates against AR Invoices, updates invoice statuses, outbox event on DRAFT->OPEN (credit_note_posted). |
| `ARInvoiceService` | `src/modules/sales/services/ar_invoice_service.py:1` | create_ar_invoice, create_ar_invoice_from_delivery, get_ar_i | T-100.9a AR Invoice business logic. Calls finance for customer/item/tax/revenue-account/payment-terms via httpx. Outbox event on DRAFT->OPEN (sales_invoice_posted). |
| `CustomerReceiptService` | `src/modules/sales/services/customer_receipt_service.py:1` | create_customer_receipt, create_customer_receipt_from_invoic | T-100.10 Customer Receipt business logic. Allocates to AR Invoices, updates invoice statuses (paid/partly_paid), outbox event on DRAFT->OPEN (customer_payment_received). |
| `DeliveryService` | `src/modules/sales/services/delivery_service.py:1` | create_delivery_from_so, get_delivery, list_deliveries, upda | T-100.8 Delivery Note business logic. Moving-avg cost lookup, SO line consumption, outbox event on DRAFT->OPEN (delivery_posted). |
| `OrderRepository (legacy)` | `src/modules/sales/services/sales/order_repository.py:26` | OrderRepository | Legacy MongoDB repository for sales_orders collection. CRUD + filter helpers. |
| `OrderService (legacy)` | `src/modules/sales/services/sales/order_service.py:151` | OrderService | Legacy sales_orders service. Inventory allocation, confirm, delete-preview, report-return flows. |
| `PurchaseOrderRepository (legacy stub)` | `src/modules/sales/services/sales/purchase_order_repository.py:19` | PurchaseOrderRepository | Legacy PO repository stub. Kept for dashboard counts; PO writes happen in purchasing module. |
| `PurchaseOrderService (legacy stub)` | `src/modules/sales/services/sales/purchase_order_service.py:19` | PurchaseOrderService | Legacy PO service stub retained for import compatibility. Sales-side POs were removed in T-070.0; real POs live in src/modules/purchasing/. |
| `QuoteService` | `src/modules/sales/services/quote_service.py:1` | create_quote, get_quote, list_quotes, update_quote, delete_q | T-100.6 Sales Quote business logic. Doc-number generation, line math, status transitions, audit trail. No outbox/finance dependency. |
| `RTNService` | `src/modules/sales/services/rtn_service.py:1` | create_return_from_request, create_return_direct, get_return | T-100.11 Return Note (RTN) business logic. Moving-avg cost, RR line consumption, outbox event on DRAFT->OPEN (return_posted). |
| `ReturnRequestService` | `src/modules/sales/services/return_request_service.py:1` | create_return_request, get_return_request, list_return_reque | T-100.11 Return Request (RR) business logic. RMA authorisation, line totals, status transitions. No outbox/finance dependency. |
| `ReturnService (legacy)` | `src/modules/sales/services/sales/return_service.py:28` | ReturnService | Legacy return-order service. Processes returns and restores farm inventory. |
| `SalesDatabaseManager` | `src/modules/sales/services/database.py:16` | SalesDatabaseManager, sales_db | Motor-based MongoDB connection manager for the sales module. Exposes shared sales_db singleton. |
| `SalesOrderService` | `src/modules/sales/services/sales_order_service.py:1` | create_sales_order, create_sales_order_from_quote, get_sales | T-100.7 Sales Order business logic. Credit-limit check via finance httpx, quote consumption, status transitions, audit trail. |

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
| `logistics.service.ShipmentService` | uses | `logistics.service.ShipmentRepository` | ShipmentService delegates DB operations to ShipmentRepositor |
| `marketing.service.CampaignService` | uses | `marketing.service.BudgetService` | CampaignService uses BudgetService for budget allocation. |
| `farm_manager.api.v1.tasks.router` | uses | `farm_manager.models.farm_task.FarmTaskWithDetails` | line 12: imports FarmTaskWithDetails as response model for l |
| `farm_manager.services.task.task_repository._enrich_tasks_with_block_farm` | uses | `farm_manager.models.farm_task.FarmTaskWithDetails` | line 60: FarmTaskWithDetails(**task.model_dump(), blockCode= |
| `farm_manager.models.farm_task.FarmTask` | uses | `farm_manager.models.farm_task.TaskData` | taskData: TaskData field |
| `farm_manager.models.farm_task.TaskData` | uses | `farm_manager.models.farm_task.HarvestEntry` | harvestEntries: List[HarvestEntry] |
| `farm_manager.models.farm_task.TaskData` | uses | `farm_manager.models.farm_task.HarvestTotal` | totalHarvest: Optional[HarvestTotal] |
| `frontend.components.operations.HarvestEntryModal` | uses | `frontend.utils.inputGuards.positiveNumberInputProps` | spreads positiveNumberInputProps onto harvest quantity input |
| `frontend.components.farm.BlockHarvestEntryModal` | uses | `frontend.utils.inputGuards.positiveNumberInputProps` | spreads positiveNumberInputProps onto harvest quantity input |
| `core.documents.doc_number` | uses | `core.documents.document_status` | DOC_TYPE_PREFIXES in doc_number mirrors the doc_type keys us |
| `core.documents.journal_memo` | uses | `core.documents.bp_ref` | format_journal_memo consumes the bp_ref_no field defined by  |
| `core.documents.open_quantity` | uses | `core.documents.document_links` | Open-quantity decrements happen on the upstream line identif |
| `sales.api.quotes` | uses | `core.documents.document_status` | Quotes router imports DocumentStatus for status filter/query |
| `purchasing.service.document_service` | uses | `core.documents.doc_number` | Purchasing document_service mirrors the same {PREFIX}-{YYYY} |
| `sales.api.quotes` | uses | `sales.middleware.auth` | Quote routes guard endpoints via get_current_active_user / r |
| `sales.api.sales_orders` | uses | `sales.middleware.auth` | Sales Order v2 routes guard endpoints via auth middleware. |
| `sales.api.deliveries` | uses | `sales.middleware.auth` | Delivery routes guard endpoints via auth middleware. |
| `sales.api.ar_invoices` | uses | `sales.middleware.auth` | AR Invoice routes guard endpoints via auth middleware. |
| `sales.api.customer_receipts` | uses | `sales.middleware.auth` | Customer Receipt routes guard endpoints via auth middleware. |
| `sales.api.return_requests` | uses | `sales.middleware.auth` | Return Request routes guard endpoints via auth middleware. |
| `sales.api.returns_v2` | uses | `sales.middleware.auth` | Return Note v2 routes guard endpoints via auth middleware. |
| `sales.api.ar_credit_notes` | uses | `sales.middleware.auth` | AR Credit Note routes guard endpoints via auth middleware. |
| `sales.service.quote_service` | uses | `sales.model.quotes` | quote_service serialises payloads via Quote* Pydantic models |
| `sales.service.sales_order_service` | uses | `sales.model.sales_orders` | sales_order_service serialises payloads via SalesOrder* Pyda |
| `sales.service.delivery_service` | uses | `sales.model.deliveries` | delivery_service serialises payloads via Delivery* Pydantic  |
| `sales.service.ar_invoice_service` | uses | `sales.model.ar_invoices` | ar_invoice_service serialises payloads via ARInvoice* Pydant |
| `sales.service.customer_receipt_service` | uses | `sales.model.customer_receipts` | customer_receipt_service serialises payloads via CustomerRec |
| `sales.service.return_request_service` | uses | `sales.model.return_requests` | return_request_service serialises payloads via ReturnRequest |
| `sales.service.rtn_service` | uses | `sales.model.returns` | rtn_service serialises payloads via Return* Pydantic models. |
| `sales.service.ar_credit_note_service` | uses | `sales.model.ar_credit_notes` | ar_credit_note_service serialises payloads via ARCreditNote* |
| `sales.service.quote_service` | uses | `core.documents.doc_number` | Calls next_doc_number('QUOTE'/'SQ') for sequential doc_numbe |
| `sales.service.sales_order_service` | uses | `core.documents.doc_number` | Calls next_doc_number for SO numbering and assert_legal_tran |
| `sales.service.delivery_service` | uses | `core.documents.doc_number` | Calls next_doc_number for DN numbering and assert_legal_tran |
| `sales.service.ar_invoice_service` | uses | `core.documents.doc_number` | Calls next_doc_number for ARI numbering and assert_legal_tra |
| `sales.service.customer_receipt_service` | uses | `core.documents.doc_number` | Calls next_doc_number for IPAY numbering and assert_legal_tr |
| `sales.service.return_request_service` | uses | `core.documents.doc_number` | Calls next_doc_number for RR numbering and assert_legal_tran |
| `sales.service.rtn_service` | uses | `core.documents.doc_number` | Calls next_doc_number for RTN numbering and assert_legal_tra |
| `sales.service.ar_credit_note_service` | uses | `core.documents.doc_number` | Calls next_doc_number for ARC numbering and assert_legal_tra |
| `sales.service.sales_order_service` | uses | `core.documents.document_links` | Uses DocumentLinkRef helper to normalise quote/SO/DN cross-d |
| `sales.service.quote_service` | uses | `sales.service.database` | Reads/writes sales.quotes via sales_db Motor handle. |
| `sales.service.sales_order_service` | uses | `sales.service.database` | Reads/writes sales.sales_orders_v2 via sales_db. |
| `sales.service.delivery_service` | uses | `sales.service.database` | Reads/writes sales.deliveries via sales_db. |
| `sales.service.ar_invoice_service` | uses | `sales.service.database` | Reads/writes sales.ar_invoices via sales_db. |
| `sales.service.customer_receipt_service` | uses | `sales.service.database` | Reads/writes sales.customer_receipts via sales_db. |
| `sales.service.return_request_service` | uses | `sales.service.database` | Reads/writes sales.return_requests via sales_db. |
| `sales.service.rtn_service` | uses | `sales.service.database` | Reads/writes sales.returns_v2 via sales_db. |
| `sales.service.ar_credit_note_service` | uses | `sales.service.database` | Reads/writes sales.ar_credit_notes via sales_db. |
| `sales.service.legacy.order_service` | uses | `sales.service.legacy.order_repository` | OrderService delegates persistence to OrderRepository. |
| `sales.service.legacy.purchase_order_service` | uses | `sales.service.legacy.purchase_order_repository` | Legacy PurchaseOrderService stub delegates to PurchaseOrderR |
| `sales.service.legacy.order_service` | uses | `sales.model.legacy.sales_order` | Legacy OrderService uses SalesOrder* Pydantic models. |
| `sales.service.legacy.return_service` | uses | `sales.model.legacy.return_order` | Legacy ReturnService uses ReturnOrder* Pydantic models. |
| `sales.middleware.auth` | uses | `core.config.settings` | Verifies JWT against core SECRET_KEY (core_settings) to shar |
| `component::AIAnalyticsChat` | uses | `hook::useAIAnalytics` | AIAnalyticsChat uses useAIAnalytics hook |
| `component::BlockAnalyticsModal` | uses | `hook::useBlockAnalytics` | BlockAnalyticsModal uses useBlockAnalytics |
| `component::AccountCombobox` | uses | `hook::useFinanceAccounts` | AccountCombobox uses useFinanceAccounts |
| `component::CostCenterCombobox` | uses | `hook::useCostCenters` | CostCenterCombobox uses useCostCenters |
| `component::AuditHistoryModal` | uses | `hook::useAuditLog` | AuditHistoryModal uses useAuditLog |
| `component::AuditHistoryModal` | uses | `hook::useAdminUsers` | T-064: AuditHistoryModal uses useAdminUsers gated by viewerR |
| `component::AuditHistoryModal` | uses | `store::toast.store` | AuditHistoryModal uses toast store for error surfacing |
| `component::BalanceSheetPage` | uses | `hook::useBalanceSheet` | BalanceSheetPage uses useBalanceSheet hook |
| `component::BalanceSheetPage` | uses | `hook::useJournalEntries` | BalanceSheetPage uses useJournalEntries for drill-down |
| `component::IncomeStatementPage` | uses | `hook::useIncomeStatement` | IncomeStatementPage uses useIncomeStatement hook |
| `component::IncomeStatementPage` | uses | `hook::useJournalEntries` | IncomeStatementPage uses useJournalEntries for drill-down |
| `component::CashFlowStatementPage` | uses | `hook::useCashFlow` | CashFlowStatementPage uses useCashFlow hook (two parallel qu |
| `component::ManualJournalEntryPage` | uses | `hook::useFinanceAccounts` | ManualJournalEntryPage uses useFinanceAccounts |
| `component::ManualJournalEntryPage` | uses | `hook::useCostCenters` | ManualJournalEntryPage uses useCostCenters |
| `component::ManualJournalEntryPage` | uses | `hook::useFinanceCompanies` | ManualJournalEntryPage uses useFinanceCompanies |
| `component::ManualJournalEntryPage` | uses | `hook::useFiscalPeriods` | ManualJournalEntryPage uses useFiscalPeriods |
| `component::ManualJournalEntryPage` | uses | `hook::useCreateManualJournalEntry` | ManualJournalEntryPage uses useCreateManualJournalEntry muta |
| `component::PeriodsPage` | uses | `hook::useFinanceCompanies` | PeriodsPage uses useFinanceCompanies |
| `genetics.service.accession_service` | uses | `genetics.service.common` | Uses build_accession_code, generation_label and doc/model ma |
| `genetics.service.database` | uses | `core.services.database` | Delegates connection pooling and health checks to the core M |
| `service::geneticsApi` | uses | `service::apiClient` | All genetics calls go through the shared axios instance. |
| `service::geneticsApi` | uses | `type::genetics` | Request and response typings. |
| `hook::useGenetics` | uses | `service::geneticsApi` | All query and mutation functions wrap geneticsApi. |
| `component::GeneticsRepoPage` | uses | `hook::useGenetics` | useGeneticLines and useGeneticsDashboard. |
| `component::LineDetailPage` | uses | `hook::useGenetics` | useGeneticLine, useAccessions, useLineageGraph, usePropagati |
| `component::AccessionDetailPage` | uses | `hook::useGenetics` | useAccession, useAncestry, useLineageGraph, useObservations, |
| `component::MediaLibraryPage` | uses | `hook::useGenetics` | useMediumRecipes, useMediumBatches, useAccessionsByAdditive. |
| `component::PropagateModal` | uses | `component::GeneticsModal` | All genetics modals share the no-backdrop-close shell. |
| `component::LineageTree` | uses | `type::genetics` | LineageGraph / LineageNode typings and label maps. |
| `component::MainLayout` | uses | `component::GeneticsRepoPage` | GENETICS_NAV_GROUP is a shared sidebar group rendered for ev |
| `component::GrowingProfilePanel` | uses | `hook::useGrowingProfiles` | Reads the linked strain or plant record. |
