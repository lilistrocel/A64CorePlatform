# Module Map

> Generated: 2026-08-21 15:36 UTC  
> Source: MongoDB `mapper_nodes` (grouped by module)

## Backend Module Architecture

A64 Core Platform is organized into modular business applications.
Each module contains API, service, and model layers.

**Related Maps:** [api-map.md](api-map.md) | [service-map.md](service-map.md) | [database-map.md](database-map.md)

## Module Overview

| Module | Nodes | Layers Present |
|--------|-------|----------------|
| `admin` | 3 | frontend |
| `ai` | 22 | frontend |
| `ai_analytics` | 8 | api, model, service |
| `ai_assistant` | 18 | api, config, model, service |
| `analytics` | 5 | frontend |
| `attachments` | 1 | config |
| `auth` | 13 | frontend |
| `core` | 128 | api, config, core, frontend, infrastructure, model, service |
| `crm` | 13 | api, frontend, infrastructure, model, repository, service |
| `dashboard` | 7 | frontend |
| `debug` | 1 | frontend |
| `farm` | 92 | config, frontend |
| `farm_manager` | 321 | api, config, infrastructure, middleware, model, repository, service |
| `finance` | 62 | frontend, model |
| `finance_bridge` | 9 | config, model, service |
| `frontend` | 7 | config, frontend |
| `genetics` | 70 | api, config, frontend, middleware, model, service |
| `hr` | 34 | api, frontend, infrastructure, model, repository, service |
| `infra` | 76 | config |
| `inventory` | 7 | frontend |
| `logistics` | 27 | api, frontend, infrastructure, model, repository, service |
| `map` | 1 | frontend |
| `marketing` | 31 | api, frontend, infrastructure, model, service |
| `mushroom` | 22 | frontend |
| `mushroom_manager` | 33 | api, config, model, service |
| `operations` | 6 | frontend |
| `platform` | 1 | frontend |
| `pnl` | 8 | frontend |
| `protocols` | 10 | frontend, model |
| `purchasing` | 29 | frontend, model |
| `sales` | 112 | api, frontend, middleware, model, service |
| `settings` | 4 | frontend |
| `shared` | 21 | config, frontend |
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

### `ai` (22 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AI assistant barrel` | frontend | `frontend/user-portal/src/components/ai-assistant/index.ts` |
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
| type | `aiHub` | frontend | `frontend/user-portal/src/types/aiHub.ts` |
| function | `aiHubApi` | frontend | `frontend/user-portal/src/services/aiHubApi.ts` |
| type | `farmAI` | frontend | `frontend/user-portal/src/types/farmAI.ts` |
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

### `ai_assistant` (18 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /ai/assistant` | api | `src/modules/ai_assistant/api/v1/assistant.py` |
| config | `AI_ASSISTANT_HISTORY_LIMIT` | config | `src/config/settings.py` |
| config | `AI_ASSISTANT_MAX_TOKENS` | config | `src/config/settings.py` |
| config | `AI_ASSISTANT_MAX_TURNS` | config | `src/config/settings.py` |
| config | `ANTHROPIC_API_KEY` | config | `src/config/settings.py` |
| config | `ANTHROPIC_MODEL` | config | `docker-compose.yml` |
| config | `CLAUDE_MODEL` | config | `src/config/settings.py` |
| pydantic_model | `AssistantCostLog` | model | `src/modules/ai_assistant/models/cost_log.py` |
| pydantic_model | `ChatRequest` | model | `src/modules/ai_assistant/models/chat_request.py` |
| pydantic_model | `Conversation` | model | `src/modules/ai_assistant/models/conversation.py` |
| db_model | `ai_assistant_conversations` | model | `src/modules/ai_assistant/services/conversation_repository.py` |
| db_model | `ai_assistant_cost_log` | model | `src/modules/ai_assistant/services/cost_tracker.py` |
| class | `ClaudeAssistantService` | service | `src/modules/ai_assistant/services/claude_service.py` |
| class | `ConversationRepository` | service | `src/modules/ai_assistant/services/conversation_repository.py` |
| class | `CostTracker` | service | `src/modules/ai_assistant/services/cost_tracker.py` |
| function | `build_system_prompt` | service | `src/modules/ai_assistant/services/context_composer.py` |
| function | `execute_tool` | service | `src/modules/ai_assistant/services/tool_executor.py` |
| function | `get_tool_definitions` | service | `src/modules/ai_assistant/services/tool_definitions.py` |

### `analytics` (5 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| type | `aiDashboard` | frontend | `frontend/user-portal/src/types/aiDashboard.ts` |
| type | `analytics` | frontend | `frontend/user-portal/src/types/analytics.ts` |
| type | `farmAnalytics` | frontend | `frontend/user-portal/src/types/farmAnalytics.ts` |
| type | `farmAnalyticsKebab` | frontend | `frontend/user-portal/src/types/farm-analytics.ts` |
| type | `globalAnalytics` | frontend | `frontend/user-portal/src/types/global-analytics.ts` |

### `attachments` (1 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `ATTACHMENT_STORAGE_ROOT` | config | `src/config/settings.py` |

### `auth` (13 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `BackupCodesModal` | frontend | `frontend/user-portal/src/components/auth/BackupCodesModal.tsx` |
| component | `ForgotPassword` | frontend | `frontend/user-portal/src/pages/auth/ForgotPassword.tsx` |
| component | `Login` | frontend | `frontend/user-portal/src/pages/auth/Login.tsx` |
| component | `MFARouteGuards` | frontend | `frontend/user-portal/src/components/common/MFARouteGuards.tsx` |
| component | `MFASetupPage` | frontend | `frontend/user-portal/src/pages/auth/MFASetupPage.tsx` |
| component | `MFAVerifyPage` | frontend | `frontend/user-portal/src/pages/auth/MFAVerifyPage.tsx` |
| component | `PendingActivation` | frontend | `frontend/user-portal/src/pages/auth/PendingActivation.tsx` |
| component | `Register` | frontend | `frontend/user-portal/src/pages/auth/Register.tsx` |
| component | `ResetPassword` | frontend | `frontend/user-portal/src/pages/auth/ResetPassword.tsx` |
| component | `VerifyEmail` | frontend | `frontend/user-portal/src/pages/auth/VerifyEmail.tsx` |
| function | `authService` | frontend | `frontend/user-portal/src/services/auth.service.ts` |
| store | `useAuthStore` | frontend | `frontend/user-portal/src/stores/auth.store.ts` |
| hook | `useMFA` | frontend | `frontend/user-portal/src/hooks/queries/useMFA.ts` |

