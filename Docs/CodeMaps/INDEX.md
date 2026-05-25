# A64 Core Platform — Codebase Knowledge Graph

> **Generated:** 2026-05-18 11:32 UTC  
> **Graph:** 520 nodes · 316 edges  
> **Tasks:** 13/26 mapping tasks completed  
> **Manual addendum:** 2026-05-24 — Wave 0 (T-059) additions (see bottom of each map for the new nodes; full regeneration deferred)

## What Is This?

This directory contains AI-queryable maps of the A64 Core Platform codebase.
Instead of reading raw source files, agents read these maps to understand
architecture, dependencies, and relationships.

**Read this file FIRST**, then navigate to the specific map you need.

## Project Overview

A64 Core Platform is an agricultural management system with:
- **Backend:** FastAPI (Python 3.11+), MongoDB 7.0, Redis 7
- **Frontend:** React 18 + TypeScript, Vite, styled-components, TanStack Query
- **Infrastructure:** Docker Compose, Nginx, 7 business modules
- **AI:** Google Vertex AI (Gemini 2.5-flash) for Farm AI chat

**Key ports:** API=8000 (nginx→80), Frontend=5173, MongoDB=27017, Redis=6379

## Available Maps

| Map | Contents | Status |
|-----|----------|--------|
| [api-map.md](api-map.md) | All REST API endpoints, routes, auth requirements, response types | ✅ |
| [database-map.md](database-map.md) | MongoDB collections, document schemas, inter-collection relationships | ✅ |
| [module-map.md](module-map.md) | Backend modules (farm, hr, crm, sales, logistics, marketing, ai_analytics), dependencies | ✅ |
| [frontend-map.md](frontend-map.md) | React components, custom hooks, Zustand stores, TypeScript types, routing | ✅ |
| [service-map.md](service-map.md) | Service layer classes, business logic, dependency injection graph | ✅ |

## Module Directory

| Module | Location | Purpose |
|--------|----------|---------|
| `farm_manager` | `src/modules/farm_manager/` | Farm blocks, harvests, plant data, analytics |
| `hr` | `src/modules/hr/` | Employee management, Emirates ID, payroll |
| `crm` | `src/modules/crm/` | Customer relationships, contacts, leads |
| `sales` | `src/modules/sales/` | Sales orders, invoices, products |
| `logistics` | `src/modules/logistics/` | Delivery, inventory, warehousing |
| `marketing` | `src/modules/marketing/` | Campaigns, analytics |
| `ai_analytics` | `src/modules/ai_analytics/` | Vertex AI integration, Farm AI chat |

## Key File Locations

| File | Purpose |
|------|---------|
| `src/main.py` | FastAPI app entry point, router registration |
| `src/config/settings.py` | All environment variables (Pydantic BaseSettings) |
| `src/core/cache/redis_cache.py` | Redis connection pool |
| `src/middleware/rate_limit.py` | Rate limiting middleware |
| `src/api/v1/auth.py` | Authentication endpoints |
| `frontend/user-portal/src/App.tsx` | React app root, routing |
| `frontend/user-portal/src/services/` | Axios API service calls |
| `frontend/user-portal/src/stores/` | Zustand state stores |
| `docker-compose.yml` | Service definitions |
| `nginx/nginx.dev.conf` | Dev reverse proxy config |

## API Base URLs

- **Dev:** `http://localhost/api/v1`
- **Auth:** `POST /api/v1/auth/login`
- **Farms:** `GET /api/v1/farm/farms`
- **Dashboard:** `GET /api/v1/farm/dashboard`

## Common Questions

**Q: What services does the farm dashboard use?**
→ See [service-map.md](service-map.md) → `farm_manager` section

**Q: What MongoDB collections exist?**
→ See [database-map.md](database-map.md)

**Q: What React components render the farm blocks?**
→ See [frontend-map.md](frontend-map.md) → Components section

**Q: How does the API authenticate requests?**
→ See [api-map.md](api-map.md) → Core API section

## Regenerating Maps

```bash
# After code changes, re-seed affected tasks:
bash scripts/codebase_mapper/rerun.sh

# Regenerate all Markdown maps from MongoDB data:
python scripts/codebase_mapper/map_generator.py all

# Check mapping progress:
python scripts/codebase_mapper/task_manager.py stats
```

---

## Wave 0 Manual Addendum — 2026-05-24

Full regeneration was blocked in this environment (mapper script
hard-codes `mongodb://localhost:27017` and the mapping-agent flow
requires sub-agent dispatch). The following Wave 0 (T-059) additions
have been manually recorded in the relevant map files — search each
file for **"Wave 0"** to find the new entries:

