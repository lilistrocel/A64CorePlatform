# API Map

> Generated: 2026-07-29 10:20 UTC  
> Source: MongoDB `mapper_nodes` (layer=api, node_type=api_endpoint)

## Quick Reference

This map covers all backend API endpoints, routers, request/response schemas,
and their connections to frontend service calls.

**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md) | [frontend-map.md](frontend-map.md)

## API Endpoints (86 total)

### Module: `ai_analytics`

| Endpoint | File | Description |
|----------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |

### Module: `auth`

| Endpoint | File | Description |
|----------|------|-------------|
| `admin router` | `src/api/v1/admin.py:30` | Admin-only endpoints: list/get/update users, change role/status, delete user, reset MFA. | router |
| `auth router` | `src/api/v1/auth.py:38` | Authentication endpoints: /register, /login, /logout, /refresh, /me, email verification, password reset, MFA (verify/setup/enable/disable/backup-codes). | router |
| `users router` | `src/api/v1/users.py` | User profile management endpoints under /users. | router |

### Module: `crm`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |

### Module: `dashboard`

| Endpoint | File | Description |
|----------|------|-------------|
| `dashboard router` | `src/api/v1/dashboard.py:22` | Dashboard summary, widget data, bulk widget, refresh, and health endpoints. | router |

