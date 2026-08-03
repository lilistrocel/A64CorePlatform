# API Map

> Generated: 2026-08-03 12:15 UTC  
> Source: MongoDB `mapper_nodes` (layer=api, node_type=api_endpoint)

## Quick Reference

This map covers all backend API endpoints, routers, request/response schemas,
and their connections to frontend service calls.

**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md) | [frontend-map.md](frontend-map.md)

> ### ⚠️ Auth is NOT shown in these tables
>
> Every row below looks the same whether the route requires authentication
> or not. As of T-804 exactly **one** endpoint in the platform is public:
>
> ```
> GET /api/v1/public/genetics/i/{token}[/{vesselNo}]
> ```
>
> It is mounted as a SEPARATE router with its own prefix in
> `src/modules/genetics/register.py` — never on the authenticated
> `api_router` — so an unauthenticated route cannot be added to the
> authenticated surface by accident. It serves two tiers: a limited
> anonymous payload, and a fuller one when a valid bearer token is
> present, resolved by an optional dependency that fails CLOSED.
>
> Before treating any other row as public, read the route's own
> `Depends(...)`. Do not infer auth from this map.

## API Endpoints (114 total)

### Module: `ai_analytics`

| Endpoint | File | Description |
|----------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |

### Module: `core`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /admin` | `src/api/v1/admin.py:39` | Admin-only endpoints (super_admin/admin RBAC). New today: GET/PATCH /admin/deployment-settings — resolves and edits the env->db->unset managed keys (PUBLIC_BASE_URL, FRONTEND_URL, CF_ACCESS_ENABLED, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, CF_ACCESS_EXCLUSIVE, CF_ACCESS_JIT_PROVISION, CF_ACCESS_DEFAULT_ROLE), masking the two Cloudflare secrets and requiring the actor's current password + audit log entry. Also: GET /admin/users (paginated list, filters), GET/{user_id}, PATCH /{user_id}/role, PATCH /{user_id}/status, PATCH /{user_id}/organization (super_admin only), DELETE /{user_id} (soft delete), PUT /{user_id}/mfa/reset (admin-forced MFA reset with audit trail + notification log). | router |
| `CRUD /auth` | `src/api/v1/auth.py:43` | Authentication endpoints: POST /register, POST /login (password or MFA challenge), GET /cf-access/status and POST /cf-access/session (Cloudflare Access dual-mode SSO — new today: verifies the CF Access JWT via JWKS and mints the same app JWT any other login path issues, or JIT-provisions an inactive account), POST /logout, POST /refresh, GET /me (extends UserResponse with Wave 0 capabilities via system.build_capabilities_response) and PATCH /me, POST /send-verification-email, POST /verify-email, POST /request-password-reset, POST /reset-password, and the MFA family (POST /mfa/verify, GET /mfa/status, POST /mfa/setup, POST /mfa/enable, POST /mfa/disable, POST /mfa/backup-codes[/regenerate]). Register/login are gated by CF_ACCESS_EXCLUSIVE (break-glass: password auth disabled for requests that arrived through Cloudflare). | router, CFAccessStatusResponse, UserMeResponse |
| `CRUD /dashboard` | `src/api/v1/dashboard.py:22` | CCM Dashboard widget data: GET /dashboard/summary (aggregated counts across farms, blocks, employees, customers, sales_orders, vehicles, shipments, campaigns, users collections via concurrent asyncio.gather aggregation pipelines), GET /widgets/{widget_id}/data, POST /widgets/{widget_id}/refresh, POST /widgets/bulk (up to 50 widget IDs, partial-failure tolerant), GET /dashboard/health. | router, ModuleSummary, DashboardSummaryResponse |
| `CRUD /divisions` | `src/api/v1/divisions.py:16` | GET /divisions/my-divisions (accessible divisions for current user), POST /{division_id}/select (switch active division, updates user.defaultDivisionId), GET /{division_id}, PATCH /{division_id} (admin-level role required). | router |
| `CRUD /modules` | `src/api/v1/modules.py:40` | Docker Compose-based modular application management, super_admin only, all writes audit-logged. POST /modules/install (license validation, image trust check, container security config), GET /modules/installed (paginated), GET /{module_name}/status (runtime metrics: CPU/memory/uptime), DELETE /{module_name} (graceful stop + NGINX routing removal), GET /modules/audit-log (filterable, 90-day TTL), GET /modules/health (Docker daemon + DB connectivity, no auth required). | router |
| `CRUD /organizations` | `src/api/v1/organizations.py:28` | POST /organizations/ (create, super_admin only), GET /organizations/ (list, paginated), GET/{organization_id}, PATCH /{organization_id} (admin), PATCH /{organization_id}/modules (Wave 0 T-059.4 tenant module toggles: financeEnabled + publicInfoPage partial update, super_admin only, audit-logged with before/after modules snapshot, invalidates the Redis tenant-flag cache so the finance outbox writer and capabilities endpoint pick up the change immediately), GET /{organization_id}/divisions, POST /{organization_id}/divisions (admin). _require_super_admin is imported by core.api.admin for its deployment-settings endpoints. | router, _require_admin, _require_super_admin |
| `CRUD /users` | `src/api/v1/users.py:20` | Self-service and admin user management: GET (paginated list, admin only), GET/POST/DELETE /me/tutorials (per-user tutorial dismissal state stored in users.metadata.tutorialsSeen, declared before /{user_id} so 'me' isn't captured by the path param), GET/PATCH/DELETE /{user_id}, PATCH /{user_id}/role, POST /{user_id}/activate, POST /{user_id}/deactivate. Permission checks via can_manage_user/can_change_role from middleware.permissions. | router |
| `FastAPI app bootstrap` | `src/main.py:37` | Application entry point. Creates the FastAPI instance, registers CORS/Timing/RateLimit/DivisionContext middleware (applied in reverse-add order: Timing outermost, then RateLimit, then DivisionContext), mounts the /admin static SPA, includes health.router at /api and api_router at /api/v1, defines the global exception handler and root endpoint, and runs startup/shutdown events: connects MongoDB + Redis, initializes the Port Manager, seeds a default super_admin/organization/division (seed_admin), and loads plugin modules (farm_manager, etc.) via the plugin system. | app, seed_admin, startup_event, shutdown_event, root |
| `GET /health, /ready, /metrics*` | `src/api/health.py:15` | Mounted at /api (not /api/v1). Endpoints: GET /health (MongoDB + Redis connectivity, overall healthy/degraded), GET /ready (readiness probe), GET /test-500 and GET /test-malformed (Feature #138/#139 error-handling verification endpoints, intentionally broken), GET /metrics, GET /metrics/slow-requests, GET /metrics/endpoints (Feature #372 response-time monitoring, backed by response_time_collector from the Timing middleware). | router |
| `GET /industries` | `src/api/v1/industries.py:18` | GET /industries/ (static metadata for vegetable_fruits and mushroom IndustryType values, powers the frontend industry selector), GET /{industry_type}/modules (loaded plugin modules for an industry — currently returns all loaded modules as a safe fallback pending Phase 1.5 manifest industryType scoping). | router |
| `GET /system/capabilities` | `src/api/v1/system.py:26` | Wave 0 (T-059) per-tenant module capability discovery. GET /system/capabilities returns finance module status (operator-controlled `enabled` flag + runtime-detected `reachable`/`version`), scoped to the caller's organizationId. build_capabilities_response is shared with core.api.auth's GET /me so the two endpoints can never drift. | router, CapabilitiesResponse, FinanceModuleCapability, ModuleCapabilities, build |
| `v1 API router aggregation` | `src/api/routes.py:1` | Consolidates all /api/v1 routers: auth, users, admin, modules, dashboard, organizations, divisions, industries, system (Wave 0 capability discovery), ai_analytics chat (/ai/*), ai_assistant (/ai/assistant/*, T-008 Claude replacement for Gemini agents), and attachments (/attachments/*, T-053 reusable document attachment infrastructure). Farm management routes (/api/v1/farm/*) are NOT included here — they are dynamically loaded at startup by the farm_manager plugin module via src/core/plugin_system/. | api_router |

### Module: `crm`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |

### Module: `farm_manager`

| Endpoint | File | Description |
|----------|------|-------------|
| `CRUD /ai-dashboard` | `src/modules/farm_manager/api/v1/ai_dashboard.py:25` | Automated farm inspection reports backed by AIDashboardService (multi-step data collection + AI summary pass). GET /latest (most recent report, 404 if none), GET /reports (paginated history), POST /generate (synchronous 30-60s manual trigger, admin/super_admin only). | router, get_latest_report, list_reports, generate_report |
| `CRUD /ai-hub` | `src/modules/farm_manager/api/v1/ai_hub.py:40` | Unified AI Hub interface, super_admin only for all 6 endpoints. POST /chat (message to a Hub section assistant — Control/Monitor/Report/Advise; Control can produce pending write actions for relay control/automation), POST /confirm (confirm/deny a pending write action), POST /transcribe (audio transcription via Vertex AI), GET /history/{section}, POST /tts (ElevenLabs text-to-speech), POST /export-report (PDF/Excel export). | router, chat, confirm_action, transcribe_audio, get_history, text_to_speech, exp |
| `CRUD /config` | `src/modules/farm_manager/api/v1/config.py:1` | Spacing standards CRUD, plant calculator, farming year configuration. | router |
| `CRUD /config/watchdog` | `src/modules/farm_manager/api/v1/watchdog.py:18` | Telegram-based watchdog alerting configuration and control, all endpoints admin+ only (_require_admin checks role in ('admin','super_admin')). GET/PATCH config (bot token masked in responses), POST test-notification (send a test Telegram message), GET status, POST trigger-check (manual watchdog run), GET history (past notification log). | router, get_watchdog_config, update_watchdog_config, test_watchdog_notification, |
| `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | `src/modules/farm_manager/api/v1/block_alerts.py:1` | CRUD for block alerts with resolve/dismiss, active alerts, and farm-level listing. | router, farm_router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/cameras` | `src/modules/farm_manager/api/v1/cameras.py:23` | Camera integration for a block's SenseHub. list_cameras (live MCP call, cache fallback on unreachable hub), capture_snapshot, list_snapshots/latest_snapshots (cached snapshot browsing), serve_snapshot_image (serves image files from local storage). | router, list_cameras, capture_snapshot, list_snapshots, latest_snapshots, serve_ |
| `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | `src/modules/farm_manager/api/v1/block_harvests.py:1` | CRUD for block harvest records with summary and farm-level aggregation. | router, farm_router |
| `CRUD /inventory` | `src/modules/farm_manager/api/v1/inventory.py:1` | Farm inventory: harvest/input/asset CRUD, movements, transfers, waste management. | router |
| `CRUD /plant-data` | `src/modules/farm_manager/api/v1/plant_data.py:1` | Simple plant data CRUD with CSV import/export. | router |
| `CRUD /plant-data-enhanced` | `src/modules/farm_manager/api/v1/plant_data_enhanced.py:1` | Enhanced plant data with growth cycles, fertigation schedules, search, clone. | router |
| `CRUD /plantings` | `src/modules/farm_manager/api/v1/plantings.py:1` | Planting plan management: create, mark planted, get, list. | router |
| `CRUD /sensehub` | `src/modules/farm_manager/api/v1/sensehub.py:1` | SenseHub proxy: connect/disconnect, dashboard, equipment, automations, alerts, relay control. | router |
| `CRUD /sensehub-cache` | `src/modules/farm_manager/api/v1/sensehub_cache.py:18` | Query layer over cached SenseHub data (equipment, lab readings, alerts) plus sync-service management: GET /status, GET /sync-history (implied), POST to trigger a manual sync, and cached-data getters that serve reads without hitting the live SenseHub MCP connection every time. | router, get_sync_status, get_sync_history, trigger_manual_sync, get_cached_equip |
| `CRUD /tasks` | `src/modules/farm_manager/api/v1/tasks.py:1` | Farm task management: my-tasks, pending-count, CRUD, complete, harvest entry. | router |
| `DELETE /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:182` | Delete farm with cascade deletion of blocks, harvests, alerts, archives. | delete_farm |
| `DELETE /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:210` | Delete a block with CASCADE deletion via CascadeDeletionService — archives and harvests are moved to deleted_* collections rather than hard-deleted. Requires farm.manage; accepts an optional deletion reason. | delete_block |
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
| `GET /farms/{farm_id}/blocks/{block_id}/children` | `src/modules/farm_manager/api/v1/blocks.py:563` | Lists active virtual child blocks of a physical block (multi-crop area allocation within one physical space); empty list for virtual or childless blocks. | get_block_children |
| `GET /farms/{farm_id}/blocks/{block_id}/empty-virtual/preview` | `src/modules/farm_manager/api/v1/blocks.py:672` | Dry-run preview of what empty_virtual_block would transfer/delete, without mutating anything. | preview_empty_virtual_block |
| `GET /farms/{farm_id}/blocks/{block_id}/kpi` | `src/modules/farm_manager/api/v1/blocks.py:260` | Comprehensive KPI dashboard for a block: current status/on-track flag, days since planting/until harvest, predicted-vs-actual yield efficiency, harvest summary, and active alert count. | get_block_kpi |
| `GET /farms/{farm_id}/blocks/{block_id}/valid-transitions` | `src/modules/farm_manager/api/v1/blocks.py:362` | Dynamically computes valid next-states for a block from its current state and its plant's growth cycle (e.g. skips fruiting if fruitingDays=0) — powers UI action availability. | get_valid_status_transitions |
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
| `GET+DELETE /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:1001` | GET returns the block's IoT controller config (address/port/enabled/apiKey/relayLabels/lastConnected) or 404 if unconfigured. DELETE removes the controller config (farm.manage) without touching any other block data — a decommission/switch-to-manual operation. | get_iot_controller, delete_iot_controller |
| `GET+PUT /iot-proxy` | `src/modules/farm_manager/api/v1/iot_proxy.py:18` | CORS-avoidance proxy gateway for direct IoT controller (Raspberry Pi/ESP32) HTTP communication. Both GET and PUT accept a URL-encoded target `url` query param plus an optional forwarded apiKey/X-API-Key header, with a 5-second timeout. Requires authentication only (any logged-in user). | router, proxy_get_request, proxy_put_request |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:170` | Update block fields (farm.manage permission). Validates the block belongs to the specified farm and that block name stays unique within the farm. | update_block |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /ai-monitor/chat` | `src/modules/farm_manager/api/v1/global_ai_chat.py:19` | Single read-only global farm-monitoring AI assistant endpoint (any authenticated user). Read-only access to live sensor readings/alerts across all farms/blocks; no write tools, so no confirmation flow exists (unlike ai_hub/farm_level_ai_chat). | router, chat |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/ai-chat` | `src/modules/farm_manager/api/v1/farm_level_ai_chat.py:27` | Farm-scoped (not per-block) Gemini AI assistant for monitoring all blocks on one farm and controlling SenseHub-connected equipment. POST / (chat) and POST /confirm (confirm a pending write action), mirroring the ai_hub Control-section confirm flow but scoped to a single farm rather than the whole platform. | router, chat, confirm_action |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/empty-virtual` | `src/modules/farm_manager/api/v1/blocks.py:602` | Empties and hard-deletes a virtual block via VirtualBlockService: archives the current cycle, transfers completed/in-progress tasks and harvest records to the parent (tagged with sourceBlockCode), deletes pending tasks, returns allocated area to the parent's budget, and updates parent status if needed. Requires farm.operate. | empty_virtual_block |
| `POST /farms/{farm_id}/blocks/{block_id}/refresh-plant-data` | `src/modules/farm_manager/api/v1/blocks.py:781` | Re-snapshots the plant-library record onto the block (rewrites plantDataVersion/plantDataSnapshot) and recomputes waste-aware predicted yield, yield-efficiency percent, and expected harvest/status-change dates. Only allowed pre-harvest (planned/growing/fruiting states); 409 otherwise. Requires farm.operate. | refresh_plant_data |
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
| `CRUD /genetics/accessions` | `src/modules/genetics/api/v1/accessions.py:1` | T-800 Physical material CRUD, plus /by-code/{code} label lookup for scanning and POST /{id}/split to break vessels out of a batch record. Founding material only; clones and crosses go through /propagations. T-806: GET /by-token/{token}?vesselNo=N — authenticated counterpart to the public label-info page, turns a scanned {token, vesselNo} into the full internal Accession (UUIDs included). Reuses public.py's _load_accession_by_token and vessel_resolver.resolve_vessel verbatim. Declared before /{accession_id} (route-ordering guard, verified live, not just structurally safe). | router, SplitResult |
| `CRUD /genetics/lines` | `src/modules/genetics/api/v1/lines.py:1` | T-800 Genetic line CRUD — the named identity (strain/variety/bloodline). List returns LineWithStats so accession rollups survive response-model filtering. DELETE is a soft deactivate; hard deletion is unsupported because accessions and propagation events reference the line. T-807: GET /{id}/dependents (counts accessions/propagations/observations/child lines/harvests) + DELETE /{id}/purge, hard-delete only at zero dependents (409 otherwise), genetics.delete tier. T-809: same purge route's ?cascade=true escalation — super_admin-only (genetics.delete.cascade), body {"confirm": "<exact line code>"} (GitHub repo-deletion pattern, mismatch is 400), hard-refuses even with a correct confirm when the line has harvests or child lines, ?dryRun=true previews without requiring confirm. Real cascade deletes are audit-logged to admin_audit_log with a full pre-deletion snapshot. | router, CascadePurgeConfirm |
| `CRUD /genetics/media` | `src/modules/genetics/api/v1/media.py:1` | T-800 Medium recipes and prepared batches, plus GET /additives/{name}/accessions — the experiment readout returning every accession ever grown on a medium containing an additive. | router, AdditiveReadout |
| `CRUD /genetics/observations` | `src/modules/genetics/api/v1/observations.py:1` | T-800 Dated observations against accessions, plus POST /{id}/promote which turns a flagged novel trait into its own genetic line with a founding accession. | router, PromotionResult |
| `CRUD /genetics/propagations` | `src/modules/genetics/api/v1/propagations.py:1` | T-800 Clone/cross execution and the transfer log. GET /methods exposes each method's reproduction mode, parent arity and generation effects, which drives the frontend's live G/F preview. T-808: PATCH /{event_id} amends ONLY performedAt (a factual date correction, e.g. logged late) — attribution and every structural field stay immutable through this or any route. Cascades to each result accession's acquiredAt, but only where it still equals the event's OLD performedAt (an already-hand-corrected accession is skipped, not overwritten). amendedAt/amendedBy always stamped — the correction is recorded, never made invisible. Rejects a future performedAt with 400. Permission: genetics.edit (bench tier). | router, PropagationOutcome, MethodInfo |
| `GET /genetics/accessions/{id}/labels` | `src/modules/genetics/api/v1/labels.py:1` | T-804. Renders a print-ready label PDF for a Brother QL-800, one page per vessel in [from, to]. Tape sizes: 29x90 and 17x87 fixed die-cut, or 62xN continuous (N = feed length mm, 12-100, parsed/validated by _parse_tape_spec/_tape_dimensions, 400 on anything malformed or out of range, never a 500). Line 1 (accession code/vessel) draws in Space Mono Bold, lines 2-4 in Hanken Grotesk — both vendored TTFs under src/modules/genetics/assets/fonts/, embedded via reportlab with a Helvetica fallback that has never actually fired. A small brand mark (src/modules/genetics/assets/brand/mark-mono-1bit.png) draws only when real measured spare space exists (below the text block, or horizontally right of lines 2/3 as a fallback), 5-8mm, never a fixed corner guess. Printing raises labelledVesselCount to max(current, to) — read-only in permission (require_view) but not in effect. | router, compute_qr_geometry, build_label_payload |
| `GET /genetics/dashboard` | `src/modules/genetics/api/v1/dashboard.py:1` | T-800 Repo-wide counters: lines by biological domain, live material, 30-day activity, novel traits awaiting promotion, and the senescence watch list. | router |
| `GET /genetics/lineage` | `src/modules/genetics/api/v1/lineage.py:1` | T-800 Lineage DAG (/graph) and flattened ancestry breadcrumb (/ancestry/{id}). Returns flat nodes+edges rather than a nested tree because a cross gives a node two parents. | router |
| `GET /public/genetics/i/{token}[/{vesselNo}]` | `src/modules/genetics/api/v1/public.py:1` | T-804/T-806 part 3. The platform's FIRST unauthenticated route, mounted on its own router (see genetics.register) so no route can become public by accident. Optional auth (_optional_current_user, fails closed on any error to anonymous, never raises) selects between two hand-built response shapes — PublicAccessionInfo (anonymous, respects the organization's PublicInfoPageConfig show* flags) and AuthenticatedAccessionInfo (adds accessionId + per-node tokens, ignores the show* flags entirely) — response_model is deliberately unset; the two explicit allowlists ARE the leakage guard, never response filtering. enabled=false on PublicInfoPageConfig 404s anonymous callers only (a public-exposure switch, not an access-control gate). Byte-identical 404 for every failure mode so an unknown token can't be distinguished from a disabled page. Rate-limited via src.middleware.rate_limit. | router, PublicAccessionInfo, AuthenticatedAccessionInfo, PublicLineageGraph, Aut |
| `GET/DELETE /genetics/maintenance/orphans` | `src/modules/genetics/api/v1/maintenance.py:1` | T-809. Org-wide database hygiene, distinct from the line-scoped cascade purge on lines.py. GET /orphans (genetics.delete tier) is read-only, finds accessions/propagation events/observations whose lineId (every referenced lineId, for propagation events) matches no existing line — a null/absent lineId is explicitly NOT an orphan. DELETE /orphans (super_admin, genetics.maintenance) removes exactly what GET reported, by explicit id list; ?dryRun=true previews without deleting. Real deletes audit-logged to admin_audit_log with the full pre-deletion snapshot. | router |

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

## API Router Files (115 total)

| Name | File | Description |
|------|------|-------------|
| `POST /ai/chat` | `src/modules/ai_analytics/api/v1/chat.py:1` | AI analytics chat endpoint: NL-to-MongoDB query via Vertex AI Gemini. | router |
| `CRUD /admin` | `src/api/v1/admin.py:39` | Admin-only endpoints (super_admin/admin RBAC). New today: GET/PATCH /admin/deployment-settings — resolves and edits the env->db->unset managed keys (PUBLIC_BASE_URL, FRONTEND_URL, CF_ACCESS_ENABLED, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, CF_ACCESS_EXCLUSIVE, CF_ACCESS_JIT_PROVISION, CF_ACCESS_DEFAULT_ROLE), masking the two Cloudflare secrets and requiring the actor's current password + audit log entry. Also: GET /admin/users (paginated list, filters), GET/{user_id}, PATCH /{user_id}/role, PATCH /{user_id}/status, PATCH /{user_id}/organization (super_admin only), DELETE /{user_id} (soft delete), PUT /{user_id}/mfa/reset (admin-forced MFA reset with audit trail + notification log). | router |
| `CRUD /auth` | `src/api/v1/auth.py:43` | Authentication endpoints: POST /register, POST /login (password or MFA challenge), GET /cf-access/status and POST /cf-access/session (Cloudflare Access dual-mode SSO — new today: verifies the CF Access JWT via JWKS and mints the same app JWT any other login path issues, or JIT-provisions an inactive account), POST /logout, POST /refresh, GET /me (extends UserResponse with Wave 0 capabilities via system.build_capabilities_response) and PATCH /me, POST /send-verification-email, POST /verify-email, POST /request-password-reset, POST /reset-password, and the MFA family (POST /mfa/verify, GET /mfa/status, POST /mfa/setup, POST /mfa/enable, POST /mfa/disable, POST /mfa/backup-codes[/regenerate]). Register/login are gated by CF_ACCESS_EXCLUSIVE (break-glass: password auth disabled for requests that arrived through Cloudflare). | router, CFAccessStatusResponse, UserMeResponse |
| `CRUD /dashboard` | `src/api/v1/dashboard.py:22` | CCM Dashboard widget data: GET /dashboard/summary (aggregated counts across farms, blocks, employees, customers, sales_orders, vehicles, shipments, campaigns, users collections via concurrent asyncio.gather aggregation pipelines), GET /widgets/{widget_id}/data, POST /widgets/{widget_id}/refresh, POST /widgets/bulk (up to 50 widget IDs, partial-failure tolerant), GET /dashboard/health. | router, ModuleSummary, DashboardSummaryResponse |
| `CRUD /divisions` | `src/api/v1/divisions.py:16` | GET /divisions/my-divisions (accessible divisions for current user), POST /{division_id}/select (switch active division, updates user.defaultDivisionId), GET /{division_id}, PATCH /{division_id} (admin-level role required). | router |
| `CRUD /modules` | `src/api/v1/modules.py:40` | Docker Compose-based modular application management, super_admin only, all writes audit-logged. POST /modules/install (license validation, image trust check, container security config), GET /modules/installed (paginated), GET /{module_name}/status (runtime metrics: CPU/memory/uptime), DELETE /{module_name} (graceful stop + NGINX routing removal), GET /modules/audit-log (filterable, 90-day TTL), GET /modules/health (Docker daemon + DB connectivity, no auth required). | router |
| `CRUD /organizations` | `src/api/v1/organizations.py:28` | POST /organizations/ (create, super_admin only), GET /organizations/ (list, paginated), GET/{organization_id}, PATCH /{organization_id} (admin), PATCH /{organization_id}/modules (Wave 0 T-059.4 tenant module toggles: financeEnabled + publicInfoPage partial update, super_admin only, audit-logged with before/after modules snapshot, invalidates the Redis tenant-flag cache so the finance outbox writer and capabilities endpoint pick up the change immediately), GET /{organization_id}/divisions, POST /{organization_id}/divisions (admin). _require_super_admin is imported by core.api.admin for its deployment-settings endpoints. | router, _require_admin, _require_super_admin |
| `CRUD /users` | `src/api/v1/users.py:20` | Self-service and admin user management: GET (paginated list, admin only), GET/POST/DELETE /me/tutorials (per-user tutorial dismissal state stored in users.metadata.tutorialsSeen, declared before /{user_id} so 'me' isn't captured by the path param), GET/PATCH/DELETE /{user_id}, PATCH /{user_id}/role, POST /{user_id}/activate, POST /{user_id}/deactivate. Permission checks via can_manage_user/can_change_role from middleware.permissions. | router |
| `FastAPI app bootstrap` | `src/main.py:37` | Application entry point. Creates the FastAPI instance, registers CORS/Timing/RateLimit/DivisionContext middleware (applied in reverse-add order: Timing outermost, then RateLimit, then DivisionContext), mounts the /admin static SPA, includes health.router at /api and api_router at /api/v1, defines the global exception handler and root endpoint, and runs startup/shutdown events: connects MongoDB + Redis, initializes the Port Manager, seeds a default super_admin/organization/division (seed_admin), and loads plugin modules (farm_manager, etc.) via the plugin system. | app, seed_admin, startup_event, shutdown_event, root |
| `GET /health, /ready, /metrics*` | `src/api/health.py:15` | Mounted at /api (not /api/v1). Endpoints: GET /health (MongoDB + Redis connectivity, overall healthy/degraded), GET /ready (readiness probe), GET /test-500 and GET /test-malformed (Feature #138/#139 error-handling verification endpoints, intentionally broken), GET /metrics, GET /metrics/slow-requests, GET /metrics/endpoints (Feature #372 response-time monitoring, backed by response_time_collector from the Timing middleware). | router |
| `GET /industries` | `src/api/v1/industries.py:18` | GET /industries/ (static metadata for vegetable_fruits and mushroom IndustryType values, powers the frontend industry selector), GET /{industry_type}/modules (loaded plugin modules for an industry — currently returns all loaded modules as a safe fallback pending Phase 1.5 manifest industryType scoping). | router |
| `GET /system/capabilities` | `src/api/v1/system.py:26` | Wave 0 (T-059) per-tenant module capability discovery. GET /system/capabilities returns finance module status (operator-controlled `enabled` flag + runtime-detected `reachable`/`version`), scoped to the caller's organizationId. build_capabilities_response is shared with core.api.auth's GET /me so the two endpoints can never drift. | router, CapabilitiesResponse, FinanceModuleCapability, ModuleCapabilities, build |
| `v1 API router aggregation` | `src/api/routes.py:1` | Consolidates all /api/v1 routers: auth, users, admin, modules, dashboard, organizations, divisions, industries, system (Wave 0 capability discovery), ai_analytics chat (/ai/*), ai_assistant (/ai/assistant/*, T-008 Claude replacement for Gemini agents), and attachments (/attachments/*, T-053 reusable document attachment infrastructure). Farm management routes (/api/v1/farm/*) are NOT included here — they are dynamically loaded at startup by the farm_manager plugin module via src/core/plugin_system/. | api_router |
| `CRUD /crm/customers` | `src/modules/crm/api/v1/customers.py:1` | Customer CRUD with address management and type/status filtering. | router |
| `CRUD /ai-dashboard` | `src/modules/farm_manager/api/v1/ai_dashboard.py:25` | Automated farm inspection reports backed by AIDashboardService (multi-step data collection + AI summary pass). GET /latest (most recent report, 404 if none), GET /reports (paginated history), POST /generate (synchronous 30-60s manual trigger, admin/super_admin only). | router, get_latest_report, list_reports, generate_report |
| `CRUD /ai-hub` | `src/modules/farm_manager/api/v1/ai_hub.py:40` | Unified AI Hub interface, super_admin only for all 6 endpoints. POST /chat (message to a Hub section assistant — Control/Monitor/Report/Advise; Control can produce pending write actions for relay control/automation), POST /confirm (confirm/deny a pending write action), POST /transcribe (audio transcription via Vertex AI), GET /history/{section}, POST /tts (ElevenLabs text-to-speech), POST /export-report (PDF/Excel export). | router, chat, confirm_action, transcribe_audio, get_history, text_to_speech, exp |
| `CRUD /config` | `src/modules/farm_manager/api/v1/config.py:1` | Spacing standards CRUD, plant calculator, farming year configuration. | router |
| `CRUD /config/watchdog` | `src/modules/farm_manager/api/v1/watchdog.py:18` | Telegram-based watchdog alerting configuration and control, all endpoints admin+ only (_require_admin checks role in ('admin','super_admin')). GET/PATCH config (bot token masked in responses), POST test-notification (send a test Telegram message), GET status, POST trigger-check (manual watchdog run), GET history (past notification log). | router, get_watchdog_config, update_watchdog_config, test_watchdog_notification, |
| `CRUD /farms/{farm_id}/blocks/{block_id}/alerts` | `src/modules/farm_manager/api/v1/block_alerts.py:1` | CRUD for block alerts with resolve/dismiss, active alerts, and farm-level listing. | router, farm_router |
| `CRUD /farms/{farm_id}/blocks/{block_id}/cameras` | `src/modules/farm_manager/api/v1/cameras.py:23` | Camera integration for a block's SenseHub. list_cameras (live MCP call, cache fallback on unreachable hub), capture_snapshot, list_snapshots/latest_snapshots (cached snapshot browsing), serve_snapshot_image (serves image files from local storage). | router, list_cameras, capture_snapshot, list_snapshots, latest_snapshots, serve_ |
| `CRUD /farms/{farm_id}/blocks/{block_id}/harvests` | `src/modules/farm_manager/api/v1/block_harvests.py:1` | CRUD for block harvest records with summary and farm-level aggregation. | router, farm_router |
| `CRUD /inventory` | `src/modules/farm_manager/api/v1/inventory.py:1` | Farm inventory: harvest/input/asset CRUD, movements, transfers, waste management. | router |
| `CRUD /plant-data` | `src/modules/farm_manager/api/v1/plant_data.py:1` | Simple plant data CRUD with CSV import/export. | router |
| `CRUD /plant-data-enhanced` | `src/modules/farm_manager/api/v1/plant_data_enhanced.py:1` | Enhanced plant data with growth cycles, fertigation schedules, search, clone. | router |
| `CRUD /plantings` | `src/modules/farm_manager/api/v1/plantings.py:1` | Planting plan management: create, mark planted, get, list. | router |
| `CRUD /sensehub` | `src/modules/farm_manager/api/v1/sensehub.py:1` | SenseHub proxy: connect/disconnect, dashboard, equipment, automations, alerts, relay control. | router |
| `CRUD /sensehub-cache` | `src/modules/farm_manager/api/v1/sensehub_cache.py:18` | Query layer over cached SenseHub data (equipment, lab readings, alerts) plus sync-service management: GET /status, GET /sync-history (implied), POST to trigger a manual sync, and cached-data getters that serve reads without hitting the live SenseHub MCP connection every time. | router, get_sync_status, get_sync_history, trigger_manual_sync, get_cached_equip |
| `CRUD /tasks` | `src/modules/farm_manager/api/v1/tasks.py:1` | Farm task management: my-tasks, pending-count, CRUD, complete, harvest entry. | router |
| `DELETE /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:182` | Delete farm with cascade deletion of blocks, harvests, alerts, archives. | delete_farm |
| `DELETE /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:210` | Delete a block with CASCADE deletion via CascadeDeletionService — archives and harvests are moved to deleted_* collections rather than hard-deleted. Requires farm.manage; accepts an optional deletion reason. | delete_block |
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
| `GET /farms/{farm_id}/blocks/{block_id}/children` | `src/modules/farm_manager/api/v1/blocks.py:563` | Lists active virtual child blocks of a physical block (multi-crop area allocation within one physical space); empty list for virtual or childless blocks. | get_block_children |
| `GET /farms/{farm_id}/blocks/{block_id}/empty-virtual/preview` | `src/modules/farm_manager/api/v1/blocks.py:672` | Dry-run preview of what empty_virtual_block would transfer/delete, without mutating anything. | preview_empty_virtual_block |
| `GET /farms/{farm_id}/blocks/{block_id}/kpi` | `src/modules/farm_manager/api/v1/blocks.py:260` | Comprehensive KPI dashboard for a block: current status/on-track flag, days since planting/until harvest, predicted-vs-actual yield efficiency, harvest summary, and active alert count. | get_block_kpi |
| `GET /farms/{farm_id}/blocks/{block_id}/valid-transitions` | `src/modules/farm_manager/api/v1/blocks.py:362` | Dynamically computes valid next-states for a block from its current state and its plant's growth cycle (e.g. skips fruiting if fruitingDays=0) — powers UI action availability. | get_valid_status_transitions |
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
| `GET+DELETE /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:1001` | GET returns the block's IoT controller config (address/port/enabled/apiKey/relayLabels/lastConnected) or 404 if unconfigured. DELETE removes the controller config (farm.manage) without touching any other block data — a decommission/switch-to-manual operation. | get_iot_controller, delete_iot_controller |
| `GET+PUT /iot-proxy` | `src/modules/farm_manager/api/v1/iot_proxy.py:18` | CORS-avoidance proxy gateway for direct IoT controller (Raspberry Pi/ESP32) HTTP communication. Both GET and PUT accept a URL-encoded target `url` query param plus an optional forwarded apiKey/X-API-Key header, with a 5-second timeout. Requires authentication only (any logged-in user). | router, proxy_get_request, proxy_put_request |
| `PATCH /farms/{farm_id}` | `src/modules/farm_manager/api/v1/farms.py:147` | Partially update a farm's name, location, boundary, or metadata. | update_farm |
| `PATCH /farms/{farm_id}/blocks/{block_id}` | `src/modules/farm_manager/api/v1/blocks.py:170` | Update block fields (farm.manage permission). Validates the block belongs to the specified farm and that block name stays unique within the farm. | update_block |
| `PATCH /farms/{farm_id}/blocks/{block_id}/iot-controller` | `src/modules/farm_manager/api/v1/blocks.py:750` | Update IoT controller configuration (address, port, credentials) for a block. | update_iot_controller |
| `PATCH /farms/{farm_id}/blocks/{block_id}/status` | `src/modules/farm_manager/api/v1/blocks.py:265` | Transition block between lifecycle states (e.g. planted -> growing -> harvesting). | change_block_status |
| `POST /ai-monitor/chat` | `src/modules/farm_manager/api/v1/global_ai_chat.py:19` | Single read-only global farm-monitoring AI assistant endpoint (any authenticated user). Read-only access to live sensor readings/alerts across all farms/blocks; no write tools, so no confirmation flow exists (unlike ai_hub/farm_level_ai_chat). | router, chat |
| `POST /farms` | `src/modules/farm_manager/api/v1/farms.py:29` | Create a new farm with name, location, boundary, and farm type. | create_farm |
| `POST /farms/{farm_id}/ai-chat` | `src/modules/farm_manager/api/v1/farm_level_ai_chat.py:27` | Farm-scoped (not per-block) Gemini AI assistant for monitoring all blocks on one farm and controlling SenseHub-connected equipment. POST / (chat) and POST /confirm (confirm a pending write action), mirroring the ai_hub Control-section confirm flow but scoped to a single farm rather than the whole platform. | router, chat, confirm_action |
| `POST /farms/{farm_id}/blocks` | `src/modules/farm_manager/api/v1/blocks.py:25` | Create a new block within a farm with crop, area, and row configuration. | create_block |
| `POST /farms/{farm_id}/blocks/{block_id}/ai/chat` | `src/modules/farm_manager/api/v1/farm_ai_chat.py:1` | Farm AI chat using Vertex AI Gemini with SenseHub tool execution. | router |
| `POST /farms/{farm_id}/blocks/{block_id}/empty-virtual` | `src/modules/farm_manager/api/v1/blocks.py:602` | Empties and hard-deletes a virtual block via VirtualBlockService: archives the current cycle, transfers completed/in-progress tasks and harvest records to the parent (tagged with sourceBlockCode), deletes pending tasks, returns allocated area to the parent's budget, and updates parent status if needed. Requires farm.operate. | empty_virtual_block |
| `POST /farms/{farm_id}/blocks/{block_id}/refresh-plant-data` | `src/modules/farm_manager/api/v1/blocks.py:781` | Re-snapshots the plant-library record onto the block (rewrites plantDataVersion/plantDataSnapshot) and recomputes waste-aware predicted yield, yield-efficiency percent, and expected harvest/status-change dates. Only allowed pre-harvest (planned/growing/fruiting states); 409 otherwise. Requires farm.operate. | refresh_plant_data |
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
| `CRUD /genetics/accessions` | `src/modules/genetics/api/v1/accessions.py:1` | T-800 Physical material CRUD, plus /by-code/{code} label lookup for scanning and POST /{id}/split to break vessels out of a batch record. Founding material only; clones and crosses go through /propagations. T-806: GET /by-token/{token}?vesselNo=N — authenticated counterpart to the public label-info page, turns a scanned {token, vesselNo} into the full internal Accession (UUIDs included). Reuses public.py's _load_accession_by_token and vessel_resolver.resolve_vessel verbatim. Declared before /{accession_id} (route-ordering guard, verified live, not just structurally safe). | router, SplitResult |
| `CRUD /genetics/lines` | `src/modules/genetics/api/v1/lines.py:1` | T-800 Genetic line CRUD — the named identity (strain/variety/bloodline). List returns LineWithStats so accession rollups survive response-model filtering. DELETE is a soft deactivate; hard deletion is unsupported because accessions and propagation events reference the line. T-807: GET /{id}/dependents (counts accessions/propagations/observations/child lines/harvests) + DELETE /{id}/purge, hard-delete only at zero dependents (409 otherwise), genetics.delete tier. T-809: same purge route's ?cascade=true escalation — super_admin-only (genetics.delete.cascade), body {"confirm": "<exact line code>"} (GitHub repo-deletion pattern, mismatch is 400), hard-refuses even with a correct confirm when the line has harvests or child lines, ?dryRun=true previews without requiring confirm. Real cascade deletes are audit-logged to admin_audit_log with a full pre-deletion snapshot. | router, CascadePurgeConfirm |
| `CRUD /genetics/media` | `src/modules/genetics/api/v1/media.py:1` | T-800 Medium recipes and prepared batches, plus GET /additives/{name}/accessions — the experiment readout returning every accession ever grown on a medium containing an additive. | router, AdditiveReadout |
| `CRUD /genetics/observations` | `src/modules/genetics/api/v1/observations.py:1` | T-800 Dated observations against accessions, plus POST /{id}/promote which turns a flagged novel trait into its own genetic line with a founding accession. | router, PromotionResult |
| `CRUD /genetics/propagations` | `src/modules/genetics/api/v1/propagations.py:1` | T-800 Clone/cross execution and the transfer log. GET /methods exposes each method's reproduction mode, parent arity and generation effects, which drives the frontend's live G/F preview. T-808: PATCH /{event_id} amends ONLY performedAt (a factual date correction, e.g. logged late) — attribution and every structural field stay immutable through this or any route. Cascades to each result accession's acquiredAt, but only where it still equals the event's OLD performedAt (an already-hand-corrected accession is skipped, not overwritten). amendedAt/amendedBy always stamped — the correction is recorded, never made invisible. Rejects a future performedAt with 400. Permission: genetics.edit (bench tier). | router, PropagationOutcome, MethodInfo |
| `GET /genetics/accessions/{id}/labels` | `src/modules/genetics/api/v1/labels.py:1` | T-804. Renders a print-ready label PDF for a Brother QL-800, one page per vessel in [from, to]. Tape sizes: 29x90 and 17x87 fixed die-cut, or 62xN continuous (N = feed length mm, 12-100, parsed/validated by _parse_tape_spec/_tape_dimensions, 400 on anything malformed or out of range, never a 500). Line 1 (accession code/vessel) draws in Space Mono Bold, lines 2-4 in Hanken Grotesk — both vendored TTFs under src/modules/genetics/assets/fonts/, embedded via reportlab with a Helvetica fallback that has never actually fired. A small brand mark (src/modules/genetics/assets/brand/mark-mono-1bit.png) draws only when real measured spare space exists (below the text block, or horizontally right of lines 2/3 as a fallback), 5-8mm, never a fixed corner guess. Printing raises labelledVesselCount to max(current, to) — read-only in permission (require_view) but not in effect. | router, compute_qr_geometry, build_label_payload |
| `GET /genetics/dashboard` | `src/modules/genetics/api/v1/dashboard.py:1` | T-800 Repo-wide counters: lines by biological domain, live material, 30-day activity, novel traits awaiting promotion, and the senescence watch list. | router |
| `GET /genetics/lineage` | `src/modules/genetics/api/v1/lineage.py:1` | T-800 Lineage DAG (/graph) and flattened ancestry breadcrumb (/ancestry/{id}). Returns flat nodes+edges rather than a nested tree because a cross gives a node two parents. | router |
| `GET /public/genetics/i/{token}[/{vesselNo}]` | `src/modules/genetics/api/v1/public.py:1` | T-804/T-806 part 3. The platform's FIRST unauthenticated route, mounted on its own router (see genetics.register) so no route can become public by accident. Optional auth (_optional_current_user, fails closed on any error to anonymous, never raises) selects between two hand-built response shapes — PublicAccessionInfo (anonymous, respects the organization's PublicInfoPageConfig show* flags) and AuthenticatedAccessionInfo (adds accessionId + per-node tokens, ignores the show* flags entirely) — response_model is deliberately unset; the two explicit allowlists ARE the leakage guard, never response filtering. enabled=false on PublicInfoPageConfig 404s anonymous callers only (a public-exposure switch, not an access-control gate). Byte-identical 404 for every failure mode so an unknown token can't be distinguished from a disabled page. Rate-limited via src.middleware.rate_limit. | router, PublicAccessionInfo, AuthenticatedAccessionInfo, PublicLineageGraph, Aut |
| `GET/DELETE /genetics/maintenance/orphans` | `src/modules/genetics/api/v1/maintenance.py:1` | T-809. Org-wide database hygiene, distinct from the line-scoped cascade purge on lines.py. GET /orphans (genetics.delete tier) is read-only, finds accessions/propagation events/observations whose lineId (every referenced lineId, for propagation events) matches no existing line — a null/absent lineId is explicitly NOT an orphan. DELETE /orphans (super_admin, genetics.maintenance) removes exactly what GET reported, by explicit id list; ?dryRun=true previews without deleting. Real deletes audit-logged to admin_audit_log with the full pre-deletion snapshot. | router |
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