### `core` (128 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /admin` | api | `src/api/v1/admin.py` |
| api_endpoint | `CRUD /auth` | api | `src/api/v1/auth.py` |
| api_endpoint | `CRUD /dashboard` | api | `src/api/v1/dashboard.py` |
| api_endpoint | `CRUD /divisions` | api | `src/api/v1/divisions.py` |
| api_endpoint | `CRUD /farm/tools/chemicals` | api | `src/api/v1/tools/chemicals.py` |
| api_endpoint | `CRUD /farm/tools/fertilizer-cost` | api | `src/api/v1/tools/fertilizer_cost.py` |
| api_endpoint | `CRUD /modules` | api | `src/api/v1/modules.py` |
| api_endpoint | `CRUD /users` | api | `src/api/v1/users.py` |
| api_endpoint | `FastAPI app bootstrap` | api | `src/main.py` |
| api_endpoint | `GET /health, /ready, /metrics*` | api | `src/api/health.py` |
| api_endpoint | `GET /industries` | api | `src/api/v1/industries.py` |
| api_endpoint | `GET /system/capabilities` | api | `src/api/v1/system.py` |
| api_endpoint | `PATCH /organizations/{organizationId}/modules` | api | `src/api/v1/organizations.py` |
| api_endpoint | `v1 API router aggregation` | api | `src/api/routes.py` |
| config | `ADMIN_EMAIL` | config | `src/config/settings.py` |
| config | `ADMIN_PASSWORD` | config | `src/config/settings.py` |
| config | `ALLOWED_ORIGINS` | config | `src/config/settings.py` |
| config | `API_KEY_PREFIX` | config | `src/config/settings.py` |
| config | `APP_NAME` | config | `src/config/settings.py` |
| config | `CF_ACCESS_AUD` | config | `src/config/settings.py` |
| config | `CF_ACCESS_DEFAULT_ROLE` | config | `src/config/settings.py` |
| config | `CF_ACCESS_ENABLED` | config | `src/config/settings.py` |
| config | `CF_ACCESS_EXCLUSIVE` | config | `src/config/settings.py` |
| config | `CF_ACCESS_JIT_PROVISION` | config | `src/config/settings.py` |
| config | `CF_ACCESS_TEAM_DOMAIN` | config | `src/config/settings.py` |
| config | `DEBUG` | config | `src/config/settings.py` |
| config | `DOCKER_REGISTRY_PASSWORD` | config | `.env.example` |
| config | `DOCKER_REGISTRY_URL` | config | `.env.example` |
| config | `DOCKER_REGISTRY_USERNAME` | config | `.env.example` |
| config | `EMAIL_PROVIDER` | config | `src/config/settings.py` |
| config | `ENVIRONMENT` | config | `src/config/settings.py` |
| config | `FROM_EMAIL` | config | `src/config/settings.py` |
| config | `FRONTEND_URL` | config | `src/config/settings.py` |
| config | `HOST` | config | `src/config/settings.py` |
| config | `LABEL_PRINTER_API_KEY` | config | `src/config/settings.py` |
| config | `LABEL_PRINTER_BASE_URL` | config | `src/config/settings.py` |
| config | `LABEL_PRINTER_ENABLED` | config | `src/config/settings.py` |
| config | `LICENSE_ENCRYPTION_KEY` | config | `docker-compose.yml` |
| config | `LICENSE_SERVER_API_KEY` | config | `.env.example` |
| config | `LICENSE_SERVER_URL` | config | `.env.example` |
| config | `LICENSE_VALIDATION_MODE` | config | `docker-compose.yml` |
| config | `LOG_LEVEL` | config | `src/config/settings.py` |
| config | `MAX_MODULES` | config | `.env.example` |
| config | `MAX_MODULES_PER_USER` | config | `.env.example` |
| config | `MODULE_INSTALL_TIMEOUT` | config | `.env.example` |
| config | `MODULE_REGISTRY_PATH` | config | `.env.example` |
| config | `MONGODB_DB_NAME` | config | `src/config/settings.py` |
| config | `MONGODB_URL` | config | `src/config/settings.py` |
| config | `PORT` | config | `src/config/settings.py` |
| config | `PUBLIC_BASE_URL` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_ADMIN` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_GUEST` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_MODERATOR` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_SUPER_ADMIN` | config | `src/config/settings.py` |
| config | `RATE_LIMIT_USER` | config | `src/config/settings.py` |
| config | `REDIS_URL` | config | `src/config/settings.py` |
| config | `SECRET_KEY` | config | `src/config/settings.py` |
| class | `Settings` | config | `src/config/settings.py` |
| config | `TRUSTED_REGISTRIES` | config | `docker-compose.yml` |
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
| class | `RoleChecker / require_super_admin / require_admin / require_moderator` | core | `src/middleware/permissions.py` |
| class | `TimingMiddleware / TimingMiddlewareWithCollector / ResponseTimeCollector` | core | `src/middleware/timing.py` |
| function | `get_cf_access_token / is_local_request` | core | `src/middleware/cf_access.py` |
| function | `get_current_user / get_current_active_user / get_user_mfa_complete` | core | `src/middleware/auth.py` |
| module | `get_item_finance_ext / get_customer_finance_ext / get_tax_percent` | core | `src/core/finance/finance_ext_client.py` |
| function | `next_doc_number` | core | `src/core/documents/doc_number.py` |
| function | `resolve_company_code` | core | `src/core/finance/company_resolver.py` |
| function | `apiClient` | frontend | `frontend/user-portal/src/services/api.ts` |
| hook | `usePageVisibility` | frontend | `frontend/user-portal/src/hooks/usePageVisibility.ts` |
| store | `useThemeStore` | frontend | `frontend/user-portal/src/stores/theme.store.ts` |
| store | `useToastStore` | frontend | `frontend/user-portal/src/stores/toast.store.ts` |
| hook | `useUnsavedChanges` | frontend | `frontend/user-portal/src/hooks/useUnsavedChanges.ts` |
| function | `Fernet encryption helpers` | infrastructure | `src/utils/encryption.py` |
| class | `LicenseValidator` | infrastructure | `src/utils/license_validator.py` |
| class | `PluginManager` | infrastructure | `src/core/plugin_system/plugin_manager.py` |
| class | `RedisCache` | infrastructure | `src/core/cache/redis_cache.py` |
| function | `cache_response / invalidate_cache_pattern` | infrastructure | `src/core/cache/decorators.py` |
| function | `email utilities` | infrastructure | `src/utils/email.py` |
| function | `password hashing + JWT helpers` | infrastructure | `src/utils/security.py` |
| function | `setup_logging / JSONFormatter` | infrastructure | `src/core/logging_config.py` |
| class | `ChartWidgetData / StatWidgetData / WidgetDataResponse` | model | `src/models/dashboard.py` |
| class | `DeploymentSettingItem / DeploymentSettingsResponse / DeploymentSettingsPatchRequest` | model | `src/models/deployment_settings.py` |
| class | `IndustryType / Division / DivisionResponse` | model | `src/models/division.py` |
| class | `ModuleConfig / ModuleStatusResponse / PortAllocation` | model | `src/models/module.py` |
| pydantic_model | `Organization / module config models` | model | `src/models/organization.py` |
| class | `UserMFA / MFABackupCode / MFAAuditLog` | model | `src/models/mfa.py` |
| class | `UserRole / UserCreate / UserResponse / TokenResponse / MFA* models` | model | `src/models/user.py` |
| db_model | `admin_audit_log` | model | `src/services/database.py` |
| db_model | `counters` | model | `src/modules/crm/services/customer/customer_repository.py` |
| db_model | `divisions` | model | `src/services/division_service.py` |
| db_model | `document_counters` | model | `src/core/documents/doc_number.py` |
| db_model | `document_headers` | model | `src/core/documents/doc_number.py` |
| db_model | `document_lines` | model | `src/core/documents/open_quantity.py` |
| db_model | `installed_modules` | model | `src/services/database.py` |
| db_model | `mfa_audit_log` | model | `src/services/database.py` |
| db_model | `mfa_backup_codes` | model | `src/services/database.py` |
| db_model | `mfa_pending_tokens` | model | `src/services/auth_service.py` |
| db_model | `module_audit_log` | model | `src/services/database.py` |
| db_model | `organizations` | model | `src/services/organization_service.py` |
| db_model | `platform_settings` | model | `src/services/deployment_settings_service.py` |
| db_model | `port_registry` | model | `src/services/port_manager.py` |
| db_model | `refresh_tokens` | model | `src/services/database.py` |
| db_model | `user_mfa` | model | `src/services/database.py` |
| db_model | `users` | model | `src/services/database.py` |
| db_model | `verification_tokens` | model | `src/services/database.py` |
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
| function | `label_printer_service` | service | `src/services/label_printer_service.py` |
| class | `verify_cf_access_token / CFAccessIdentity` | service | `src/services/cf_access_service.py` |
| function | `write_user_audit_log` | service | `src/services/audit_log_service.py` |

### `crm` (13 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /crm/customers` | api | `src/modules/crm/api/v1/customers.py` |
| component | `CRMPage` | frontend | `frontend/user-portal/src/pages/crm/CRMPage.tsx` |
| component | `CustomerCard` | frontend | `frontend/user-portal/src/components/crm/CustomerCard.tsx` |
| component | `CustomerDetailPage` | frontend | `frontend/user-portal/src/pages/crm/CustomerDetailPage.tsx` |
| component | `CustomerForm` | frontend | `frontend/user-portal/src/components/crm/CustomerForm.tsx` |
| component | `CustomerTable` | frontend | `frontend/user-portal/src/components/crm/CustomerTable.tsx` |
| type | `crm` | frontend | `frontend/user-portal/src/types/crm.ts` |
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

