# DevLog — Wave 0: Finance as opt-in add-on

**Date:** 2026-05-24
**Session type:** Implementation (single-session, inline)
**Status:** Implementation complete — pending user verification + tests
**Backlog:** T-059 (and sub-tasks .1–.7)
**Design doc:** `Docs/2-Working-Progress/Wave-0-Design.md`

## Session objective

Implement the full Wave 0 boundary: per-tenant `modules.financeEnabled`
flag, runtime capability endpoint, frontend gating + free-text fallback
on purchasing forms, nginx 503 when finance is unreachable, CI smoke
job, and import-boundary lint. Defaults per approver (design §13):
super_admin only, accept any tax-code string, nginx 503, existing
audit_log schema.

## What we accomplished

### Backend (T-059.1 + T-059.2)
- `src/models/organization.py` — added `OrganizationModules` (with
  `financeEnabled: bool = True`) and `OrganizationModulesUpdate` (PATCH
  schema). Threaded through `OrganizationResponse`.
- `src/services/organization_service.py` — added `update_modules()`
  service method; all read/create/update paths now hydrate `modules`.
- `src/modules/finance_bridge/reachability.py` — new module. Cached
  health-ping against `FINANCE_SERVICE_URL/api/v1/system/health` (1s
  timeout, 60s TTL in Redis, keys `system:finance:reachable` +
  `system:finance:version`). Never raises — degrades to `(False, None)`.
- `src/modules/finance_bridge/tenant_flag.py` — new module.
  `is_finance_enabled_for_org()` with per-org Redis cache (key
  `org:{id}:financeEnabled`, 60s TTL). Defaults to enabled when org is
  missing.
- `src/modules/finance_bridge/outbox_writer.py` — added per-tenant gate
  AFTER the global env flag. When `modules.financeEnabled=false` the
  writer returns `None` without inserting into `finance_outbox`.
- `src/api/v1/system.py` — new router. `GET /api/v1/system/capabilities`
  returns `{tenantId, modules: {finance: {enabled, reachable, version}},
  checkedAt}`. Shared `build_capabilities_response()` helper.
- `src/api/v1/auth.py` — `/auth/me` now returns `UserMeResponse` with a
  `capabilities` field embedded. Frontend gets module status on login.
- `src/api/v1/organizations.py` — new `PATCH /{org_id}/modules`
  endpoint. Super_admin only. Writes `admin_audit_log` entry with
  before/after. Invalidates the Redis tenant flag cache so the change
  takes effect within milliseconds.
- `src/api/routes.py` — registered the `system` router.
- `src/config/settings.py` — added `FINANCE_SERVICE_URL` (default
  `http://finance:8001`) and `FINANCE_CAPABILITY_CACHE_TTL_S` (60).
- `services/finance/src/finance/api/v1/health.py` — added
  `system_router` exposing `/health` with `version`. Existing
  `/api/v1/finance/health` also gained the version field.
- `services/finance/src/finance/main.py` — mounted `system_router` at
  `/api/v1/system` so the ops backend can ping
  `http://finance:8001/api/v1/system/health`.
- `scripts/migrations/wave0_add_finance_flag.py` — idempotent
  one-shot. Sets `modules.financeEnabled=true` on every org missing
  the field. Logs match/modified counts.

### Frontend (T-059.3 + T-059.4)
- `frontend/user-portal/src/types/capabilities.ts` — `Capabilities`,
  `ModuleCapabilities`, `FinanceModuleCapability`.
- `frontend/user-portal/src/services/systemService.ts` —
  `getCapabilities()` + `updateOrganizationModules()`.
- `frontend/user-portal/src/hooks/useCapabilities.ts` — TanStack Query
  hook (60s staleTime, no window-focus refetch, placeholderData keeps
  last value through refetch). Plus `useFinanceEnabled()` and
  `useFinanceUnreachable()` derivatives.
- `frontend/user-portal/src/components/finance/FinanceGate.tsx` — route
  wrapper that Navigates to `/dashboard` when finance is off.
- `frontend/user-portal/src/components/finance/FinanceUnreachableBanner.tsx`
  — amber banner; renders null when reachable.
- `frontend/user-portal/src/components/settings/ModulesSettingsCard.tsx`
  — Tenant Settings → Modules card (super_admin only). Confirmation
  modal on disable, modal does NOT close on overlay click.
  Mutation invalidates `['system','capabilities']` + refreshes auth/me.
- `frontend/user-portal/src/App.tsx` — wrapped all 11 finance routes
  with `<FinanceGate>`.
- `frontend/user-portal/src/components/layout/MainLayout.tsx` — sidebar
  Finance group now hidden when `useFinanceEnabled() === false`.
- `PurchaseRequestFormPage.tsx`, `PurchaseOrderFormPage.tsx` —
  conditional render: `<Select>` when finance on, `<Input>` (free-text)
  when off. Banner at top of form.
- `GoodsReceiptFormPage.tsx` — cost-centre column hidden (both
  `<Th>` and `<Td>`) when finance off. Banner at top.
- `APInvoiceFormPage.tsx` — tax-code degrades to `<Input>` when off;
  cost-centre column hidden. Banner at top.
- `pages/settings/Settings.tsx` — mounted `<ModulesSettingsCard />`.

### DevOps (T-059.5)
- `nginx/nginx.dev.conf` + `nginx/nginx.prod.conf` — `/api/v1/finance/`
  location intercepts 502/504 → returns 503 with JSON body
  `{"detail":"Finance module not available","module":"finance"}` via
  a `@finance_unavailable` named location. Quick-fail timeouts (2/5/5s).