**Backend additions**
- New endpoint `GET /api/v1/system/capabilities`
  (`src/api/v1/system.py`) — per-tenant module capability discovery.
- New endpoint `PATCH /api/v1/organizations/{org_id}/modules`
  (`src/api/v1/organizations.py`) — super_admin toggle for
  `modules.financeEnabled`.
- New module `finance_bridge.reachability` — Redis-cached health-ping
  against finance service.
- New module `finance_bridge.tenant_flag` — Redis-cached per-tenant
  `modules.financeEnabled` lookup.
- Updated `finance_bridge.outbox_writer` — per-tenant gate skips
  events when tenant has finance disabled.
- New `GET /api/v1/system/health` on finance service
  (`services/finance/src/finance/api/v1/health.py`).

**Database additions**
- `organizations.modules.financeEnabled` (bool, default `true`) —
  see `database-map.md`.
- One-shot migration `scripts/migrations/wave0_add_finance_flag.py`.

**Frontend additions** (see `frontend-map.md`)
- Hook `useCapabilities` (+ derivatives `useFinanceEnabled`,
  `useFinanceUnreachable`).
- Service `systemService` (`getCapabilities`,
  `updateOrganizationModules`).
- Types `Capabilities`, `ModuleCapabilities`,
  `FinanceModuleCapability`.
- Components `FinanceGate`, `FinanceUnreachableBanner`,
  `ModulesSettingsCard`.
- Modified pages: `App.tsx` (route gating), `MainLayout.tsx`
  (sidebar gating), `PurchaseRequestFormPage`,
  `PurchaseOrderFormPage`, `GoodsReceiptFormPage`,
  `APInvoiceFormPage`, `Settings.tsx`.

**Approx delta:** +3 endpoints, +2 backend modules, +6 frontend
files, +1 schema field. Run the mapper rerun after the mongo-URL
configuration is fixed for a full graph refresh.

---

## Wave 2 Manual Addendum — 2026-05-24 (REGEN OWED)

Full regeneration deferred (same MongoDB-URL blocker as Wave 0).
The following Wave 2 additions from the 2026-05-24 session have NOT yet
been reflected in the map files and require a regen run
(`bash scripts/codebase_mapper/rerun.sh`) from an environment with
`mongodb://localhost:27017` accessible:

**New backend endpoints (finance service)**
- `POST /api/v1/finance/journal-entries` — manual JE creation
  (`services/finance/src/finance/api/v1/journal_entries.py`).
  Roles: `finance_admin`, `super_admin`. New schemas:
  `ManualJECreateRequest`, `ManualJELineRequest`, `ManualJECreateResponse`,
  `ManualJEMeta`.
- `GET /api/v1/finance/reports/export/{statement}` — report export
  (PDF + Excel streaming download)
  (`services/finance/src/finance/api/v1/export.py`; Jinja2 templates
  under `src/finance/api/v1/templates/`). New system deps: Pango/Cairo
  (~100 MB image delta). New pyproject deps: openpyxl, weasyprint, jinja2.

**Modified backend endpoints (finance service)**
- `GET /api/v1/finance/reports/balance-sheet`,
  `GET /api/v1/finance/reports/income-statement`,
  `GET /api/v1/finance/reports/cash-flow` — `cost_center_id` param
  changed from `Optional[str]` to `Optional[List[str]]` (multi-CC filter
  via `.in_()`). Backward-compatible for single-value callers.
- `PUT /api/v1/finance/companies/{company_code}/posting-setup` — new
  balance guard (HTTP 409 if old clearing account has non-zero posted
  balance) and semantic type guard (HTTP 422 if account drawer/type
  does not match field requirements). Both guards cover all 10
  clearing-account fields.

**New frontend route**
- `/finance/balance-sheet` — `<BalanceSheetPage>` behind `<FinanceGate>`
  (`frontend/user-portal/src/pages/finance/BalanceSheetPage.tsx`).
  Service: `getBalanceSheet` in `financeReportsService.ts`.
  Hook: `useBalanceSheet` in `useFinanceReports.ts`.
  Sidebar entry added to `MainLayout.tsx`.
  Route added to `App.tsx`.

**New frontend component**
- `<FinanceReportPage>` shell under
  `frontend/user-portal/src/components/finance/FinanceReportPage/`
  (`FinanceReportPage.tsx`, `types.ts`, `index.ts`). Render-prop API
  `{ filters, display, openDrillDown }`. Multi-select cost centres;
  Compare-to dropdown (None / Previous / YoY / Custom).

---
*Maps generated by the Codebase Mapper pipeline. Do not edit manually.*