### Module: `farm_manager`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /config` | `src/modules/farm_manager/api/v1/config.py:1` | Spacing standards CRUD, plant calculator, farming year configuration. | router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | `src/modules/farm_manager/api/v1/block_alerts.py:1` | CRUD for block alerts with resolve/dismiss, active alerts, and farm-level listing. | router, farm_router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | `src/modules/farm_manager/api/v1/block_harvests.py:1` | CRUD for block harvest records with summary and farm-level aggregation. | router, farm_router |
| `CRUD /inventory` | `src/modules/farm_manager/api/v1/inventory.py:1` | Farm inventory: harvest/input/asset CRUD, movements, transfers, waste management. | router |
| `CRUD /plant-data` | `src/modules/farm_manager/api/v1/plant_data.py:1` | Simple plant data CRUD with CSV import/export. | router |
| `CRUD /plant-data-enhanced` | `src/modules/farm_manager/api/v1/plant_data_enhanced.py:1` | Enhanced plant data with growth cycles, fertigation schedules, search, clone. | router |
| `CRUD /plantings` | `src/modules/farm_manager/api/v1/plantings.py:1` | Planting plan management: create, mark planted, get, list. | router |
| `CRUD /sensehub` | `src/modules/farm_manager/api/v1/sensehub.py:1` | SenseHub proxy: connect/disconnect, dashboard, equipment, automations, alerts, relay control. | router |
| `CRUD /tasks` | `src/modules/farm_manager/api/v1/tasks.py:1` | Farm task management: my-tasks, pending-count, CRUD, complete, harvest entry. | router |
| `DELETE /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:182` | Delete farm with cascade deletion of blocks, harvests, alerts, archives. | delete_farm |
| `DELETE /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:414` | Delete task (admin). Destructive. | delete_task |
| `GET /archives` | `src/modules/farm_manager/api/v1/block_archives.py:1` | Block archives: cycle history, performance analytics, crop comparison. | router |
| `GET /dashboard` | `src/modules/farm_manager/api/v1/dashboard.py:1` | Farm dashboard summary, quick transitions, quick harvest, KPI recalculation. | router |
| `GET /farms` | `src/modules/farm_manager/api/v1/farms.py:62` | List all farms with optional pagination and filtering. | get_farms |
| `GET /farms/analytics/global` | `src/modules/farm_manager/api/v1/farms.py:402` | Cross-farm analytics aggregation covering all farms. | get_global_analytics |
| `GET /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:117` | Get details for a specific farm by ID. | get_farm |
| `GET /farms/{farm_id}/analytics` | `src/modules/farm_manager/api/v1/farms.py:342` | Get farm-level analytics: yield metrics, state breakdown, block comparison. | get_farm_analytics |
| `GET /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:59` | List blocks for a farm with optional status/crop filtering. | list_blocks |
| `GET /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:109` | Get full block details including KPI, IoT, and status history. | get_block |
| `GET /farms/{farm_id}/blocks/{block_id}/analytics` | `src/modules/farm_manager/api/v1/blocks.py:372` | Get block-level analytics: yield trends, timeline, performance metrics. | get_block_analytics |
| `GET /farms/{farm_id}/farming-years` | `src/modules/farm_manager/api/v1/farms.py:465` | Get farming year configuration for a specific farm. | get_farm_farming_years |
| `GET /farms/{farm_id}/summary` | `src/modules/farm_manager/api/v1/farms.py:233` | Get a summary of a farm including block counts and status distribution. | get_farm_summary |
| `GET /managers` | `src/modules/farm_manager/api/v1/managers.py:1` | List users with manager/admin roles for farm assignment. | router |
| `GET /tasks/admin/pending-aggregations` | `src/modules/farm_manager/api/v1/tasks.py:522` | List daily_harvest tasks still needing aggregation. | admin_get_pending_aggregations |
| `GET /tasks/blocks/{block_id}` | `src/modules/farm_manager/api/v1/tasks.py:123` | Paginated tasks for a block. v1.11.0: returns PaginatedResponse[FarmTaskWithDetails]. | list_block_tasks |
| `GET /tasks/farms/{farm_id}` | `src/modules/farm_manager/api/v1/tasks.py:86` | Paginated tasks for a farm. v1.11.0: returns PaginatedResponse[FarmTaskWithDetails]. Supports farmingYear filter. | list_farm_tasks |
| `GET /tasks/my-tasks` | `src/modules/farm_manager/api/v1/tasks.py:29` | Returns current user's tasks as List[FarmTaskWithDetails] (v1.11.0: enriched with blockCode/blockName/farmCode/farmName/targetCrop/targetCropName/actualPlantCount/expectedYieldKg). | get_my_tasks |
| `GET /tasks/pending-count` | `src/modules/farm_manager/api/v1/tasks.py:63` | Returns count of pending tasks for current user (menu badge). | get_pending_task_count |
| `GET /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:158` | Task detail. v1.11.0: returns SuccessResponse[FarmTaskWithDetails]. | get_task |
| `GET /weather` | `src/modules/farm_manager/api/v1/weather.py:1` | Weather endpoints: current, forecast, agri-data, cache stats, refresh. | router |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/virtual-crops` | `src/modules/farm_manager/api/v1/blocks.py:471` | Add a virtual crop sub-block to a multi-crop parent block. | add_virtual_crop |
| `POST /tasks` | `src/modules/farm_manager/api/v1/tasks.py:183` | Create custom task (requires farm.manage). | create_custom_task |
| `POST /tasks/admin/aggregate-harvest/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:450` | Admin manual trigger for a specific harvest task aggregation. | admin_aggregate_harvest |
| `POST /tasks/admin/run-daily-aggregation` | `src/modules/farm_manager/api/v1/tasks.py:483` | Cron endpoint: run daily aggregation for all in-progress tasks. | admin_run_daily_aggregation |
| `POST /tasks/{task_id}/cancel` | `src/modules/farm_manager/api/v1/tasks.py:380` | Cancel a task (requires farm.manage). | cancel_task |
| `POST /tasks/{task_id}/complete` | `src/modules/farm_manager/api/v1/tasks.py:257` | Complete a non-harvest task. Supports optional block state transition via triggerTransition. | complete_task |
| `POST /tasks/{task_id}/end-harvest` | `src/modules/farm_manager/api/v1/tasks.py:342` | Manager aggregates and completes a daily_harvest task early. | end_daily_harvest |
| `POST /tasks/{task_id}/harvest` | `src/modules/farm_manager/api/v1/tasks.py:299` | Append harvest entry to a daily_harvest task. | add_harvest_entry |
| `PUT /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:221` | Update task scheduling/status/priority (requires farm.manage). | update_task |
| `tasks router` | `src/modules/farm_manager/api/v1/tasks.py:21` | Operations Task Manager endpoints under /tasks. v1.11.0: list/detail endpoints now return FarmTaskWithDetails (block + farm + crop context). | router |

### Module: `genetics`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /genetics/accessions` | `src/modules/genetics/api/v1/accessions.py:1` | T-800 Physical material CRUD, plus /by-code/{code} label lookup for scanning and POST /{id}/split to break vessels out of a batch record. Founding material only; clones and crosses go through /propagations. | router, SplitResult |
| `CRUD /genetics/lines` | `src/modules/genetics/api/v1/lines.py:1` | T-800 Genetic line CRUD — the named identity (strain/variety/bloodline). List returns LineWithStats so accession rollups survive response-model filtering. DELETE is a soft deactivate; hard deletion is unsupported because accessions and propagation events reference the line. | router |
| `CRUD /genetics/media` | `src/modules/genetics/api/v1/media.py:1` | T-800 Medium recipes and prepared batches, plus GET /additives/{name}/accessions — the experiment readout returning every accession ever grown on a medium containing an additive. | router, AdditiveReadout |
| `CRUD /genetics/observations` | `src/modules/genetics/api/v1/observations.py:1` | T-800 Dated observations against accessions, plus POST /{id}/promote which turns a flagged novel trait into its own genetic line with a founding accession. | router, PromotionResult |
| `CRUD /genetics/propagations` | `src/modules/genetics/api/v1/propagations.py:1` | T-800 Clone/cross execution and the transfer log. GET /methods exposes each method's reproduction mode, parent arity and generation effects, which drives the frontend's live G/F preview. | router, PropagationOutcome, MethodInfo |
| `GET /genetics/dashboard` | `src/modules/genetics/api/v1/dashboard.py:1` | T-800 Repo-wide counters: lines by biological domain, live material, 30-day activity, novel traits awaiting promotion, and the senescence watch list. | router |
| `GET /genetics/lineage` | `src/modules/genetics/api/v1/lineage.py:1` | T-800 Lineage DAG (/graph) and flattened ancestry breadcrumb (/ancestry/{id}). Returns flat nodes+edges rather than a nested tree because a cross gives a node two parents. | router |

### Module: `hr`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /hr/contracts` | `src/modules/hr/api/v1/contracts.py:1` | Employment contract management CRUD. | router |
| `CRUD /hr/employees` | `src/modules/hr/api/v1/employees.py:1` | Employee CRUD with Arabic name support, Emirates ID handling, pagination. | router |
| `CRUD /hr/insurance` | `src/modules/hr/api/v1/insurance.py:1` | Employee insurance policy management. | router |
| `CRUD /hr/performance` | `src/modules/hr/api/v1/performance.py:1` | Employee performance reviews and ratings. | router |
| `CRUD /hr/visas` | `src/modules/hr/api/v1/visas.py:1` | Employee visa tracking and management. | router |
| `GET /hr/dashboard` | `src/modules/hr/api/v1/dashboard.py:1` | HR dashboard statistics and summaries. | router |