### `farm` (92 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `mapConfig` | config | `frontend/user-portal/src/config/mapConfig.ts` |
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
| component | `BlockHarvestBatchLookupModal` | frontend | `frontend/user-portal/src/components/farm/BlockHarvestBatchLookupModal.tsx` |
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
| component | `PlantCombobox` | frontend | `frontend/user-portal/src/components/farm/PlantCombobox.tsx` |
| component | `PlantDataCard` | frontend | `frontend/user-portal/src/components/farm/PlantDataCard.tsx` |
| component | `PlantDataDetail` | frontend | `frontend/user-portal/src/components/farm/PlantDataDetail.tsx` |
| component | `PlantDataFormModal` | frontend | `frontend/user-portal/src/components/farm/PlantDataFormModal.tsx` |
| component | `PlantDataLibrary` | frontend | `frontend/user-portal/src/pages/farm/PlantDataLibrary.tsx` |
| component | `PlantMotherCard` | frontend | `frontend/user-portal/src/components/farm/PlantMotherCard.tsx` |
| component | `PlantMotherDetailModal` | frontend | `frontend/user-portal/src/components/farm/PlantMotherDetailModal.tsx` |
| component | `PlantMotherFormModal` | frontend | `frontend/user-portal/src/components/farm/PlantMotherFormModal.tsx` |
| component | `ProductsEditor` | frontend | `frontend/user-portal/src/components/farm/ProductsEditor.tsx` |
| component | `QuickPlanModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/QuickPlanModal.tsx` |
| component | `ResolveAlertModal` | frontend | `frontend/user-portal/src/components/farm/dashboard/ResolveAlertModal.tsx` |
| component | `SensorFusionTab` | frontend | `frontend/user-portal/src/components/farm/weather/SensorFusionTab.tsx` |
| component | `SoilConditionsCard` | frontend | `frontend/user-portal/src/components/farm/weather/SoilConditionsCard.tsx` |
| component | `SolarLightCard` | frontend | `frontend/user-portal/src/components/farm/weather/SolarLightCard.tsx` |
| component | `VirtualBlockItem` | frontend | `frontend/user-portal/src/components/farm/VirtualBlockItem.tsx` |
| component | `VirtualBlocksView` | frontend | `frontend/user-portal/src/components/farm/VirtualBlocksView.tsx` |
| type | `alerts` | frontend | `frontend/user-portal/src/types/alerts.ts` |
| function | `alertsApi` | frontend | `frontend/user-portal/src/services/alertsApi.ts` |
| type | `farm` | frontend | `frontend/user-portal/src/types/farm.ts` |
| function | `farmApi` | frontend | `frontend/user-portal/src/services/farmApi.ts` |
| file | `harvestCategory` | frontend | `frontend/user-portal/src/utils/harvestCategory.ts` |
| function | `inventoryApi` | frontend | `frontend/user-portal/src/services/inventoryApi.ts` |
| function | `plantDataEnhancedApi` | frontend | `frontend/user-portal/src/services/plantDataEnhancedApi.ts` |
| function | `plantMotherApi` | frontend | `frontend/user-portal/src/services/plantMotherApi.ts` |
| type | `tasks` | frontend | `frontend/user-portal/src/types/tasks.ts` |
| function | `tasksApi` | frontend | `frontend/user-portal/src/services/tasksApi.ts` |
| hook | `useBlockActions` | frontend | `frontend/user-portal/src/hooks/farm/useBlockActions.ts` |
| hook | `useBlockAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useBlockAnalytics.ts` |
| hook | `useBlockViewMode` | frontend | `frontend/user-portal/src/hooks/farm/useBlockViewMode.ts` |
| hook | `useBlocks` | frontend | `frontend/user-portal/src/hooks/queries/useBlocks.ts` |
| hook | `useDashboardConfig` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardConfig.ts` |
| hook | `useDashboardData` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardData.ts` |
| hook | `useDashboardFilters` | frontend | `frontend/user-portal/src/hooks/farm/useDashboardFilters.ts` |
| hook | `useFarmAIChat` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAIChat.ts` |
| hook | `useFarmAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useFarmAnalytics.ts` |
| store | `useFarmingYearStore` | frontend | `frontend/user-portal/src/stores/farmingYear.store.ts` |
| hook | `useFarmingYears` | frontend | `frontend/user-portal/src/hooks/queries/useFarmingYears.ts` |
| hook | `useFarms` | frontend | `frontend/user-portal/src/hooks/queries/useFarms.ts` |
| hook | `useGlobalAnalytics` | frontend | `frontend/user-portal/src/hooks/farm/useGlobalAnalytics.ts` |
| hook | `useHarvestBatch` | frontend | `frontend/user-portal/src/hooks/queries/useHarvestBatch.ts` |
| hook | `useMultiLevelAIChat` | frontend | `frontend/user-portal/src/hooks/farm/useMultiLevelAIChat.ts` |
| hook | `usePlantMothers` | frontend | `frontend/user-portal/src/hooks/queries/usePlantMothers.ts` |
| hook | `useWeatherData` | frontend | `frontend/user-portal/src/hooks/farm/useWeatherData.ts` |
| function | `weatherApi` | frontend | `frontend/user-portal/src/services/weatherApi.ts` |

### `farm_manager` (321 nodes)

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
| api_endpoint | `farm_manager api_router (v1 mount table)` | api | `src/modules/farm_manager/api/v1/__init__.py` |
| api_endpoint | `tasks router` | api | `src/modules/farm_manager/api/v1/tasks.py` |
| config | `ELEVENLABS_API_KEY` | config | `src/config/settings.py` |
| config | `ELEVENLABS_MODEL_ID` | config | `src/config/settings.py` |
| config | `ELEVENLABS_VOICE_ID` | config | `src/config/settings.py` |
| config | `FARM_AI_DAILY_LIMIT` | config | `src/config/settings.py` |
| config | `FARM_AI_MAX_TOKENS` | config | `src/config/settings.py` |
| config | `GOOGLE_APPLICATION_CREDENTIALS` | config | `docker-compose.yml` |
| config | `GOOGLE_CLOUD_PROJECT` | config | `src/config/settings.py` |
| config | `VERTEX_AI_LOCATION` | config | `src/config/settings.py` |
| config | `VERTEX_AI_MAX_OUTPUT_TOKENS` | config | `src/config/settings.py` |
| config | `VERTEX_AI_MODEL` | config | `src/config/settings.py` |
| config | `VERTEX_AI_TEMPERATURE` | config | `src/config/settings.py` |
| config | `WEATHERBIT_API_KEY` | config | `docker-compose.yml` |
| config | `WEATHERBIT_ENABLED` | config | `docker-compose.yml` |
| class | `FarmDatabaseManager` | infrastructure | `src/modules/farm_manager/services/database.py` |
| middleware | `farm auth + authorization` | middleware | `src/modules/farm_manager/middleware/auth.py` |
| file | `farm_manager middleware package` | middleware | `src/modules/farm_manager/middleware/__init__.py` |
| db_model | `AgriWeatherData` | model | `src/modules/farm_manager/models/weather.py` |
| pydantic_model | `Alert` | model | `src/modules/farm_manager/models/alert.py` |
| db_model | `AlertCategory` | model | `src/modules/farm_manager/models/block_alert.py` |
| db_model | `AlertComment` | model | `src/modules/farm_manager/models/block_alert.py` |
| db_model | `AlertSeverity` | model | `src/modules/farm_manager/models/alert.py` |
| db_model | `AlertSeverity` | model | `src/modules/farm_manager/models/block_alert.py` |
| db_model | `AlertStatus` | model | `src/modules/farm_manager/models/alert.py` |
| db_model | `AlertStatus` | model | `src/modules/farm_manager/models/block_alert.py` |
| db_model | `AlertType` | model | `src/modules/farm_manager/models/alert.py` |
| db_model | `AlertsSummary` | model | `src/modules/farm_manager/models/block_archive.py` |
| db_model | `AssetCategory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `AssetInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `AssetStatus` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `BaseUnit` | model | `src/modules/farm_manager/models/inventory.py` |
| pydantic_model | `Block` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `BlockAlert` | model | `src/modules/farm_manager/models/block_alert.py` |
| pydantic_model | `BlockAnalyticsResponse` | model | `src/modules/farm_manager/models/block_analytics.py` |
| pydantic_model | `BlockArchive` | model | `src/modules/farm_manager/models/block_archive.py` |
| pydantic_model | `BlockCycle` | model | `src/modules/farm_manager/models/block_cycle.py` |
| pydantic_model | `BlockHarvest` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `BlockHarvestSummary` | model | `src/modules/farm_manager/models/block_harvest.py` |
| pydantic_model | `BlockHistoryArchive` | model | `src/modules/farm_manager/models/block_history.py` |
| db_model | `BlockKPI` | model | `src/modules/farm_manager/models/block.py` |
| db_model | `BlockStatus` | model | `src/modules/farm_manager/models/block.py` |
| db_model | `BlockType` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `CalculationList` | model | `src/modules/farm_manager/models/tools/calculation_list.py` |
| db_model | `CurrentWeather` | model | `src/modules/farm_manager/models/weather.py` |
| pydantic_model | `DailyHarvest` | model | `src/modules/farm_manager/models/daily_harvest.py` |
| pydantic_model | `DashboardSummary` | model | `src/modules/farm_manager/models/dashboard.py` |
| pydantic_model | `Deleted archive models` | model | `src/modules/farm_manager/models/deleted_archives.py` |
| db_model | `DeletedBlock` | model | `src/modules/farm_manager/models/deleted_archives.py` |
| db_model | `DeletedBlockArchive` | model | `src/modules/farm_manager/models/deleted_archives.py` |
| db_model | `DeletedBlockHarvest` | model | `src/modules/farm_manager/models/deleted_archives.py` |
| db_model | `DisplayUnit` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `DisposalMethod` | model | `src/modules/farm_manager/models/inventory.py` |
| pydantic_model | `Farm` | model | `src/modules/farm_manager/models/farm.py` |
| pydantic_model | `FarmAnalyticsResponse` | model | `src/modules/farm_manager/models/farm_analytics.py` |
| pydantic_model | `FarmAssignment` | model | `src/modules/farm_manager/models/farm_assignment.py` |
| pydantic_model | `FarmTask` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTask` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskCreate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskListResponse` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskUpdate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTaskWithDetails` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `FarmTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `FarmingYearConfig` | model | `src/modules/farm_manager/models/farming_year_config.py` |
| db_model | `FertigationRuleTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `FertigationSchedule` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `Fertilizer calculator DTOs` | model | `src/modules/farm_manager/models/tools/calculator_request.py` |
| pydantic_model | `FertilizerChemical` | model | `src/modules/farm_manager/models/tools/fertilizer_chemical.py` |
| pydantic_model | `GlobalAnalyticsResponse` | model | `src/modules/farm_manager/models/global_analytics.py` |
| db_model | `GrowthCycleDuration` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `GrowthHabitEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `GrowthStageEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `Harvest` | model | `src/modules/farm_manager/models/harvest.py` |
| db_model | `HarvestBatchLookupResponse` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `HarvestBatchSubmitRequest` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `HarvestBatchSubmitResponse` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `HarvestEntry` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HarvestEntryCreate` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HarvestGrade` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HarvestInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `HarvestMetadata` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `HarvestProductType` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `HarvestTotal` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `HistoricalKPI` | model | `src/modules/farm_manager/models/block.py` |
| db_model | `IngredientCategoryEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `InputCategory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `InputInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| pydantic_model | `Inventory models` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `InventoryMovement` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `InventoryScope` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `InventoryType` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `IoTController` | model | `src/modules/farm_manager/models/block.py` |
| db_model | `LightTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `MovementType` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `PerformanceCategory` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `PlantData` | model | `src/modules/farm_manager/models/plant_data.py` |
| pydantic_model | `PlantDataEnhanced` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `PlantDataSnapshot` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `PlantMother` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `PlantMotherWithVarieties` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `PlantProduct` | model | `src/modules/farm_manager/models/plant_mother.py` |
| pydantic_model | `Planting` | model | `src/modules/farm_manager/models/planting.py` |
| pydantic_model | `PriceOverride` | model | `src/modules/farm_manager/models/tools/fertilizer_price.py` |
| db_model | `ProcessingInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `Product` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `ProductCategory` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `ProductUnit` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `QualityBreakdown` | model | `src/modules/farm_manager/models/block_archive.py` |
| db_model | `QualityGrade` | model | `src/modules/farm_manager/models/block_harvest.py` |
| db_model | `QualityGrade` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `ReturnedInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `SeverityLevelEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `SoilTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `SpacingCategory` | model | `src/modules/farm_manager/models/spacing_standards.py` |
| db_model | `SpacingRequirements` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `SpacingStandardsConfig` | model | `src/modules/farm_manager/models/spacing_standards.py` |
| db_model | `StatusChange` | model | `src/modules/farm_manager/models/block.py` |
| pydantic_model | `StockInventoryItem` | model | `src/modules/farm_manager/models/stock_inventory.py` |
| db_model | `SupportTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `TaskCompletionData` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskData` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskPriority` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskStatus` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TaskType` | model | `src/modules/farm_manager/models/farm_task.py` |
| db_model | `TimePeriod` | model | `src/modules/farm_manager/models/block_analytics.py` |
| db_model | `ToleranceLevelEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `TransferRecord` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `TrendDirection` | model | `src/modules/farm_manager/models/block_analytics.py` |
| db_model | `VarietyCreateForMother` | model | `src/modules/farm_manager/models/plant_mother.py` |
| db_model | `WasteInventory` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `WasteSourceType` | model | `src/modules/farm_manager/models/inventory.py` |
| db_model | `WaterTypeEnum` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| pydantic_model | `Weather models` | model | `src/modules/farm_manager/models/weather.py` |
| db_model | `WeatherCacheEntry` | model | `src/modules/farm_manager/models/weather.py` |
| db_model | `YieldInfo` | model | `src/modules/farm_manager/models/plant_data_enhanced.py` |
| db_model | `ai_dashboard_reports` | model | `src/modules/farm_manager/services/ai_dashboard/service.py` |
| db_model | `ai_hub_chat_log` | model | `src/modules/farm_manager/services/ai_hub/service.py` |
| db_model | `alerts` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_alerts` | model | `src/modules/farm_manager/services/block/alert_repository.py` |
| db_model | `block_archives` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_cycles` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `block_history` | model | `src/modules/farm_manager/services/block_history/block_history_repository.py` |
| db_model | `blocks` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `daily_harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `deleted_block_archives` | model | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| db_model | `deleted_block_harvests` | model | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| db_model | `deleted_blocks` | model | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| db_model | `deleted_farms` | model | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| db_model | `farm_ai_chat_log` | model | `src/modules/farm_manager/services/farm_ai/service.py` |
| db_model | `farm_assignments` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `farm_tasks` | model | `src/modules/farm_manager/services/task/task_repository.py` |
| db_model | `farmer_assignments` | model | `src/modules/farm_manager/services/task/task_service.py` |
| db_model | `farms` | model | `src/modules/farm_manager/services/farm/farm_repository.py` |
| db_model | `fertilizer_calculation_lists` | model | `src/modules/farm_manager/services/tools/calculation_lists_repository.py` |
| db_model | `fertilizer_chemicals` | model | `src/modules/farm_manager/services/tools/chemicals_repository.py` |
| db_model | `fertilizer_price_overrides` | model | `src/modules/farm_manager/services/tools/price_book.py` |
| db_model | `harvests` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_asset` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_harvest` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_input` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_movements` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `inventory_returned` | model | `src/modules/farm_manager/services/inventory/returned_repository.py` |
| db_model | `inventory_waste` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `plant_data` | model | `src/modules/farm_manager/services/plant_data/plant_data_repository.py` |
| db_model | `plant_data_enhanced` | model | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py` |
| db_model | `plant_mothers` | model | `src/modules/farm_manager/services/plant_data/plant_mother_repository.py` |
| db_model | `plantings` | model | `src/modules/farm_manager/services/planting/planting_repository.py` |
| db_model | `processing_inventory` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `products` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `sensehub_alerts_cache` | model | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| db_model | `sensehub_equipment_cache` | model | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| db_model | `sensehub_lab_cache` | model | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| db_model | `sensehub_snapshots_cache` | model | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| db_model | `sensehub_sync_log` | model | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| db_model | `stock_inventory` | model | `src/modules/farm_manager/services/database.py` |
| db_model | `system_config` | model | `src/modules/farm_manager/services/config_service.py` |
| db_model | `watchdog_notifications` | model | `src/modules/farm_manager/services/watchdog/service.py` |
| db_model | `weather_cache` | model | `src/modules/farm_manager/services/weather/weather_cache_service.py` |
| class | `AlertRepository` | repository | `src/modules/farm_manager/services/block/alert_repository.py` |
| class | `ArchiveRepository` | repository | `src/modules/farm_manager/services/block/archive_repository.py` |
| class | `BlockHistoryRepository` | repository | `src/modules/farm_manager/services/block_history/block_history_repository.py` |
| class | `BlockRepository` | repository | `src/modules/farm_manager/services/block/block_repository_new.py` |
| class | `CalculationListsRepository` | repository | `src/modules/farm_manager/services/tools/calculation_lists_repository.py` |
| class | `ChemicalsRepository` | repository | `src/modules/farm_manager/services/tools/chemicals_repository.py` |
| class | `FarmRepository` | repository | `src/modules/farm_manager/services/farm/farm_repository.py` |
| class | `HarvestRepository` | repository | `src/modules/farm_manager/services/block/harvest_repository.py` |
| class | `PlantDataEnhancedRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_repository.py` |
| class | `PlantDataRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_data_repository.py` |
| class | `PlantMotherRepository` | repository | `src/modules/farm_manager/services/plant_data/plant_mother_repository.py` |
| class | `PlantingRepository` | repository | `src/modules/farm_manager/services/planting/planting_repository.py` |
| class | `ReturnedInventoryRepository` | repository | `src/modules/farm_manager/services/inventory/returned_repository.py` |
| class | `TaskRepository` | repository | `src/modules/farm_manager/services/task/task_repository.py` |
| class | `AIDashboardScheduler` | service | `src/modules/farm_manager/services/ai_dashboard/scheduler.py` |
| class | `AIDashboardService` | service | `src/modules/farm_manager/services/ai_dashboard/service.py` |
| class | `AIHubService` | service | `src/modules/farm_manager/services/ai_hub/service.py` |
| class | `AlertChecker` | service | `src/modules/farm_manager/services/watchdog/checkers/alert_checker.py` |
| class | `AlertService` | service | `src/modules/farm_manager/services/block/alert_service.py` |
| class | `ArchiveService` | service | `src/modules/farm_manager/services/block/archive_service.py` |
| class | `BlockAnalyticsService` | service | `src/modules/farm_manager/services/block/analytics_service.py` |
| class | `BlockHealthChecker` | service | `src/modules/farm_manager/services/watchdog/checkers/block_health_checker.py` |
| class | `BlockService` | service | `src/modules/farm_manager/services/block/block_service_new.py` |
| class | `CascadeDeletionService` | service | `src/modules/farm_manager/services/cascade_deletion_service.py` |
| class | `ChemicalsService` | service | `src/modules/farm_manager/services/tools/chemicals_service.py` |
| class | `ConfigService` | service | `src/modules/farm_manager/services/config_service.py` |
| class | `DataCollector` | service | `src/modules/farm_manager/services/ai_dashboard/data_collector.py` |
| class | `FarmAIChatService` | service | `src/modules/farm_manager/services/farm_ai/service.py` |
| class | `FarmAnalyticsService` | service | `src/modules/farm_manager/services/farm/farm_analytics_service.py` |
| class | `FarmLevelAIChatService` | service | `src/modules/farm_manager/services/farm_level_ai/service.py` |
| class | `FarmService` | service | `src/modules/farm_manager/services/farm/farm_service.py` |
| class | `FarmingYearService` | service | `src/modules/farm_manager/services/farming_year_service.py` |
| class | `GlobalAIChatService` | service | `src/modules/farm_manager/services/global_ai/service.py` |
| class | `GlobalAnalyticsService` | service | `src/modules/farm_manager/services/global_analytics_service.py` |
| class | `HarvestAggregatorService` | service | `src/modules/farm_manager/services/task/harvest_aggregator.py` |
| class | `HarvestAggregatorService` | service | `src/modules/farm_manager/services/task/harvest_aggregator.py` |
| class | `HarvestService` | service | `src/modules/farm_manager/services/block/harvest_service.py` |
| class | `LateItemsChecker` | service | `src/modules/farm_manager/services/watchdog/checkers/late_items_checker.py` |
| class | `MCPChecker` | service | `src/modules/farm_manager/services/watchdog/checkers/mcp_checker.py` |
| class | `PlantDataEnhancedService` | service | `src/modules/farm_manager/services/plant_data/plant_data_enhanced_service.py` |
| class | `PlantDataService` | service | `src/modules/farm_manager/services/plant_data/plant_data_service.py` |
| class | `PlantMotherService` | service | `src/modules/farm_manager/services/plant_data/plant_mother_service.py` |
| class | `PlantingService` | service | `src/modules/farm_manager/services/planting/planting_service.py` |
| class | `PriceBook` | service | `src/modules/farm_manager/services/tools/price_book.py` |
| class | `ReportExporter` | service | `src/modules/farm_manager/services/ai_hub/report_exporter.py` |
| class | `ReportGenerator` | service | `src/modules/farm_manager/services/ai_dashboard/report_generator.py` |
| class | `SenseHubCacheQueryService` | service | `src/modules/farm_manager/services/sensehub/cache_query_service.py` |
| class | `SenseHubClient` | service | `src/modules/farm_manager/services/sensehub/sensehub_client.py` |
| class | `SenseHubConnectionService` | service | `src/modules/farm_manager/services/sensehub/sensehub_connection_service.py` |
| class | `SenseHubCropSync` | service | `src/modules/farm_manager/services/sensehub/sensehub_crop_sync.py` |
| class | `SenseHubMCPClient` | service | `src/modules/farm_manager/services/sensehub/sensehub_mcp_client.py` |
| class | `SenseHubSyncService` | service | `src/modules/farm_manager/services/sensehub/sync_service.py` |
| class | `SystemHealthChecker` | service | `src/modules/farm_manager/services/watchdog/checkers/system_health_checker.py` |
| class | `TaskGeneratorService` | service | `src/modules/farm_manager/services/task/task_generator.py` |
| class | `TaskGeneratorService` | service | `src/modules/farm_manager/services/task/task_generator.py` |
| class | `TaskRepository` | service | `src/modules/farm_manager/services/task/task_repository.py` |
| class | `TaskService` | service | `src/modules/farm_manager/services/task/task_service.py` |
| class | `TelegramService` | service | `src/modules/farm_manager/services/watchdog/telegram_service.py` |
| class | `VirtualBlockService` | service | `src/modules/farm_manager/services/block/virtual_block_service.py` |
| class | `WatchdogConfigService` | service | `src/modules/farm_manager/services/watchdog/config_service.py` |
| class | `WatchdogScheduler` | service | `src/modules/farm_manager/services/watchdog/scheduler.py` |
| class | `WatchdogService` | service | `src/modules/farm_manager/services/watchdog/service.py` |
| class | `WeatherAPIClient` | service | `src/modules/farm_manager/services/weather/weather_client.py` |
| class | `WeatherCacheService` | service | `src/modules/farm_manager/services/weather/weather_cache_service.py` |
| class | `WeatherService` | service | `src/modules/farm_manager/services/weather/weather_service.py` |
| function | `_enrich_tasks_with_block_farm` | service | `src/modules/farm_manager/services/task/task_repository.py` |
| function | `build_farm_system_prompt` | service | `src/modules/farm_manager/services/farm_level_ai/context_builder.py` |
| function | `build_global_system_prompt` | service | `src/modules/farm_manager/services/global_ai/context_builder.py` |
| function | `build_hub_system_prompt` | service | `src/modules/farm_manager/services/ai_hub/context_builder.py` |
| function | `build_system_prompt` | service | `src/modules/farm_manager/services/farm_ai/context_builder.py` |
| function | `calculate_for_crops` | service | `src/modules/farm_manager/services/tools/fertilizer_calculator.py` |
| function | `compute_stage` | service | `src/modules/farm_manager/services/sensehub/sensehub_stage_mapper.py` |
| function | `excel_handler` | service | `src/modules/farm_manager/services/tools/excel_handler.py` |
| function | `farm_ai pending_actions` | service | `src/modules/farm_manager/services/farm_ai/pending_actions.py` |
| function | `farm_ai tool_executor` | service | `src/modules/farm_manager/services/farm_ai/tool_executor.py` |
| function | `farm_level_ai tool_executor` | service | `src/modules/farm_manager/services/farm_level_ai/tool_executor.py` |
| function | `global_ai tool_executor` | service | `src/modules/farm_manager/services/global_ai/tool_executor.py` |
| function | `process_expired_harvest_inventory` | service | `src/modules/farm_manager/services/block/expiry_cron.py` |
| function | `sensehub_block_service_triggers` | service | `src/modules/farm_manager/services/block/sensehub_block_service_triggers.py` |

