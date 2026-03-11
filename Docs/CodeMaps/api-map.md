# API Map

> Generated: 2026-02-24 10:11 UTC  
> Source: MongoDB `mapper_nodes` (layer=api, node_type=api_endpoint)

## Quick Reference

This map covers all backend API endpoints, routers, request/response schemas,
and their connections to frontend service calls.

**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md) | [frontend-map.md](frontend-map.md)

## API Endpoints (69 total)

### Module: `ai_analytics`

| Endpoint | File | Description |
|----------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |

### Module: `core`

| Endpoint | File | Description |
|----------|------|-------------|
| `DELETE /api/v1/admin/users/{user_id}` | `src/api/v1/admin.py:362` | Admin: soft-delete user (sets deletedAt, retains data 90 days) |
| `DELETE /api/v1/modules/{module_name}` | `src/api/v1/modules.py:295` | Uninstall Docker module: stop container, remove routes (super_admin only) |
| `GET /api/health` | `src/api/health.py:18` | Health check: returns MongoDB and Redis connectivity status |
| `GET /api/metrics` | `src/api/health.py:107` | Response time metrics (total, avg, p50/p95/p99) for API monitoring |
| `GET /api/ready` | `src/api/health.py:76` | Readiness check: service ready if MongoDB is healthy |
| `GET /api/v1/admin/users` | `src/api/v1/admin.py:33` | Admin: paginated user list with role/status/search filters (admin+ only) |
| `GET /api/v1/auth/me` | `src/api/v1/auth.py:200` | Return current authenticated user profile (auth required) |
| `GET /api/v1/dashboard/summary` | `src/api/v1/dashboard.py:56` | Aggregated counts from all modules concurrently (farms, blocks, employees, etc.) |
| `GET /api/v1/dashboard/widgets/{widget_id}/data` | `src/api/v1/dashboard.py:226` | Fetch data for a specific dashboard widget by ID |
| `PATCH /api/v1/admin/users/{user_id}/role` | `src/api/v1/admin.py:179` | Admin: update user role with hierarchy restrictions |
| `POST /api/v1/auth/login` | `src/api/v1/auth.py:88` | Login user; returns TokenResponse or MFALoginResponse if MFA enabled |
| `POST /api/v1/auth/logout` | `src/api/v1/auth.py:144` | Logout: revoke specific or all refresh tokens (auth required) |
| `POST /api/v1/auth/mfa/verify` | `src/api/v1/auth.py:362` | Complete MFA second-factor login with TOTP code or backup code |
| `POST /api/v1/auth/refresh` | `src/api/v1/auth.py:173` | Rotate refresh token and return new access + refresh tokens |
| `POST /api/v1/auth/register` | `src/api/v1/auth.py:41` | Register new user, auto-login with JWT tokens, sends verification email |
| `POST /api/v1/modules/install` | `src/api/v1/modules.py:47` | Install Docker module: validate license, pull image, create container (super_admin only) |
| `PUT /api/v1/admin/users/{user_id}/mfa/reset` | `src/api/v1/admin.py:433` | Admin: reset MFA for locked-out user, logs to admin_audit_log |