### Module: `logistics`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /logistics/routes` | `src/modules/logistics/api/v1/routes.py:1` | Delivery route management with distance and duration tracking. | router |
| `CRUD /logistics/shipments` | `src/modules/logistics/api/v1/shipments.py:1` | Shipment CRUD with tracking, status updates, and order assignment. | router |
| `CRUD /logistics/vehicles` | `src/modules/logistics/api/v1/vehicles.py:1` | Fleet vehicle management CRUD. | router |
| `GET /logistics/dashboard` | `src/modules/logistics/api/v1/dashboard.py:1` | Logistics dashboard statistics and summaries. | router |

### Module: `marketing`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /marketing/budgets` | `src/modules/marketing/api/v1/budgets.py:1` | Marketing budget allocation and tracking. | router |
| `CRUD /marketing/campaigns` | `src/modules/marketing/api/v1/campaigns.py:1` | Marketing campaign CRUD with budget and channel integration. | router |
| `CRUD /marketing/channels` | `src/modules/marketing/api/v1/channels.py:1` | Marketing channel management with metrics tracking. | router |
| `CRUD /marketing/events` | `src/modules/marketing/api/v1/events.py:1` | Marketing event planning and management. | router |
| `GET /marketing/dashboard` | `src/modules/marketing/api/v1/dashboard.py:1` | Marketing dashboard statistics and campaign performance. | router |

### Module: `sales`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /sales (config)` | `src/modules/sales/api/v1/config.py:1` | Sales config endpoints (farming-years dropdown). Proxies farm_manager farming-year service. | router |
| `CRUD /sales/ar-credit-notes` | `src/modules/sales/api/v1/ar_credit_notes.py:1` | T-100.11 AR Credit Note (ARC) CRUD + status transitions. Financial reversal of AR Invoice. Emits credit_note_posted to finance outbox. | router |
| `CRUD /sales/ar-invoices` | `src/modules/sales/api/v1/ar_invoices.py:1` | T-100.9a AR Invoice (ARI) CRUD + from-delivery copy + status transitions. Emits sales_invoice_posted to finance outbox. | router |
| `CRUD /sales/customer-receipts` | `src/modules/sales/api/v1/customer_receipts.py:1` | T-100.10 Customer Receipt (IPAY) CRUD + from-invoice flow + status transitions. Emits customer_payment_received to finance outbox. | router |
| `CRUD /sales/dashboard` | `src/modules/sales/api/v1/dashboard.py:1` | Sales dashboard stats (legacy orders + harvest inventory). Redis-cached. | router |
| `CRUD /sales/deliveries` | `src/modules/sales/api/v1/deliveries.py:1` | T-100.8 Delivery Note (DN) CRUD + from-SO copy + status transitions. Emits delivery_posted to finance outbox. | router |
| `CRUD /sales/orders (legacy)` | `src/modules/sales/api/v1/orders.py:1` | Legacy Sales Order CRUD (sales_orders collection). Confirm/delete-preview/report-return flows. | router |
| `CRUD /sales/orders-v2` | `src/modules/sales/api/v1/sales_orders.py:1` | T-100.7 Sales Order (SO) v2 CRUD + from-quote copy + status transitions. Credit-limit check on DRAFT->OPEN. | router |
| `CRUD /sales/quotes` | `src/modules/sales/api/v1/quotes.py:1` | T-100.6 Sales Quote (SQ) CRUD + status transitions. First doc in Wave 3 quote-to-cash chain. No GL impact. | router |
| `CRUD /sales/return-requests` | `src/modules/sales/api/v1/return_requests.py:1` | T-100.11 Return Request (RR) CRUD + status transitions. RMA authorisation, no GL impact. | router |
| `CRUD /sales/returns (legacy)` | `src/modules/sales/api/v1/returns.py:1` | Legacy Return Order CRUD with inventory restoration on process. | router |
| `CRUD /sales/returns-v2` | `src/modules/sales/api/v1/returns_v2.py:1` | T-100.11 Return Note (RTN) CRUD + from-request copy + status transitions. Physical goods return. Emits return_posted to finance outbox. | router |

## API Router Files (87 total)