### `finance` (62 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `APAgingPage` | frontend | `frontend/user-portal/src/pages/finance/APAgingPage.tsx` |
| component | `AccountCombobox` | frontend | `frontend/user-portal/src/components/finance/AccountCombobox.tsx` |
| component | `ApprovalRulesPage` | frontend | `frontend/user-portal/src/pages/finance/ApprovalRulesPage.tsx` |
| component | `AuditHistoryModal` | frontend | `frontend/user-portal/src/components/finance/AuditHistoryModal/AuditHistoryModal.tsx` |
| component | `AuditHistoryModal barrel` | frontend | `frontend/user-portal/src/components/finance/AuditHistoryModal/index.ts` |
| component | `BalanceSheetPage` | frontend | `frontend/user-portal/src/pages/finance/BalanceSheetPage.tsx` |
| component | `CashFlowStatementPage` | frontend | `frontend/user-portal/src/pages/finance/CashFlowStatementPage.tsx` |
| component | `ChartOfAccountsPage` | frontend | `frontend/user-portal/src/pages/finance/ChartOfAccountsPage.tsx` |
| component | `CostCenterCombobox` | frontend | `frontend/user-portal/src/components/finance/CostCenterCombobox/CostCenterCombobox.tsx` |
| component | `CostCenterCombobox barrel` | frontend | `frontend/user-portal/src/components/finance/CostCenterCombobox/index.ts` |
| component | `FinanceGate` | frontend | `frontend/user-portal/src/components/finance/FinanceGate.tsx` |
| component | `FinanceReportPage` | frontend | `frontend/user-portal/src/components/finance/FinanceReportPage/FinanceReportPage.tsx` |
| component | `FinanceReportPage barrel` | frontend | `frontend/user-portal/src/components/finance/FinanceReportPage/index.ts` |
| component | `FinanceReportPage types` | frontend | `frontend/user-portal/src/components/finance/FinanceReportPage/types.ts` |
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
| type | `finance` | frontend | `frontend/user-portal/src/types/finance.ts` |
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
| db_model | `financial_summary` | model | `scripts/data_import/2026_04_07/stage7_finalize.py` |
| db_model | `purchase_register` | model | `src/modules/finance/services/database.py` |
| db_model | `sales_order_lines` | model | `src/modules/finance/services/database.py` |