### Module: `crm`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |

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
| `GET /weather` | `src/modules/farm_manager/api/v1/weather.py:1` | Weather endpoints: current, forecast, agri-data, cache stats, refresh. | router |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/virtual-crops` | `src/modules/farm_manager/api/v1/blocks.py:471` | Add a virtual crop sub-block to a multi-crop parent block. | add_virtual_crop |

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
| `CRUD /sales/inventory` | `src/modules/sales/api/v1/inventory.py:1` | Sales harvest inventory management. | router |
| `CRUD /sales/orders` | `src/modules/sales/api/v1/orders.py:1` | Sales order CRUD with customer integration and status tracking. | router |
| `CRUD /sales/purchase-orders` | `src/modules/sales/api/v1/purchase_orders.py:1` | Purchase order management for procurement. | router |
| `CRUD /sales/returns` | `src/modules/sales/api/v1/returns.py:1` | Sales returns processing and restocking. | router |
| `GET /sales/dashboard` | `src/modules/sales/api/v1/dashboard.py:1` | Sales dashboard statistics and summaries. | router |

## API Router Files (77 total)

| Name | File | Description |
|------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |
| `DELETE /api/v1/admin/users/{user_id}` | `src/api/v1/admin.py:362` | Admin: soft-delete user (sets deletedAt, retains data 90 days) |
| `DELETE /api/v1/modules/{module_name}` | `src/api/v1/modules.py:295` | Uninstall Docker module: stop container, remove routes (super_admin only) |
| `GET /api/health` | `src/api/health.py:18` | Health check: returns MongoDB and Redis connectivity status |
| `GET /api/metrics` | `src/api/health.py:107` | Response time metrics (total, avg, p50/p95/p99) for API monitoring |
| `GET /api/ready` | `src/api/health.py:76` | Readiness check: service ready if MongoDB is healthy |
| `GET /api/v1/admin/users` | `src/api/v1/admin.py:33` | Admin: paginated user list with role/status/search filters (admin+ only) |
| `GET /api/v1/auth/me` | `src/api/v1/auth.py:200` | Return current authenticated user profile (auth required) |
| `GET /api/v1/dashboard/summary` | `src/api/v1/dashboard.py:56` | Aggregated counts from all modules concurrently (farms, blocks, employees, etc.) |
| `GET /api/v1/dashboard/widgets/{widget_id}/data` | `src/api/v1/dashboard.py:226` | Fetch data for a specific dashboard widget by ID |
| `PATCH /api/v1/admin/users/{user_id}/role` | `src/api/v1/admin.py:179` | Admin: update user role with hierarchy restrictions |
| `POST /api/v1/auth/login` | `src/api/v1/auth.py:88` | Login user; returns TokenResponse or MFALoginResponse if MFA enabled |
| `POST /api/v1/auth/logout` | `src/api/v1/auth.py:144` | Logout: revoke specific or all refresh tokens (auth required) |
| `POST /api/v1/auth/mfa/verify` | `src/api/v1/auth.py:362` | Complete MFA second-factor login with TOTP code or backup code |
| `POST /api/v1/auth/refresh` | `src/api/v1/auth.py:173` | Rotate refresh token and return new access + refresh tokens |
| `POST /api/v1/auth/register` | `src/api/v1/auth.py:41` | Register new user, auto-login with JWT tokens, sends verification email |
| `POST /api/v1/modules/install` | `src/api/v1/modules.py:47` | Install Docker module: validate license, pull image, create container (super_admin only) |
| `PUT /api/v1/admin/users/{user_id}/mfa/reset` | `src/api/v1/admin.py:433` | Admin: reset MFA for locked-out user, logs to admin_audit_log |
| `api/health.py` | `src/api/health.py:1` | Health, readiness, and metrics endpoints for the API hub | router, health_check, readiness_check, get_metrics, get_slow_requests, get_endpo |
| `api/routes.py` | `src/api/routes.py:1` | Consolidates all v1 API routers (auth, users, admin, modules, dashboard, AI) | api_router |
| `api/v1/admin.py` | `src/api/v1/admin.py:1` | Admin-only endpoints for user management (role/status updates, soft delete, MFA reset) | router, list_users, get_user_by_id, update_user_role, update_user_status, delete |
| `api/v1/auth.py` | `src/api/v1/auth.py:1` | Auth endpoints: register, login (MFA-aware), logout, token refresh, email verify, password reset, MFA CRUD | router, register, login, logout, refresh_token, get_current_user_info, update_cu |
| `api/v1/dashboard.py` | `src/api/v1/dashboard.py:1` | Dashboard endpoints: aggregated summary across all modules, widget data fetch/refresh/bulk | router, get_dashboard_summary, get_widget_data, refresh_widget_data, get_bulk_wi |
| `api/v1/modules.py` | `src/api/v1/modules.py:1` | Module management API (super_admin only): install/uninstall Docker modules, audit log | router, install_module, list_installed_modules, get_module_status, uninstall_mod |
| `api/v1/users.py` | `src/api/v1/users.py:1` | User CRUD endpoints with RBAC; users can manage themselves, admins manage all | router, list_users, get_user, update_user, delete_user, change_user_role, activa |
| `main.py` | `src/main.py:1` | FastAPI app entry point: initializes middleware, routes, startup/shutdown events | app, startup_event, shutdown_event, root, global_exception_handler |
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |
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
| `GET /weather` | `src/modules/farm_manager/api/v1/weather.py:1` | Weather endpoints: current, forecast, agri-data, cache stats, refresh. | router |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/virtual-crops` | `src/modules/farm_manager/api/v1/blocks.py:471` | Add a virtual crop sub-block to a multi-crop parent block. | add_virtual_crop |
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
| `CRUD /sales/inventory` | `src/modules/sales/api/v1/inventory.py:1` | Sales harvest inventory management. | router |
| `CRUD /sales/orders` | `src/modules/sales/api/v1/orders.py:1` | Sales order CRUD with customer integration and status tracking. | router |
| `CRUD /sales/purchase-orders` | `src/modules/sales/api/v1/purchase_orders.py:1` | Purchase order management for procurement. | router |
| `CRUD /sales/returns` | `src/modules/sales/api/v1/returns.py:1` | Sales returns processing and restocking. | router |
| `GET /sales/dashboard` | `src/modules/sales/api/v1/dashboard.py:1` | Sales dashboard statistics and summaries. | router |

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
| `sales.api.orders` | calls | `sales.service.OrderService` | Order API delegates to OrderService. |
| `logistics.api.shipments` | calls | `logistics.service.ShipmentService` | Shipment API delegates to ShipmentService. |
| `marketing.api.campaigns` | calls | `marketing.service.CampaignService` | Campaign API delegates to CampaignService. |
| `ai_analytics.api.chat` | calls | `ai_analytics.service.QueryEngine` | AI chat API delegates to QueryEngine for NL-to-MongoDB pipeline. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.GeminiService` | QueryEngine uses GeminiService for NL-to-MongoDB query generation. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.SchemaService` | QueryEngine uses SchemaService to discover MongoDB schemas. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.util.QueryValidator` | QueryEngine validates generated queries via QueryValidator. |
| `ai_analytics.service.QueryEngine` | calls | `ai_analytics.service.CostTrackingService` | QueryEngine logs query costs via CostTrackingService. |
| `page::FarmDashboardPage` | calls | `service::farmApi` | FarmDashboardPage calls getAvailableFarmingYears from farmApi |
| `component::FarmDashboard` | calls | `service::farmApi` | FarmDashboard calls farmApi for dashboard metrics |
| `component::FarmList` | calls | `service::farmApi` | FarmList calls farmApi to fetch farms |
| `component::BlockDetail` | calls | `service::farmApi` | BlockDetail calls farmApi for block data |
| `component::BlockCard` | calls | `service::farmApi` | BlockCard calls farmApi for block summary |
| `component::FarmSelector` | calls | `service::farmApi` | FarmSelector calls getFarms from farmApi |
| `component::BlockDetailsModal` | calls | `service::farmApi` | BlockDetailsModal calls getBlockHarvestSummary from farmApi |
| `component::CreateFarmModal` | calls | `service::farmApi` | CreateFarmModal calls farmApi to create farms |
| `component::PlantDataCard` | calls | `service::plantDataEnhancedApi` | PlantDataCard calls formatFarmType from plantDataEnhancedApi |
| `page::PlantDataLibrary` | calls | `service::plantDataEnhancedApi` | PlantDataLibrary calls plantDataEnhancedApi for CRUD |
| `component::MainLayout` | calls | `service::tasksApi` | MainLayout calls getPendingTaskCount from tasksApi |
| `hook::useFarmAIChat` | calls | `service::farmApi` | useFarmAIChat calls sendFarmAIChat and confirmFarmAIAction |
| `hook::useFarmAnalytics` | calls | `service::api` | useFarmAnalytics calls apiClient.get |
| `hook::useBlockAnalytics` | calls | `service::api` | useBlockAnalytics calls apiClient.get |
| `hook::useGlobalAnalytics` | calls | `service::api` | useGlobalAnalytics calls apiClient.get |
| `hook::useAIAnalytics` | calls | `service::api` | useAIAnalytics calls apiClient.post |
| `hook::useDashboardData` | calls | `service::api` | useDashboardData calls apiClient.get |
| `hook::useBlockActions` | calls | `service::api` | useBlockActions calls apiClient |
| `hook::useWeatherData` | calls | `service::weatherApi` | useWeatherData calls weatherApi.getAgriData |
| `hook::useFarms` | calls | `service::farmApi` | useFarms hooks call farmApi via React Query |
| `hook::useDashboard` | calls | `service::dashboardDataService` | useDashboard hooks call dashboardDataService |
| `hook::useSales` | calls | `service::salesService` | useSales hooks call salesApi |
| `hook::useMFA` | calls | `service::api` | useMFA hooks call apiClient |
| `hook::useFarmingYears` | calls | `service::farmApi` | useFarmingYears hooks call farmApi |
| `store::useAuthStore` | calls | `service::authService` | useAuthStore calls authService for auth operations |
| `store::useDashboardStore` | calls | `service::dashboardDataService` | useDashboardStore calls dashboardDataService |
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