| Name | File | Description |
|------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |
| `admin router` | `src/api/v1/admin.py:30` | Admin-only endpoints: list/get/update users, change role/status, delete user, reset MFA. | router |
| `auth router` | `src/api/v1/auth.py:38` | Authentication endpoints: /register, /login, /logout, /refresh, /me, email verification, password reset, MFA (verify/setup/enable/disable/backup-codes). | router |
| `users router` | `src/api/v1/users.py` | User profile management endpoints under /users. | router |
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |
| `dashboard router` | `src/api/v1/dashboard.py:22` | Dashboard summary, widget data, bulk widget, refresh, and health endpoints. | router |
| `CRUD /config` | `src/modules/farm_manager/api/v1/config.py:1` | Spacing standards CRUD, plant calculator, farming year configuration. | router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | `src/modules/farm_manager/api/v1/block_alerts.py:1` | CRUD for block alerts with resolve/dismiss, active alerts, and farm-level listing. | router, farm_router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | `src/modules/farm_manager/api/v1/block_harvests.py:1` | CRUD for block harvest records with summary and farm-level aggregation. | router, farm_router |
| `CRUD /inventory` | `src/modules/farm_manager/api/v1/inventory.py:1` | Farm inventory: harvest/input/asset CRUD, movements, transfers, waste management. | router |
| `CRUD /plant-data` | `src/modules/farm_manager/api/v1/plant_data.py:1` | Simple plant data CRUD with CSV import/export. | router |
| `CRUD /plant-data-enhanced` | `src/modules/farm_manager/api/v1/plant_data_enhanced.py:1` | Enhanced plant data with growth cycles, fertigation schedules, search, clone. | router |
| `CRUD /plantings` | `src/modules/farm_manager/api/v1/plantings.py:1` | Planting plan management: create, mark planted, get, list. | router |
| `CRUD /sensehub` | `src/modules/farm_manager/api/v1/sensehub.py:1` | SenseHub proxy: connect/disconnect, dashboard, equipment, automations, alerts, relay control. | router |
| `CRUD /tasks` | `src/modules/farm_manager/api/v1/tasks.py:1` | Farm task management: my-tasks, pending-count, CRUD, complete, harvest entry. | router |
| `DELETE /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:182` | Delete farm with cascade deletion of blocks, harvests, alerts, archives. | delete_farm |
| `DELETE /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:414` | Delete task (admin). Destructive. | delete_task |
| `GET /archives` | `src/modules/farm_manager/api/v1/block_archives.py:1` | Block archives: cycle history, performance analytics, crop comparison. | router |
| `GET /dashboard` | `src/modules/farm_manager/api/v1/dashboard.py:1` | Farm dashboard summary, quick transitions, quick harvest, KPI recalculation. | router |
| `GET /farms` | `src/modules/farm_manager/api/v1/farms.py:62` | List all farms with optional pagination and filtering. | get_farms |
| `GET /farms/analytics/global` | `src/modules/farm_manager/api/v1/farms.py:402` | Cross-farm analytics aggregation covering all farms. | get_global_analytics |
| `GET /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:117` | Get details for a specific farm by ID. | get_farm |
| `GET /farms/{farm_id}/analytics` | `src/modules/farm_manager/api/v1/farms.py:342` | Get farm-level analytics: yield metrics, state breakdown, block comparison. | get_farm_analytics |
| `GET /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:59` | List blocks for a farm with optional status/crop filtering. | list_blocks |
| `GET /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:109` | Get full block details including KPI, IoT, and status history. | get_block |
| `GET /farms/{farm_id}/blocks/{block_id}/analytics` | `src/modules/farm_manager/api/v1/blocks.py:372` | Get block-level analytics: yield trends, timeline, performance metrics. | get_block_analytics |
| `GET /farms/{farm_id}/farming-years` | `src/modules/farm_manager/api/v1/farms.py:465` | Get farming year configuration for a specific farm. | get_farm_farming_years |
| `GET /farms/{farm_id}/summary` | `src/modules/farm_manager/api/v1/farms.py:233` | Get a summary of a farm including block counts and status distribution. | get_farm_summary |
| `GET /managers` | `src/modules/farm_manager/api/v1/managers.py:1` | List users with manager/admin roles for farm assignment. | router |
| `GET /tasks/admin/pending-aggregations` | `src/modules/farm_manager/api/v1/tasks.py:522` | List daily_harvest tasks still needing aggregation. | admin_get_pending_aggregations |
| `GET /tasks/blocks/{block_id}` | `src/modules/farm_manager/api/v1/tasks.py:123` | Paginated tasks for a block. v1.11.0: returns PaginatedResponse[FarmTaskWithDetails]. | list_block_tasks |
| `GET /tasks/farms/{farm_id}` | `src/modules/farm_manager/api/v1/tasks.py:86` | Paginated tasks for a farm. v1.11.0: returns PaginatedResponse[FarmTaskWithDetails]. Supports farmingYear filter. | list_farm_tasks |
| `GET /tasks/my-tasks` | `src/modules/farm_manager/api/v1/tasks.py:29` | Returns current user's tasks as List[FarmTaskWithDetails] (v1.11.0: enriched with blockCode/blockName/farmCode/farmName/targetCrop/targetCropName/actualPlantCount/expectedYieldKg). | get_my_tasks |
| `GET /tasks/pending-count` | `src/modules/farm_manager/api/v1/tasks.py:63` | Returns count of pending tasks for current user (menu badge). | get_pending_task_count |
| `GET /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:158` | Task detail. v1.11.0: returns SuccessResponse[FarmTaskWithDetails]. | get_task |
| `GET /weather` | `src/modules/farm_manager/api/v1/weather.py:1` | Weather endpoints: current, forecast, agri-data, cache stats, refresh. | router |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/virtual-crops` | `src/modules/farm_manager/api/v1/blocks.py:471` | Add a virtual crop sub-block to a multi-crop parent block. | add_virtual_crop |
| `POST /tasks` | `src/modules/farm_manager/api/v1/tasks.py:183` | Create custom task (requires farm.manage). | create_custom_task |
| `POST /tasks/admin/aggregate-harvest/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:450` | Admin manual trigger for a specific harvest task aggregation. | admin_aggregate_harvest |
| `POST /tasks/admin/run-daily-aggregation` | `src/modules/farm_manager/api/v1/tasks.py:483` | Cron endpoint: run daily aggregation for all in-progress tasks. | admin_run_daily_aggregation |
| `POST /tasks/{task_id}/cancel` | `src/modules/farm_manager/api/v1/tasks.py:380` | Cancel a task (requires farm.manage). | cancel_task |
| `POST /tasks/{task_id}/complete` | `src/modules/farm_manager/api/v1/tasks.py:257` | Complete a non-harvest task. Supports optional block state transition via triggerTransition. | complete_task |
| `POST /tasks/{task_id}/end-harvest` | `src/modules/farm_manager/api/v1/tasks.py:342` | Manager aggregates and completes a daily_harvest task early. | end_daily_harvest |
| `POST /tasks/{task_id}/harvest` | `src/modules/farm_manager/api/v1/tasks.py:299` | Append harvest entry to a daily_harvest task. | add_harvest_entry |
| `PUT /tasks/{task_id}` | `src/modules/farm_manager/api/v1/tasks.py:221` | Update task scheduling/status/priority (requires farm.manage). | update_task |
| `tasks router` | `src/modules/farm_manager/api/v1/tasks.py:21` | Operations Task Manager endpoints under /tasks. v1.11.0: list/detail endpoints now return FarmTaskWithDetails (block + farm + crop context). | router |
| `CRUD /genetics/accessions` | `src/modules/genetics/api/v1/accessions.py:1` | T-800 Physical material CRUD, plus /by-code/{code} label lookup for scanning and POST /{id}/split to break vessels out of a batch record. Founding material only; clones and crosses go through /propagations. | router, SplitResult |
| `CRUD /genetics/lines` | `src/modules/genetics/api/v1/lines.py:1` | T-800 Genetic line CRUD — the named identity (strain/variety/bloodline). List returns LineWithStats so accession rollups survive response-model filtering. DELETE is a soft deactivate; hard deletion is unsupported because accessions and propagation events reference the line. | router |
| `CRUD /genetics/media` | `src/modules/genetics/api/v1/media.py:1` | T-800 Medium recipes and prepared batches, plus GET /additives/{name}/accessions — the experiment readout returning every accession ever grown on a medium containing an additive. | router, AdditiveReadout |
| `CRUD /genetics/observations` | `src/modules/genetics/api/v1/observations.py:1` | T-800 Dated observations against accessions, plus POST /{id}/promote which turns a flagged novel trait into its own genetic line with a founding accession. | router, PromotionResult |
| `CRUD /genetics/propagations` | `src/modules/genetics/api/v1/propagations.py:1` | T-800 Clone/cross execution and the transfer log. GET /methods exposes each method's reproduction mode, parent arity and generation effects, which drives the frontend's live G/F preview. | router, PropagationOutcome, MethodInfo |
| `GET /genetics/dashboard` | `src/modules/genetics/api/v1/dashboard.py:1` | T-800 Repo-wide counters: lines by biological domain, live material, 30-day activity, novel traits awaiting promotion, and the senescence watch list. | router |
| `GET /genetics/lineage` | `src/modules/genetics/api/v1/lineage.py:1` | T-800 Lineage DAG (/graph) and flattened ancestry breadcrumb (/ancestry/{id}). Returns flat nodes+edges rather than a nested tree because a cross gives a node two parents. | router |
| `genetics response envelopes` | `src/modules/genetics/utils/responses.py:1` | T-800 Standard A64Core response envelopes for the genetics module. | SuccessResponse, PaginatedResponse, PaginationMeta, ErrorResponse, paginate |
| `CRUD /hr/contracts` | `src/modules/hr/api/v1/contracts.py:1` | Employment contract management CRUD. | router |
| `CRUD /hr/employees` | `src/modules/hr/api/v1/employees.py:1` | Employee CRUD with Arabic name support, Emirates ID handling, pagination. | router |
| `CRUD /hr/insurance` | `src/modules/hr/api/v1/insurance.py:1` | Employee insurance policy management. | router |
| `CRUD /hr/performance` | `src/modules/hr/api/v1/performance.py:1` | Employee performance reviews and ratings. | router |
| `CRUD /hr/visas` | `src/modules/hr/api/v1/visas.py:1` | Employee visa tracking and management. | router |
| `GET /hr/dashboard` | `src/modules/hr/api/v1/dashboard.py:1` | HR dashboard statistics and summaries. | router |
| `CRUD /logistics/routes` | `src/modules/logistics/api/v1/routes.py:1` | Delivery route management with distance and duration tracking. | router |
| `CRUD /logistics/shipments` | `src/modules/logistics/api/v1/shipments.py:1` | Shipment CRUD with tracking, status updates, and order assignment. | router |
| `CRUD /logistics/vehicles` | `src/modules/logistics/api/v1/vehicles.py:1` | Fleet vehicle management CRUD. | router |
| `GET /logistics/dashboard` | `src/modules/logistics/api/v1/dashboard.py:1` | Logistics dashboard statistics and summaries. | router |
| `CRUD /marketing/budgets` | `src/modules/marketing/api/v1/budgets.py:1` | Marketing budget allocation and tracking. | router |
| `CRUD /marketing/campaigns` | `src/modules/marketing/api/v1/campaigns.py:1` | Marketing campaign CRUD with budget and channel integration. | router |
| `CRUD /marketing/channels` | `src/modules/marketing/api/v1/channels.py:1` | Marketing channel management with metrics tracking. | router |
| `CRUD /marketing/events` | `src/modules/marketing/api/v1/events.py:1` | Marketing event planning and management. | router |
| `GET /marketing/dashboard` | `src/modules/marketing/api/v1/dashboard.py:1` | Marketing dashboard statistics and campaign performance. | router |
| `CRUD /sales (config)` | `src/modules/sales/api/v1/config.py:1` | Sales config endpoints (farming-years dropdown). Proxies farm_manager farming-year service. | router |
| `CRUD /sales/ar-credit-notes` | `src/modules/sales/api/v1/ar_credit_notes.py:1` | T-100.11 AR Credit Note (ARC) CRUD + status transitions. Financial reversal of AR Invoice. Emits credit_note_posted to finance outbox. | router |
| `CRUD /sales/ar-invoices` | `src/modules/sales/api/v1/ar_invoices.py:1` | T-100.9a AR Invoice (ARI) CRUD + from-delivery copy + status transitions. Emits sales_invoice_posted to finance outbox. | router |
| `CRUD /sales/customer-receipts` | `src/modules/sales/api/v1/customer_receipts.py:1` | T-100.10 Customer Receipt (IPAY) CRUD + from-invoice flow + status transitions. Emits customer_payment_received to finance outbox. | router |
| `CRUD /sales/dashboard` | `src/modules/sales/api/v1/dashboard.py:1` | Sales dashboard stats (legacy orders + harvest inventory). Redis-cached. | router |
| `CRUD /sales/deliveries` | `src/modules/sales/api/v1/deliveries.py:1` | T-100.8 Delivery Note (DN) CRUD + from-SO copy + status transitions. Emits delivery_posted to finance outbox. | router |
| `CRUD /sales/orders (legacy)` | `src/modules/sales/api/v1/orders.py:1` | Legacy Sales Order CRUD (sales_orders collection). Confirm/delete-preview/report-return flows. | router |
| `CRUD /sales/orders-v2` | `src/modules/sales/api/v1/sales_orders.py:1` | T-100.7 Sales Order (SO) v2 CRUD + from-quote copy + status transitions. Credit-limit check on DRAFT->OPEN. | router |
| `CRUD /sales/quotes` | `src/modules/sales/api/v1/quotes.py:1` | T-100.6 Sales Quote (SQ) CRUD + status transitions. First doc in Wave 3 quote-to-cash chain. No GL impact. | router |
| `CRUD /sales/return-requests` | `src/modules/sales/api/v1/return_requests.py:1` | T-100.11 Return Request (RR) CRUD + status transitions. RMA authorisation, no GL impact. | router |
| `CRUD /sales/returns (legacy)` | `src/modules/sales/api/v1/returns.py:1` | Legacy Return Order CRUD with inventory restoration on process. | router |
| `CRUD /sales/returns-v2` | `src/modules/sales/api/v1/returns_v2.py:1` | T-100.11 Return Note (RTN) CRUD + from-request copy + status transitions. Physical goods return. Emits return_posted to finance outbox. | router |

## API → Service Dependencies

| API File | Edge | Service/Target | Context |
|----------|------|----------------|---------|
| `farm_manager.api.farms.create_farm` | calls | `farm_manager.service.FarmService` | Farm API endpoints delegate to FarmService for all CRUD operations. |
| `farm_manager.api.farms.delete_farm` | calls | `farm_manager.service.CascadeDeletionService` | Farm deletion uses CascadeDeletionService to archive all related data. |
| `farm_manager.api.farms.get_farm_analytics` | calls | `farm_manager.service.FarmAnalyticsService` | Farm analytics endpoint delegates to FarmAnalyticsService. |
| `farm_manager.api.farms.get_global_analytics` | calls | `farm_manager.service.GlobalAnalyticsService` | Global analytics endpoint delegates to GlobalAnalyticsService. |
| `farm_manager.api.blocks.create_block` | calls | `farm_manager.service.BlockService` | Block API endpoints delegate to BlockService for lifecycle management. |
| `farm_manager.api.blocks.add_virtual_crop` | calls | `farm_manager.service.VirtualBlockService` | Virtual crop endpoints delegate to VirtualBlockService. |
| `farm_manager.api.blocks.get_block_analytics` | calls | `farm_manager.service.BlockAnalyticsService` | Block analytics endpoint delegates to BlockAnalyticsService. |
| `farm_manager.api.block_harvests` | calls | `farm_manager.service.HarvestService` | Harvest API delegates to HarvestService. |
| `farm_manager.api.block_alerts` | calls | `farm_manager.service.AlertService` | Alert API delegates to AlertService. |
| `farm_manager.api.block_archives` | calls | `farm_manager.service.ArchiveService` | Archive API delegates to ArchiveService. |
| `farm_manager.api.tasks` | calls | `farm_manager.service.TaskService` | Task API delegates to TaskService. |
| `farm_manager.api.tasks` | calls | `farm_manager.service.TaskGeneratorService` | Task API uses TaskGeneratorService for auto-generation endpoints. |
| `farm_manager.api.tasks` | calls | `farm_manager.service.HarvestAggregatorService` | Task API uses HarvestAggregatorService for harvest aggregation endpoints. |
| `farm_manager.api.weather` | calls | `farm_manager.service.WeatherService` | Weather API delegates to WeatherService. |
| `farm_manager.api.weather` | calls | `farm_manager.service.WeatherCacheService` | Weather API uses WeatherCacheService for cache management endpoints. |
| `farm_manager.api.sensehub` | calls | `farm_manager.service.SenseHubConnectionService` | SenseHub API delegates to SenseHubConnectionService for connection management. |
| `farm_manager.api.farm_ai_chat` | calls | `farm_manager.service.FarmAIChatService` | Farm AI chat API delegates to FarmAIChatService. |
| `farm_manager.api.config` | calls | `farm_manager.service.ConfigService` | Config API delegates to ConfigService for spacing standards. |
| `farm_manager.api.config` | calls | `farm_manager.service.FarmingYearService` | Config API delegates to FarmingYearService for farming year CRUD. |
| `farm_manager.api.plant_data` | calls | `farm_manager.service.PlantDataService` | Plant data API delegates to PlantDataService. |
| `farm_manager.api.plant_data_enhanced` | calls | `farm_manager.service.PlantDataEnhancedService` | Enhanced plant data API delegates to PlantDataEnhancedService. |
| `farm_manager.api.plantings` | calls | `farm_manager.service.PlantingService` | Planting API delegates to PlantingService. |
| `farm_manager.service.BlockService` | calls | `farm_manager.service.TaskGeneratorService` | BlockService triggers task generation on state transitions. |
| `farm_manager.service.GlobalAnalyticsService` | calls | `farm_manager.service.FarmAnalyticsService` | GlobalAnalyticsService aggregates per-farm analytics from FarmAnalyticsService. |
| `farm_manager.service.FarmAIChatService` | calls | `farm_manager.service.SenseHubConnectionService` | Farm AI chat service gets SenseHub clients for tool execution. |
| `hr.api.employees` | calls | `hr.service.EmployeeService` | Employee API delegates to EmployeeService. |
| `hr.api.contracts` | calls | `hr.service.ContractService` | Contract API delegates to ContractService. |
| `hr.api.visas` | calls | `hr.service.VisaService` | Visa API delegates to VisaService. |
| `hr.api.insurance` | calls | `hr.service.InsuranceService` | Insurance API delegates to InsuranceService. |
| `hr.api.performance` | calls | `hr.service.PerformanceService` | Performance API delegates to PerformanceService. |
| `crm.api.customers` | calls | `crm.service.CustomerService` | Customer API delegates to CustomerService. |
| `logistics.api.shipments` | calls | `logistics.service.ShipmentService` | Shipment API delegates to ShipmentService. |
| `marketing.api.campaigns` | calls | `marketing.service.CampaignService` | Campaign API delegates to CampaignService. |
| `ai_analytics.api.chat` | calls | `ai_analytics.service.QueryEngine` | AI chat API delegates to QueryEngine for NL-to-MongoDB pipeline. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.GeminiService` | QueryEngine uses GeminiService for NL-to-MongoDB query generation. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.SchemaService` | QueryEngine uses SchemaService to discover MongoDB schemas. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.util.QueryValidator` | QueryEngine validates generated queries via QueryValidator. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.CostTrackingService` | QueryEngine logs query costs via CostTrackingService. |
| `authService` | calls | `endpoint_POST_auth_login` | axios.post('/v1/auth/login') |
| `authService` | calls | `endpoint_POST_auth_register` | axios.post('/v1/auth/register') |
| `authService` | calls | `endpoint_POST_auth_logout` | apiClient.post('/v1/auth/logout') |
| `authService` | calls | `endpoint_GET_auth_me` | apiClient.get('/v1/auth/me') |
| `authService` | calls | `endpoint_PATCH_auth_me` | apiClient.patch('/v1/auth/me') |
| `authService` | calls | `endpoint_POST_auth_refresh` | axios.post('/v1/auth/refresh') |
| `authService` | calls | `endpoint_GET_auth_mfa_status` | apiClient.get('/v1/auth/mfa/status') |
| `authService` | calls | `endpoint_POST_auth_mfa_verify` | axios.post('/v1/auth/mfa/verify') |
| `authService` | calls | `endpoint_POST_auth_mfa_backup_codes` | apiClient.post('/v1/auth/mfa/backup-codes') |
| `farmApi` | calls | `endpoint_GET_farm_managers` | apiClient.get('/v1/farm/managers') |
| `farmApi` | calls | `endpoint_GET_farm_farms` | apiClient.get('/v1/farm/farms') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId` | apiClient.get('/v1/farm/farms/${farmId}') |
| `farmApi` | calls | `endpoint_POST_farm_farms` | apiClient.post('/v1/farm/farms') |
| `farmApi` | calls | `endpoint_PATCH_farm_farms_farmId` | apiClient.patch('/v1/farm/farms/${farmId}') |
| `farmApi` | calls | `endpoint_DELETE_farm_farms_farmId` | apiClient.delete('/v1/farm/farms/${farmId}') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId_summary` | apiClient.get('/v1/farm/farms/${farmId}/summary') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId_blocks` | apiClient.get('/v1/farm/farms/${farmId}/blocks') |
| `farmApi` | calls | `endpoint_POST_farm_farms_farmId_blocks` | apiClient.post('/v1/farm/farms/${farmId}/blocks') |
| `farmApi` | calls | `endpoint_PATCH_farm_farms_farmId_blocks_blockId_status` | apiClient.patch('/v1/farm/farms/${farmId}/blocks/${blockId}/status') |
| `farmApi` | calls | `endpoint_GET_farm_plant_data` | apiClient.get('/v1/farm/plant-data') |
| `farmApi` | calls | `endpoint_POST_farm_plant_data` | apiClient.post('/v1/farm/plant-data') |
| `farmApi` | calls | `endpoint_GET_farm_plantings` | apiClient.get('/v1/farm/plantings') |
| `farmApi` | calls | `endpoint_POST_farm_plantings` | apiClient.post('/v1/farm/plantings') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId_blocks_blockId_alerts` | apiClient.get('/v1/farm/farms/${farmId}/blocks/${blockId}/alerts') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId_blocks_blockId_harvests` | apiClient.get('/v1/farm/farms/${farmId}/blocks/${blockId}/harvests') |
| `farmApi` | calls | `endpoint_POST_farm_farms_farmId_blocks_blockId_harvests` | apiClient.post('/v1/farm/farms/${farmId}/blocks/${blockId}/harvests') |
| `farmApi` | calls | `endpoint_GET_farm_farms_farmId_blocks_blockId_archives` | apiClient.get('/v1/farm/farms/${farmId}/blocks/${blockId}/archives') |
| `farmApi` | calls | `endpoint_POST_farm_farms_farmId_blocks_blockId_sensehub_connect` | apiClient.post('/v1/farm/farms/${farmId}/blocks/${blockId}/sensehub/connect') |
| `farmApi` | calls | `endpoint_POST_farm_farms_farmId_blocks_blockId_ai_chat` | apiClient.post('/v1/farm/farms/${farmId}/blocks/${blockId}/ai-chat/') |
| `plantDataEnhancedApi` | calls | `endpoint_GET_farm_plant_data_enhanced` | apiClient.get('/v1/farm/plant-data-enhanced') |
| `plantDataEnhancedApi` | calls | `endpoint_POST_farm_plant_data_enhanced` | apiClient.post('/v1/farm/plant-data-enhanced') |
| `plantDataEnhancedApi` | calls | `endpoint_GET_farm_plant_data_enhanced_active` | apiClient.get('/v1/farm/plant-data-enhanced/active') |
| `alertsApi` | calls | `endpoint_POST_farm_farms_farmId_blocks_blockId_alerts` | apiClient.post('/v1/farm/farms/${farmId}/blocks/${blockId}/alerts') |
| `alertsApi` | calls | `endpoint_POST_farm_farms_farmId_blocks_blockId_alerts_id_resolve` | apiClient.post('/v1/farm/farms/${farmId}/blocks/${blockId}/alerts/${alertId}/res |
| `weatherApi` | calls | `endpoint_GET_farm_farms_farmId_weather_current` | apiClient.get('/v1/farm/farms/${farmId}/weather/current') |
| `weatherApi` | calls | `endpoint_GET_farm_farms_farmId_weather_forecast` | apiClient.get('/v1/farm/farms/${farmId}/weather/forecast') |
| `weatherApi` | calls | `endpoint_GET_farm_farms_farmId_weather_agri_data` | apiClient.get('/v1/farm/farms/${farmId}/weather/agri-data') |
| `tasksApi` | calls | `endpoint_GET_farm_tasks_pending_count` | apiClient.get('/v1/farm/tasks/pending-count') |
| `tasksApi` | calls | `endpoint_GET_farm_tasks_my_tasks` | apiClient.get('/v1/farm/tasks/my-tasks') |
| `tasksApi` | calls | `endpoint_POST_farm_tasks` | apiClient.post('/v1/farm/tasks') |
| `tasksApi` | calls | `endpoint_POST_farm_tasks_id_complete` | apiClient.post('/v1/farm/tasks/${taskId}/complete') |
| `inventoryApi` | calls | `endpoint_GET_farm_inventory_summary` | apiClient.get('/v1/farm/inventory/summary') |
| `inventoryApi` | calls | `endpoint_GET_farm_inventory_harvest` | apiClient.get('/v1/farm/inventory/harvest') |
| `inventoryApi` | calls | `endpoint_GET_farm_inventory_input` | apiClient.get('/v1/farm/inventory/input') |
| `inventoryApi` | calls | `endpoint_GET_farm_inventory_asset` | apiClient.get('/v1/farm/inventory/asset') |
| `inventoryApi` | calls | `endpoint_GET_farm_inventory_movements` | apiClient.get('/v1/farm/inventory/movements') |
| `dashboardDataService` | calls | `endpoint_GET_farm_dashboard_summary` | apiClient.get('/v1/farm/dashboard/summary') |
| `dashboardDataService` | calls | `endpoint_GET_sales_dashboard` | apiClient.get('/v1/sales/dashboard') |
| `dashboardService` | calls | `endpoint_GET_dashboard_layout` | apiClient.get('/v1/dashboard/layout') |
| `dashboardService` | calls | `endpoint_PUT_dashboard_layout` | apiClient.put('/v1/dashboard/layout') |
| `hrService` | calls | `endpoint_GET_hr_employees` | apiClient.get('/v1/hr/employees') |
| `hrService` | calls | `endpoint_POST_hr_employees` | apiClient.post('/v1/hr/employees') |
| `hrService` | calls | `endpoint_GET_hr_dashboard` | apiClient.get('/v1/hr/dashboard') |
| `crmService` | calls | `endpoint_GET_crm_customers` | apiClient.get('/v1/crm/customers') |
| `crmService` | calls | `endpoint_POST_crm_customers` | apiClient.post('/v1/crm/customers') |
| `salesService` | calls | `endpoint_GET_sales_orders` | apiClient.get('/v1/sales/orders') |
| `salesService` | calls | `endpoint_POST_sales_orders` | apiClient.post('/v1/sales/orders') |
| `salesService` | calls | `endpoint_GET_sales_inventory` | apiClient.get('/v1/sales/inventory') |
| `salesService` | calls | `endpoint_GET_sales_purchase_orders` | apiClient.get('/v1/sales/purchase-orders') |
| `salesService` | calls | `endpoint_GET_sales_returns` | apiClient.get('/v1/sales/returns') |
| `salesService` | calls | `endpoint_GET_sales_dashboard` | apiClient.get('/v1/sales/dashboard') |
| `logisticsService` | calls | `endpoint_GET_logistics_vehicles` | apiClient.get('/v1/logistics/vehicles') |