### `finance_bridge` (9 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `FINANCE_CAPABILITY_CACHE_TTL_S` | config | `src/config/settings.py` |
| config | `FINANCE_OUTBOX_ENABLED` | config | `docker-compose.yml` |
| config | `FINANCE_SERVICE_URL` | config | `src/config/settings.py` |
| db_model | `finance_outbox` | model | `src/modules/finance_bridge/outbox_repository.py` |
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

### `genetics` (70 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD /genetics/accessions` | api | `src/modules/genetics/api/v1/accessions.py` |
| api_endpoint | `CRUD /genetics/lines` | api | `src/modules/genetics/api/v1/lines.py` |
| api_endpoint | `CRUD /genetics/media` | api | `src/modules/genetics/api/v1/media.py` |
| api_endpoint | `CRUD /genetics/observations` | api | `src/modules/genetics/api/v1/observations.py` |
| api_endpoint | `CRUD /genetics/propagations` | api | `src/modules/genetics/api/v1/propagations.py` |
| api_endpoint | `GET /genetics/dashboard` | api | `src/modules/genetics/api/v1/dashboard.py` |
| api_endpoint | `GET /genetics/lineage` | api | `src/modules/genetics/api/v1/lineage.py` |
| api_endpoint | `GET /genetics/printer/health` | api | `src/modules/genetics/api/v1/printer.py` |
| api_endpoint | `GET /public/genetics/i/{token}[/{vesselNo}]` | api | `src/modules/genetics/api/v1/public.py` |
| api_endpoint | `GET/DELETE /genetics/maintenance/orphans` | api | `src/modules/genetics/api/v1/maintenance.py` |
| api_endpoint | `GET/POST /genetics/accessions/{id}/labels` | api | `src/modules/genetics/api/v1/labels.py` |
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
| function | `build_protocol_ref` | service | `src/modules/genetics/services/protocol_link.py` |
| function | `genetics service helpers` | service | `src/modules/genetics/services/common.py` |
| function | `resolve_vessel` | service | `src/modules/genetics/services/accession/vessel_resolver.py` |