### CI (T-059.6)
- `.github/workflows/ops-only-smoke.yml` — boots ops-only stack,
  verifies `/api/v1/finance/health` returns 503, runs the Wave 0
  migration, sanity-checks `/api/v1/system/capabilities` reports
  `finance.reachable=false`.
- `scripts/ci/check_finance_imports.sh` — lint that blocks
  `from services.finance` in `src/`. Verified locally — passes.

### Docs (T-059.7)
- `Docs/1-Main-Documentation/Deployment-Modes.md` — new. Ops-only vs
  full-stack mode, per-tenant flag mechanics, capability endpoint
  contract, free-text fallback table, common failure modes.
- `CLAUDE.md` — added "Modules / Deployment Modes (Wave 0)" section.
- This DevLog.

## Verification status

### Done
- Python syntax check on all 13 edited backend files (ast.parse) — OK.
- Frontend `tsc --noEmit -p tsconfig.json` — exit 0 (no type errors).
- `scripts/ci/check_finance_imports.sh` — passes locally.

### Pending (deferred to user per project preference)
- Boot the stack and exercise `/api/v1/system/capabilities`.
- Toggle `modules.financeEnabled=false` via mongosh and verify (a)
  capability endpoint reports `enabled=false`, (b) outbox writer skips
  insert.
- Playwright smoke through PR → PO → GR → AP with finance off.
- Migration script dry-run against a live MongoDB.

## Next steps

1. **User verification:** boot the stack, hit the capability endpoint
   with a logged-in user, run the migration, exercise the toggle in
   Settings → Tenant Modules.
2. **Add backend unit tests:** `tests/unit/test_finance_bridge/` for
   `tenant_flag.py`, `reachability.py`, and a test that
   `OutboxWriter.publish()` returns `None` when the per-tenant flag is
   false. The Wave 0 test scaffolding was deferred to the testing
   specialist agent (couldn't dispatch due to credit cap on long-
   context Opus session).
3. **Regenerate CodeMaps** — `Docs/CodeMaps/INDEX.md` is now stale.
   Structural changes: 1 new endpoint (`system/capabilities`), 1 new
   PATCH (`organizations/{id}/modules`), 4 new src/ modules
   (`system.py`, `reachability.py`, `tenant_flag.py`, the wave0
   migration), 4 new frontend files (hook + 3 components).
   Run: `bash scripts/codebase_mapper/rerun.sh && python3
   scripts/codebase_mapper/map_generator.py all`.

## Important context for next session

### Operational note — Docker restart required
Backend changes (router registration, new modules, organization model)
require an `api` container restart. Nginx changes require an `nginx`
container restart. Frontend changes hot-reload but the new types may
need a Vite dev-server bounce if cache is stuck.

```bash
docker compose restart api nginx user-portal
# After first start in full-stack mode:
docker compose -f docker-compose.yml -f docker-compose.finance.yml --profile finance \
  exec api python scripts/migrations/wave0_add_finance_flag.py
```

### Open decisions deferred (post-Wave 0)
- Wave 9 will key `financeEnabled` default off pricing tier — for now
  new orgs default `true`.
- Free-text taxCode validation is intentionally absent — operators
  cleaning up after a later finance-enable should run a one-off mapping
  pass.

## Files modified

### Backend
- `src/config/settings.py`
- `src/models/organization.py`
- `src/services/organization_service.py`
- `src/modules/finance_bridge/outbox_writer.py`
- `src/api/v1/auth.py`
- `src/api/v1/organizations.py`
- `src/api/routes.py`
- `services/finance/src/finance/api/v1/health.py`
- `services/finance/src/finance/main.py`

### Backend — new
- `src/modules/finance_bridge/reachability.py`
- `src/modules/finance_bridge/tenant_flag.py`
- `src/api/v1/system.py`
- `scripts/migrations/wave0_add_finance_flag.py`

### Frontend — new
- `frontend/user-portal/src/types/capabilities.ts`
- `frontend/user-portal/src/services/systemService.ts`
- `frontend/user-portal/src/hooks/useCapabilities.ts`
- `frontend/user-portal/src/components/finance/FinanceGate.tsx`
- `frontend/user-portal/src/components/finance/FinanceUnreachableBanner.tsx`
- `frontend/user-portal/src/components/settings/ModulesSettingsCard.tsx`

### Frontend — modified
- `frontend/user-portal/src/App.tsx`
- `frontend/user-portal/src/components/layout/MainLayout.tsx`
- `frontend/user-portal/src/pages/purchasing/PurchaseRequestFormPage.tsx`
- `frontend/user-portal/src/pages/purchasing/PurchaseOrderFormPage.tsx`
- `frontend/user-portal/src/pages/purchasing/GoodsReceiptFormPage.tsx`
- `frontend/user-portal/src/pages/purchasing/APInvoiceFormPage.tsx`
- `frontend/user-portal/src/pages/settings/Settings.tsx`

### Infra
- `nginx/nginx.dev.conf`
- `nginx/nginx.prod.conf`

### CI
- `.github/workflows/ops-only-smoke.yml` (new)
- `scripts/ci/check_finance_imports.sh` (new)

### Docs
- `Docs/1-Main-Documentation/Deployment-Modes.md` (new)
- `CLAUDE.md`
- `Docs/Backlog/BACKLOG.md` (T-059 → Active, then ARCHIVE on user sign-off)
- `Docs/3-DevLog/2026-05-24_wave0-finance-opt-in.md` (this file)

## Session metrics

- Files touched: 26 (12 new, 14 modified)
- Backend lines added: ~620
- Frontend lines added: ~470
- Test coverage added: 0 (deferred — see Next Steps #2)
- Author: Viet Anh (via Claude — single inline session after sub-agent
  dispatch failed on long-context Opus credit cap)