### `hr` (34 nodes)

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
| type | `hr` | frontend | `frontend/user-portal/src/types/hr.ts` |
| function | `hrService` | frontend | `frontend/user-portal/src/services/hrService.ts` |
| class | `HRDatabaseManager` | infrastructure | `src/modules/hr/services/database.py` |
| pydantic_model | `Contract` | model | `src/modules/hr/models/contract.py` |
| pydantic_model | `Employee` | model | `src/modules/hr/models/employee.py` |
| db_model | `employee_contracts` | model | `src/modules/hr/services/employee/contract_repository.py` |
| db_model | `employee_insurance` | model | `src/modules/hr/services/employee/insurance_repository.py` |
| db_model | `employee_performance` | model | `src/modules/hr/services/employee/performance_repository.py` |
| db_model | `employee_visas` | model | `src/modules/hr/services/employee/visa_repository.py` |
| db_model | `employees` | model | `src/modules/hr/services/employee/employee_repository.py` |
| db_model | `payroll_entries` | model | `scripts/data_import/2026_04_07/stage8_hr_payroll.py` |
| db_model | `payroll_runs` | model | `scripts/data_import/2026_04_07/stage8_hr_payroll.py` |
| class | `EmployeeRepository` | repository | `src/modules/hr/services/employee/employee_repository.py` |
| class | `ContractService` | service | `src/modules/hr/services/employee/contract_service.py` |
| class | `EmployeeService` | service | `src/modules/hr/services/employee/employee_service.py` |
| class | `InsuranceService` | service | `src/modules/hr/services/employee/insurance_service.py` |
| class | `PerformanceService` | service | `src/modules/hr/services/employee/performance_service.py` |
| class | `VisaService` | service | `src/modules/hr/services/employee/visa_service.py` |

### `infra` (76 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `ADMINER_PORT` | config | `docker-compose.yml` |
| config | `API_HOST` | config | `docker-compose.yml` |
| config | `API_PORT` | config | `docker-compose.yml` |
| config | `BACKUP_DIR` | config | `docker-compose.yml` |
| config | `BACKUP_ENCRYPTION_KEY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_DAILY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_MONTHLY` | config | `docker-compose.yml` |
| config | `BACKUP_RETENTION_WEEKLY` | config | `docker-compose.yml` |
| config | `CLOUDFLARED_SERVICE_HOME` | config | `.env.example` |
| config | `CLOUDFLARED_SERVICE_USER` | config | `.env.example` |
| config | `CLOUDFLARED_TUNNEL_ID` | config | `.env.example` |
| config | `CLOUDFLARED_TUNNEL_NAME` | config | `.env.example` |
| config | `CLOUDFLARE_DOMAIN` | config | `.env.example` |
| config | `CONSUMER_BATCH_SIZE` | config | `docker-compose.finance.yml` |
| config | `CONSUMER_MAX_ATTEMPTS` | config | `docker-compose.finance.yml` |
| config | `CONSUMER_POLL_INTERVAL_SECONDS` | config | `docker-compose.finance.yml` |
| config | `CONSUMER_STALE_CLAIM_SECONDS` | config | `docker-compose.finance.yml` |
| config | `ENCRYPT_BACKUPS` | config | `docker-compose.yml` |
| config | `FINANCE_INGESTION_SECRET` | config | `docker-compose.finance.yml` |
| config | `FINANCE_MYSQL_DATABASE` | config | `.env.example` |
| config | `FINANCE_MYSQL_PASSWORD` | config | `.env.example` |
| config | `FINANCE_MYSQL_PORT` | config | `.env.example` |
| config | `FINANCE_MYSQL_ROOT_PASSWORD` | config | `.env.example` |
| config | `FINANCE_MYSQL_USER` | config | `.env.example` |
| config | `FINANCE_PORT` | config | `docker-compose.finance.yml` |
| config | `FINANCE_URL` | config | `docker-compose.finance.yml` |
| config | `IOT_SIM_PORT` | config | `docker-compose.yml` |
| config | `LOG_FILE` | config | `docker-compose.yml` |
| config | `MONGODB_PORT` | config | `docker-compose.yml` |
| config | `MONGO_APP_PASSWORD` | config | `docker-compose.yml` |
| config | `MONGO_APP_USER` | config | `docker-compose.yml` |
| config | `MONGO_AUTH_DB` | config | `docker-compose.yml` |
| config | `MONGO_DB` | config | `docker-compose.yml` |
| config | `MONGO_HOST` | config | `docker-compose.yml` |
| config | `MONGO_INITDB_DATABASE` | config | `docker-compose.yml` |
| config | `MONGO_INITDB_ROOT_PASSWORD` | config | `docker-compose.prod.yml` |
| config | `MONGO_INITDB_ROOT_USERNAME` | config | `docker-compose.prod.yml` |
| config | `MONGO_PASSWORD` | config | `docker-compose.yml` |
| config | `MONGO_PORT` | config | `docker-compose.yml` |
| config | `MONGO_ROOT_PASSWORD` | config | `docker-compose.prod.yml` |
| config | `MONGO_ROOT_USERNAME` | config | `docker-compose.prod.yml` |
| config | `MONGO_USER` | config | `docker-compose.yml` |
| config | `MYSQL_DATABASE` | config | `docker-compose.finance.yml` |
| config | `MYSQL_DB_NAME` | config | `.env.example` |
| config | `MYSQL_HOST` | config | `docker-compose.finance.yml` |
| config | `MYSQL_PASSWORD` | config | `docker-compose.finance.yml` |
| config | `MYSQL_PORT` | config | `docker-compose.finance.yml` |
| config | `MYSQL_ROOT_PASSWORD` | config | `docker-compose.finance.yml` |
| config | `MYSQL_USER` | config | `docker-compose.finance.yml` |
| config | `NGINX_CONF` | config | `docker-compose.yml` |
| config | `NGINX_HTTPS_PORT` | config | `docker-compose.yml` |
| config | `NGINX_HTTP_PORT` | config | `docker-compose.yml` |
| config | `PYTHONPATH` | config | `docker-compose.yml` |
| config | `REDIS_PASSWORD` | config | `docker-compose.yml` |
| config | `REDIS_PORT` | config | `docker-compose.yml` |
| config | `REGISTRY_PORT` | config | `docker-compose.yml` |
| config | `REGISTRY_STORAGE_DELETE_ENABLED` | config | `docker-compose.yml` |
| config | `TZ` | config | `docker-compose.yml` |
| config | `USER_PORTAL_PORT` | config | `docker-compose.yml` |
| config | `USER_PORTAL_PROD_PORT` | config | `docker-compose.prod.yml` |
| config | `UVICORN_WORKERS` | config | `docker-compose.yml` |
| config | `adminer (DB UI)` | config | `docker-compose.yml` |
| config | `api (FastAPI)` | config | `docker-compose.yml` |
| config | `backup (mongodump + retention)` | config | `docker-compose.yml` |
| config | `cron (scheduled tasks)` | config | `docker-compose.yml` |
| config | `docker-compose.prod.yml` | config | `docker-compose.prod.yml` |
| config | `docker-compose.sslh.yml` | config | `docker-compose.sslh.yml` |
| config | `finance (FastAPI, port 8001)` | config | `docker-compose.finance.yml` |
| config | `finance_consumer (outbox worker)` | config | `docker-compose.finance.yml` |
| config | `iot-simulator` | config | `docker-compose.yml` |
| config | `mongodb (MongoDB 7.0)` | config | `docker-compose.yml` |
| config | `mysql (finance store)` | config | `docker-compose.finance.yml` |
| config | `nginx (reverse proxy)` | config | `docker-compose.yml` |
| config | `redis (Redis 7)` | config | `docker-compose.yml` |
| config | `registry (local Docker registry)` | config | `docker-compose.yml` |
| config | `user-portal (React/Vite)` | config | `docker-compose.yml` |

### `inventory` (7 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| component | `AssetInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/AssetInventoryList.tsx` |
| component | `HarvestInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/HarvestInventoryList.tsx` |
| component | `InputInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/InputInventoryList.tsx` |
| component | `InventoryDashboard` | frontend | `frontend/user-portal/src/pages/inventory/InventoryDashboard.tsx` |
| component | `ReturnedInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/ReturnedInventoryList.tsx` |
| component | `WasteInventoryList` | frontend | `frontend/user-portal/src/pages/inventory/WasteInventoryList.tsx` |
| type | `inventory` | frontend | `frontend/user-portal/src/types/inventory.ts` |

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
| type | `logistics` | frontend | `frontend/user-portal/src/types/logistics.ts` |
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
| type | `marketing` | frontend | `frontend/user-portal/src/types/marketing.ts` |
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
| type | `mushroom` | frontend | `frontend/user-portal/src/types/mushroom.ts` |
| hook | `useContamination` | frontend | `frontend/user-portal/src/hooks/mushroom/useContamination.ts` |
| hook | `useFacilityData` | frontend | `frontend/user-portal/src/hooks/mushroom/useFacilityData.ts` |
| hook | `useMushroomDashboard` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomDashboard.ts` |
| hook | `useMushroomHarvests` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomHarvests.ts` |
| hook | `useMushroomStrains` | frontend | `frontend/user-portal/src/hooks/mushroom/useMushroomStrains.ts` |
| hook | `useRoomData` | frontend | `frontend/user-portal/src/hooks/mushroom/useRoomData.ts` |
| hook | `useRoomEnvironment` | frontend | `frontend/user-portal/src/hooks/mushroom/useRoomEnvironment.ts` |
| hook | `useSubstrateBatches` | frontend | `frontend/user-portal/src/hooks/mushroom/useSubstrateBatches.ts` |

### `mushroom_manager` (33 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| api_endpoint | `CRUD + phase lifecycle /mushroom/facilities/{id}/rooms` | api | `src/modules/mushroom_manager/api/v1/growing_rooms.py` |
| api_endpoint | `CRUD /mushroom substrate batches` | api | `src/modules/mushroom_manager/api/v1/substrate_batches.py` |
| api_endpoint | `CRUD /mushroom/facilities` | api | `src/modules/mushroom_manager/api/v1/facilities.py` |
| api_endpoint | `CRUD /mushroom/strains` | api | `src/modules/mushroom_manager/api/v1/strains.py` |
| api_endpoint | `Climate logs /mushroom rooms` | api | `src/modules/mushroom_manager/api/v1/environment.py` |
| api_endpoint | `Contamination reports /mushroom` | api | `src/modules/mushroom_manager/api/v1/contamination.py` |
| api_endpoint | `GET /mushroom/dashboard + facility analytics` | api | `src/modules/mushroom_manager/api/v1/dashboard.py` |
| api_endpoint | `Harvest recording + yield-by-lineage /mushroom` | api | `src/modules/mushroom_manager/api/v1/harvests.py` |
| function | `mushroom response envelopes` | api | `src/modules/mushroom_manager/utils/responses.py` |
| config | `Mushroom module settings` | config | `src/modules/mushroom_manager/config/settings.py` |
| file | `mushroom_manager module registration` | config | `src/modules/mushroom_manager/register.py` |
| pydantic_model | `Contamination Report models` | model | `src/modules/mushroom_manager/models/contamination.py` |
| pydantic_model | `Environment Log models` | model | `src/modules/mushroom_manager/models/environment.py` |
| pydantic_model | `Facility models` | model | `src/modules/mushroom_manager/models/facility.py` |
| pydantic_model | `Growing Room models + lifecycle tables` | model | `src/modules/mushroom_manager/models/growing_room.py` |
| pydantic_model | `Harvest models` | model | `src/modules/mushroom_manager/models/harvest.py` |
| pydantic_model | `Strain models` | model | `src/modules/mushroom_manager/models/strain.py` |
| pydantic_model | `Substrate Batch models` | model | `src/modules/mushroom_manager/models/substrate.py` |
| db_model | `contamination_reports` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `growing_rooms` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `mushroom_facilities` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `mushroom_harvests` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `mushroom_strains` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `room_environment_logs` | model | `src/modules/mushroom_manager/services/database.py` |
| db_model | `substrate_batches` | model | `src/modules/mushroom_manager/services/database.py` |
| class | `ContaminationService` | service | `src/modules/mushroom_manager/services/contamination/contamination_service.py` |
| class | `EnvironmentService` | service | `src/modules/mushroom_manager/services/environment/environment_service.py` |
| class | `FacilityService` | service | `src/modules/mushroom_manager/services/facility/facility_service.py` |
| class | `HarvestService` | service | `src/modules/mushroom_manager/services/harvest/harvest_service.py` |
| class | `MushroomDatabaseManager` | service | `src/modules/mushroom_manager/services/database.py` |
| class | `RoomService` | service | `src/modules/mushroom_manager/services/room/room_service.py` |
| class | `StrainService` | service | `src/modules/mushroom_manager/services/strain/strain_service.py` |
| class | `SubstrateService` | service | `src/modules/mushroom_manager/services/substrate/substrate_service.py` |

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
| type | `capabilities` | frontend | `frontend/user-portal/src/types/capabilities.ts` |

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

### `protocols` (10 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| function | `ProtocolCategoryIcons` | frontend | `frontend/user-portal/src/components/protocols/categoryIcons.ts` |
| component | `ProtocolFormModal` | frontend | `frontend/user-portal/src/components/protocols/ProtocolFormModal.tsx` |
| component | `ProtocolPicker` | frontend | `frontend/user-portal/src/components/protocols/ProtocolPicker.tsx` |
| function | `ProtocolStatusPhase` | frontend | `frontend/user-portal/src/components/protocols/statusPhase.ts` |
| component | `ProtocolViewModal` | frontend | `frontend/user-portal/src/components/protocols/ProtocolViewModal.tsx` |
| component | `ProtocolsPage` | frontend | `frontend/user-portal/src/pages/protocols/ProtocolsPage.tsx` |
| type | `protocols` | frontend | `frontend/user-portal/src/types/protocols.ts` |
| function | `protocolsApi` | frontend | `frontend/user-portal/src/services/protocolsApi.ts` |
| hook | `useProtocols` | frontend | `frontend/user-portal/src/hooks/protocols/useProtocols.ts` |
| db_model | `protocols` | model | `src/modules/protocols/services/database.py` |

### `purchasing` (29 nodes)

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
| db_model | `payment_terms` | model | `src/modules/purchasing/services/payment_terms_service.py` |
| db_model | `purchase_items` | model | `src/modules/purchasing/services/purchase_item_service.py` |
| db_model | `vendors` | model | `src/modules/purchasing/services/vendor_service.py` |

### `sales` (112 nodes)

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
| component | `ArCreditNoteDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNoteDetailPage.tsx` |
| component | `ArCreditNoteFormPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNoteFormPage.tsx` |
| component | `ArCreditNotesPage` | frontend | `frontend/user-portal/src/pages/sales/ArCreditNotesPage.tsx` |
| component | `CompanyCombobox` | frontend | `frontend/user-portal/src/components/sales/CompanyCombobox.tsx` |
| component | `CurrencyCombobox` | frontend | `frontend/user-portal/src/components/sales/CurrencyCombobox.tsx` |
| component | `CustomerCombobox` | frontend | `frontend/user-portal/src/components/sales/CustomerCombobox.tsx` |
| component | `CustomerReceiptDetailPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptDetailPage.tsx` |
| component | `CustomerReceiptFormPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptFormPage.tsx` |
| component | `CustomerReceiptsPage` | frontend | `frontend/user-portal/src/pages/sales/CustomerReceiptsPage.tsx` |
| component | `DeliveriesPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveriesPage.tsx` |
| component | `DeliveryDetailPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveryDetailPage.tsx` |
| component | `DeliveryFormPage` | frontend | `frontend/user-portal/src/pages/sales/DeliveryFormPage.tsx` |
| component | `PaymentTermsCombobox` | frontend | `frontend/user-portal/src/components/sales/PaymentTermsCombobox.tsx` |
| component | `QuickServiceChargeModal` | frontend | `frontend/user-portal/src/components/sales/QuickServiceChargeModal.tsx` |
| component | `QuoteDetailPage` | frontend | `frontend/user-portal/src/pages/sales/QuoteDetailPage.tsx` |
| component | `QuoteFormPage` | frontend | `frontend/user-portal/src/pages/sales/QuoteFormPage.tsx` |
| component | `QuotesPage` | frontend | `frontend/user-portal/src/pages/sales/QuotesPage.tsx` |
| component | `ReturnDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnDetailPage.tsx` |
| component | `ReturnFormPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnFormPage.tsx` |
| component | `ReturnRequestDetailPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestDetailPage.tsx` |
| component | `ReturnRequestFormPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestFormPage.tsx` |
| component | `ReturnRequestsPage` | frontend | `frontend/user-portal/src/pages/sales/ReturnRequestsPage.tsx` |
| component | `ReturnsV2Page` | frontend | `frontend/user-portal/src/pages/sales/ReturnsV2Page.tsx` |
| component | `SalesActionTiles` | frontend | `frontend/user-portal/src/components/sales/SalesActionTiles.tsx` |
| component | `SalesAuditHistoryModal` | frontend | `frontend/user-portal/src/components/sales/SalesAuditHistoryModal.tsx` |
| component | `SalesDashboardPage` | frontend | `frontend/user-portal/src/pages/sales/SalesDashboardPage.tsx` |
| component | `SalesItemCombobox` | frontend | `frontend/user-portal/src/components/sales/SalesItemCombobox.tsx` |
| component | `SalesItemsPage` | frontend | `frontend/user-portal/src/pages/sales/SalesItemsPage.tsx` |
| component | `SalesOrderDetailPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrderDetailPage.tsx` |
| component | `SalesOrderFormPage` | frontend | `frontend/user-portal/src/pages/sales/SalesOrderFormPage.tsx` |
| component | `SalesOrdersV2Page` | frontend | `frontend/user-portal/src/pages/sales/SalesOrdersV2Page.tsx` |
| function | `SalesStatusPhase` | frontend | `frontend/user-portal/src/components/sales/statusPhase.ts` |
| component | `StockPage` | frontend | `frontend/user-portal/src/pages/sales/StockPage.tsx` |
| type | `returns` | frontend | `frontend/user-portal/src/types/returns.ts` |
| type | `sales` | frontend | `frontend/user-portal/src/types/sales.ts` |
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
| db_model | `ar_credit_notes_v2` | model | `src/modules/sales/services/ar_credit_note_service.py` |
| db_model | `ar_credit_notes_v2_audit` | model | `src/modules/sales/services/ar_credit_note_service.py` |
| db_model | `ar_invoices_v2` | model | `src/modules/sales/services/ar_invoice_service.py` |
| db_model | `ar_invoices_v2_audit` | model | `src/modules/sales/services/ar_invoice_service.py` |
| db_model | `customer_receipts_v2` | model | `src/modules/sales/services/customer_receipt_service.py` |
| db_model | `customer_receipts_v2_audit` | model | `src/modules/sales/services/customer_receipt_service.py` |
| db_model | `deliveries_v2` | model | `src/modules/sales/services/delivery_service.py` |
| db_model | `deliveries_v2_audit` | model | `src/modules/sales/services/delivery_service.py` |
| db_model | `purchase_orders` | model | `src/modules/sales/services/sales/purchase_order_repository.py` |
| db_model | `return_orders` | model | `src/modules/sales/services/sales/return_service.py` |
| db_model | `return_requests_v2` | model | `src/modules/sales/services/return_request_service.py` |
| db_model | `return_requests_v2_audit` | model | `src/modules/sales/services/return_request_service.py` |
| db_model | `returns_v2` | model | `src/modules/sales/services/rtn_service.py` |
| db_model | `returns_v2_audit` | model | `src/modules/sales/services/rtn_service.py` |
| db_model | `sales_orders` | model | `src/modules/sales/services/sales/order_repository.py` |
| db_model | `sales_orders_v2` | model | `src/modules/sales/services/sales_order_service.py` |
| db_model | `sales_orders_v2_audit` | model | `src/modules/sales/services/sales_order_service.py` |
| db_model | `sales_quotes` | model | `src/modules/sales/services/quote_service.py` |
| db_model | `sales_quotes_audit` | model | `src/modules/sales/services/quote_service.py` |
| db_model | `sales_unmatched` | model | `scripts/data_import/2026_04_07/stage5_sales_excel.py` |
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

### `shared` (21 nodes)

| Type | Name | Layer | File |
|------|------|-------|------|
| config | `reactQuery` | config | `frontend/user-portal/src/config/react-query.config.ts` |
| file | `App` | frontend | `frontend/user-portal/src/App.tsx` |
| component | `AttachmentList` | frontend | `frontend/user-portal/src/components/attachments/AttachmentList.tsx` |
| component | `AutoNameBanner` | frontend | `frontend/user-portal/src/components/common/AutoNameBanner.tsx` |
| component | `DivisionSelector` | frontend | `frontend/user-portal/src/pages/division/DivisionSelector.tsx` |
| component | `DivisionSwitcher` | frontend | `frontend/user-portal/src/components/layout/DivisionSwitcher.tsx` |
| component | `DrawingControls` | frontend | `frontend/user-portal/src/components/map/DrawingControls.tsx` |
| component | `HelpButton` | frontend | `frontend/user-portal/src/components/tutorials/HelpButton.tsx` |
| component | `MainLayout` | frontend | `frontend/user-portal/src/components/layout/MainLayout.tsx` |
| component | `Map components barrel` | frontend | `frontend/user-portal/src/components/map/index.ts` |
| component | `MapContainer` | frontend | `frontend/user-portal/src/components/map/MapContainer.tsx` |
| component | `MapSearchBar` | frontend | `frontend/user-portal/src/components/map/MapSearchBar.tsx` |
| component | `NotFound` | frontend | `frontend/user-portal/src/pages/NotFound.tsx` |
| component | `Profile` | frontend | `frontend/user-portal/src/pages/profile/Profile.tsx` |
| component | `ProtectedRoute` | frontend | `frontend/user-portal/src/components/common/ProtectedRoute.tsx` |
| component | `ToastContainer` | frontend | `frontend/user-portal/src/components/common/ToastContainer.tsx` |
| component | `UnsavedChangesDialog` | frontend | `frontend/user-portal/src/components/common/UnsavedChangesDialog.tsx` |
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
| type | `tools` | frontend | `frontend/user-portal/src/types/tools.ts` |
| function | `toolsApi` | frontend | `frontend/user-portal/src/services/toolsApi.ts` |
| hook | `useTools` | frontend | `frontend/user-portal/src/hooks/queries/useTools.ts` |

## Cross-Module Dependencies

| Source Module | Edge | Target Module |
|---------------|------|---------------|
| `core.middleware.permissions` | depends_on | `core.middleware.auth` |
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
| `core.api.main` | depends_on | `core.config.settings` |
| `core.api.main` | depends_on | `core.service.audit_log_service` |
| `core.api.admin` | depends_on | `core.service.audit_log_service` |
| `core.api.auth` | depends_on | `core.config.settings` |
| `core.api.organizations` | depends_on | `core.service.database` |
| `core.api.tools.chemicals` | depends_on | `farm_manager.service.ChemicalsRepository` |
| `core.api.tools.chemicals` | depends_on | `farm_manager.service.ChemicalsService` |
| `core.api.tools.chemicals` | depends_on | `farm_manager.model.FertilizerChemical` |
| `core.api.tools.chemicals` | depends_on | `farm_manager.middleware.auth` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.service.ChemicalsRepository` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.service.PriceBook` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.service.CalculationListsRepository` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.service.FarmDatabaseManager` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.model.CalculationList` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.model.FertilizerChemical` |
| `core.api.tools.fertilizer_cost` | depends_on | `farm_manager.middleware.auth` |
| `ai_assistant.api.assistant` | depends_on | `core.middleware.auth` |
| `ai_assistant.service.claude_service` | depends_on | `core.config.settings` |
| `ai_assistant.service.conversation_repository` | depends_on | `core.service.database` |
| `ai_assistant.service.cost_tracker` | depends_on | `core.service.database` |
| `ai_assistant.service.tool_executor` | depends_on | `farm_manager.service.FarmDatabaseManager` |
| `ai_assistant.service.tool_executor` | depends_on | `core.service.database` |
| `ai_assistant.service.tool_executor` | depends_on | `core.config.settings` |
| `core.service.user_service` | depends_on | `core.service.audit_log_service` |
| `core.service.label_printer_service` | depends_on | `core.service.deployment_settings_service` |
| `genetics.api.labels` | depends_on | `core.service.label_printer_service` |
| `genetics.api.printer` | depends_on | `core.service.label_printer_service` |
| `core.utils.email` | depends_on | `core.config.settings` |
| `core.utils.security` | depends_on | `core.config.settings` |
| `core.middleware.auth` | depends_on | `core.service.database` |
| `core.middleware.rate_limit` | depends_on | `core.config.settings` |
| `core.model.deployment_settings` | depends_on | `core.service.deployment_settings_service` |
| `farm_manager.api.inventory` | depends_on | `farm_manager.service.ReturnedInventoryRepository` |
| `farm_manager.api.dashboard` | depends_on | `farm_manager.service.FarmRepository` |
| `farm_manager.api.dashboard` | depends_on | `farm_manager.service.BlockRepository` |
| `farm_manager.api.dashboard` | depends_on | `farm_manager.service.AlertRepository` |
| `farm_manager.api.weather` | depends_on | `farm_manager.service.FarmService` |
| `farm_manager.api.managers` | depends_on | `farm_manager.service.FarmDatabase` |
| `farm_manager.api.inventory` | depends_on | `farm_manager.service.FarmDatabase` |
| `farm_manager.api.farms.get_farm_summary` | depends_on | `farm_manager.service.BlockRepository` |
| `mushroom_manager.api.facilities` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.growing_rooms` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.strains` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.substrate_batches` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.harvests` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.environment` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.contamination` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.api.dashboard` | depends_on | `farm_manager.middleware.auth` |
| `mushroom_manager.service.database` | depends_on | `core.service.database` |
| `mushroom_manager.register` | depends_on | `core.plugin_system.plugin_manager` |
| `compose_api` | depends_on | `compose_mongodb` |
| `compose_api` | depends_on | `compose_redis` |
| `compose_nginx` | depends_on | `compose_api` |
| `compose_adminer` | depends_on | `compose_mongodb` |
| `compose_cron` | depends_on | `compose_api` |
| `compose_cron` | depends_on | `compose_mongodb` |
| `compose_backup` | depends_on | `compose_mongodb` |
| `compose_finance` | depends_on | `compose_mysql` |
| `compose_finance_consumer` | depends_on | `compose_finance` |
| `compose_finance_consumer` | depends_on | `compose_mongodb` |
| `genetics.api.labels` | depends_on | `core.service.deployment_settings_service` |
| `genetics.api.labels` | depends_on | `core.service.user_service` |
| `genetics.api.public` | depends_on | `core.middleware.rate_limit` |
| `genetics.api.public` | depends_on | `core.service.organization_service` |
| `genetics.api.public` | depends_on | `core.service.user_service` |
| `genetics.service.lineage_service` | depends_on | `genetics.service.accession_service` |
| `genetics.service.lineage_service` | depends_on | `genetics.service.line_service` |
