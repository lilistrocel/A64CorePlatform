# Codebase Mapper — Node ID Conventions

> **Read this BEFORE any mapping work**. The conventions below are the
> de-facto contract enforced by the existing knowledge graph. New mapping
> agents that invent their own conventions will produce orphan edges
> across task boundaries, requiring cleanup passes that delete real work.
>
> Each `batch_*.json` file references this doc in its `metadata.node_id_convention_doc`
> field; the mapping agent must follow what is written here.

---

## Why one convention can't fit everything

The graph spans two distinct ecosystems with different idiomatic styles:

- **Backend** (Python — FastAPI, modules under `src/modules/<module>/`,
  shared infra under `src/core/`) uses **dot-notation** (`module.layer.thing`).
- **Frontend** (TypeScript — React, hooks, services, stores under
  `frontend/user-portal/src/`) uses **double-colon notation** (`kind::name`).

Both styles work, but mixing them within one layer creates orphan edges.
The cross-domain mapping tasks (`map_api_frontend_links`) must understand
both and emit edges that target nodes in each domain's native style.

---

## Backend (dot-notation)

### General form

```
<module>.<layer>.<thing>
```

Where:
- `<module>` is the directory name under `src/modules/` (e.g., `sales`,
  `crm`, `hr`, `purchasing`, `farm_manager`, `marketing`, `logistics`,
  `ai_analytics`) OR `core` for shared infrastructure.
- `<layer>` is one of: `api`, `service`, `model`, `middleware`,
  `repository`, `infrastructure`, `documents` (for `core.documents.*`),
  `cache`, etc.
- `<thing>` is the file or class name. **Granularity differs per layer**
  — see below.

### API endpoints

**Two granularities exist in the graph; pick the one matching your task scope.**

**File-level** (preferred for new work — used by `crm`, `hr`, `logistics`,
`marketing`, `sales`, `purchasing`, `ai_analytics`):

```
sales.api.ar_invoices         → "CRUD /sales/ar-invoices"
crm.api.customers             → "CRUD /crm/customers"
purchasing.api.purchase_orders → "CRUD /purchasing/po"
```

- One node per router file.
- `name` field uses CRUD-style label.
- `description` lists key endpoints or behaviour.

**Per-endpoint** (legacy, only `farm_manager`):

```
farm_manager.api.farms.create_farm  → "POST /farms"
farm_manager.api.farms.get_farms    → "GET /farms"
farm_manager.api.farms.get_farm     → "GET /farms/{farm_id}"
```

- One node per endpoint function.
- Use this style ONLY if the task explicitly extends `farm_manager`.
  All other modules should use file-level granularity.

### Services

**File-level snake_case** (current sales Wave 3 + most new code):

```
sales.service.quote_service
sales.service.ar_invoice_service
sales.service.customer_receipt_service
```

- One node per service file; `name` field uses the conceptual class
  name in PascalCase (e.g., `name: "QuoteService"`).
- Use this when services are module-level async functions rather than
  classes.

**Class-level PascalCase** (legacy farm_manager):

```
farm_manager.service.FarmService
farm_manager.service.BlockService
```

- One node per service class.
- Use this only when the file contains exactly one service class and
  it's the canonical pattern in the module.

**Default for new modules: file-level snake_case.** It's used by
crm/hr/sales/purchasing and survives refactors better.

### Models

**File-level snake_case** (sales Wave 3 + most modules):

```
sales.model.ar_invoices       → "AR Invoice models"
sales.model.return_requests   → "Return Request models"
crm.model.customers
```

- One node per model file, grouping all related Pydantic models inside.
- `exports` lists each Pydantic class in the file.

**Per-class PascalCase** (legacy farm_manager):

```
farm_manager.model.Farm
farm_manager.model.Block
```

### Core / shared infrastructure

**Lowercase dotted path matching the file** (NOT PascalCase, even though
each file may export a class):

```
core.documents.doc_number       → "next_doc_number"
core.documents.document_links   → "DocumentLinkRef"
core.documents.open_quantity    → "LineQuantityState"
core.documents.bp_ref           → "BPReferenceMixin"
core.documents.journal_memo     → "JournalMemoMixin"
core.documents.document_status  → "DocumentStatus"
core.cache.redis_cache          → "RedisCache"
core.cache.decorators
core.middleware.auth
core.middleware.permissions
```

- One node per file. `name` field carries the primary exported symbol.

### Middleware

```
core.middleware.auth
sales.middleware.auth         (module-specific middleware)
```

---

## Frontend (double-colon notation)

### General form

```
<kind>::<name>
```

Where `<kind>` is one of: `component`, `hook`, `service`, `store`,
`type`, `file`.

### Components

```
component::ProtectedRoute
component::SalesActionTiles
component::AuditHistoryModal
component::MainLayout
```

- `<name>` is the PascalCase component name.

### Hooks

```
hook::useAdminUsers
hook::useAuditLog
hook::useBalanceSheet
hook::useFiscalPeriods
```

- `<name>` is the camelCase hook name including the `use` prefix.

### Services (axios wrappers)

```
service::salesService
service::purchasingApi
service::apiClient
service::financeReportsService
```

- `<name>` is the camelCase exported name from the file. (Note the
  inconsistency: some end in `Service`, some end in `Api` — this matches
  the actual file naming.)

### Stores (Zustand)

```
store::useAuthStore
store::useDivisionStore
store::useFarmingYearStore
```

- `<name>` is the camelCase store hook name including the `use` prefix.

### Types

**File-level** (preferred — one node per `.ts` file grouping its types):

```
type::sales
type::aiHub
type::widget
```

- `<name>` is the camelCase filename without extension.

### Files (root entry points only)

```
file::App
file::main
```

- Reserve for top-level entry files. Don't use `file::` for every TSX
  file — use `component::` instead.

---

## Integration / cross-cutting

### MongoDB collections

```
collection_users
collection_refresh_tokens
collection_sales_orders_v2
collection_ar_invoices_v2
collection_return_requests_v2
```

- Prefix `collection_` plus snake_case collection name as it appears in
  MongoDB.

### Environment variables and deployment config

```
env_SECRET_KEY
env_PUBLIC_BASE_URL
env_FINANCE_OUTBOX_ENABLED
```

- Prefix `env_` plus the variable name **verbatim**, in its own casing
  (`SCREAMING_SNAKE_CASE`). One node per variable *name*, not per
  declaration site — `MONGODB_URL` is declared in `src/config/settings.py`,
  `.env.example` and three compose files, and is still one node. Set
  `file_path`/`line_number` to the authoritative consumer (the `Settings`
  field when one exists, otherwise the compose service or `.env.example`
  line) and mention the other sites in the description.
- `node_type: "config"`, `layer: "config"`. `module` is the consuming
  module (`core`, `farm_manager`, `ai_assistant`, `finance_bridge`,
  `frontend`) or `infra` for pure deployment plumbing (host ports,
  backup, tunnel identity, compose-internal wiring).
- **Never record a secret's value** — not a key, password, token, or a
  `${VAR:-default}` fallback that contains one. Record the name, the
  consumer, whether it is required, and how it fails when missing.

### Compose services and overlays

```
compose_api
compose_mongodb
compose_finance_consumer
compose_overlay_prod
```

- Prefix `compose_` plus the service key as it appears under `services:`
  in the compose file, with `-` normalised to `_`
  (`user-portal` → `compose_user_portal`).
- Overlay *files* that only override other services get
  `compose_overlay_<name>` (`docker-compose.prod.yml` →
  `compose_overlay_prod`).
- `node_type: "config"`, `layer: "config"`, `module: "infra"`.
- Introduced by `map_config_env` (2026-08-21); there was no prior
  convention for compose services in the graph.

### Config edge direction

The graph's de-facto direction — set by `map_core_middleware` and followed
by `map_config_env` — is **consumer → config**, not the reverse:

```
core.middleware.rate_limit  --[uses]-->    env_RATE_LIMIT_GUEST
core.service.deployment_settings_service --[uses]--> env_CF_ACCESS_AUD
compose_api                 --[exports]--> env_GOOGLE_CLOUD_PROJECT
compose_api                 --[depends_on]--> compose_mongodb
```

`uses` for code that reads a variable, `exports` for a compose service
whose `environment:` block injects it into a container, `depends_on` for
compose `depends_on:` relationships.

### Other DB models (MySQL / SQLAlchemy)

Use the dot-notation backend convention:

```
finance.model.JournalEntry
finance.model.CompanyPostingSetup
```

---

## Cross-task edges

When a mapping task emits an edge whose `source_id` or `target_id` is in
**another task's namespace**, both endpoints must use that namespace's
native convention.

### Backend → backend

Use dot-notation on both sides:

```
sales.service.ar_invoice_service  --[depends_on]--> finance.api.customer_ext
sales.service.delivery_service    --[stores_in]--> finance_bridge.outbox_writer
```

### Frontend → backend (calls API)

Source is frontend (`::`), target is backend (`.`):

```
service::salesService  --[calls]--> sales.api.ar_invoices
service::auditLogService  --[calls]--> finance.api.audit_log
```

### Frontend → frontend

Use `::` on both sides:

```
component::AuditHistoryModal  --[uses]--> hook::useAdminUsers
component::SalesActionTiles   --[renders_in]--> component::MainLayout
hook::useFiscalPeriods        --[uses]--> service::fiscalPeriodsService
```

### Backend → frontend

Don't emit these. Backend code doesn't reference frontend artefacts;
the dependency direction is always frontend → backend.

---

## Edge types (use these exact strings)

The graph uses these `edge_type` values. Don't invent new ones unless
you also document them:

- `calls` — A invokes a function/method/endpoint in B.
- `uses` — A reads or composes B (most generic; prefer specific types
  when applicable).
- `imports` — A imports a symbol from B (same module, often).
- `depends_on` — A would fail to operate without B (cross-module).
- `reads_from` — A reads from a data source B (typically DB).
- `stores_in` — A writes to a data store B (DB, outbox, cache).
- `creates` — A constructs instances of B.
- `extends` — A is a subclass of B.
- `renders` — A renders B (frontend components).
- `reexports` — A re-exports symbols from B (TypeScript barrel files).
- `exports` — A exposes B as part of its public surface.

---

## Reserved namespaces

These prefixes are claimed by specific mapping tasks. Don't emit nodes
in them unless your task owns them:

| Prefix                              | Owning task                  |
|-------------------------------------|------------------------------|
| `sales.*`                           | `map_sales_module`           |
| `purchasing.*`                      | `map_purchasing_module`      |
| `crm.*`                             | `map_crm_module`             |
| `hr.*`                              | `map_hr_module`              |
| `farm_manager.*`                    | `map_farm_*` (multiple)      |
| `logistics.*`                       | `map_logistics_module`       |
| `marketing.*`                       | `map_marketing_module`       |
| `ai_analytics.*`                    | `map_ai_analytics_module`    |
| `ai_assistant.*`                    | `map_ai_assistant_module`    |
| `attachments.*`                     | `map_attachments_module`     |
| `mushroom_manager.*`                | `map_mushroom_module`        |
| `protocols.*`                       | `map_protocols_module`       |
| `genetics.*`                        | `map_genetics_module`        |
| `core.*`                            | `map_core_services`          |
| `core.api.*`                        | `map_core_api`               |
| `finance.*`                         | `map_finance_module`         |
| `finance_bridge.*`                  | `map_core_services`          |
| `component::*`                      | `map_frontend_components`    |
| `hook::*`, `service::*`, `store::*` | `map_frontend_hooks_services`|
| `type::*`                           | `map_frontend_types`         |
| `file::*`                           | `map_frontend_components`    |
| `collection_*`                      | see note below               |
| `env_*`, `compose_*`                | `map_config_env`             |

### `collection_*` is owned per-module, not centrally

The row above used to read `map_database_collections`, which is not what the
graph does. Every module task that has collections emits its own
`collection_<name>` `db_model` nodes carrying its own `module` field —
`map_hr_module` owns `collection_employees`, `map_genetics_module` owns
`collection_genetic_lines`, and so on. `map_database_collections` is the
sweep-up task for collections that belong to no single module. Emit your
module's collections from your module's task; do not wait for
`map_database_collections` to notice them (it did not notice six whole
modules).

### `module` field: backend uses the directory name

`module` is the directory under `src/modules/`, so backend mushroom nodes are
`module: "mushroom_manager"`. The pre-existing React nodes for the same feature
use the short name (`module: "mushroom"`), exactly as `farm_manager` (backend)
and `farm` (frontend) already coexist. Keep that split; do not retarget one to
the other, and expect two adjacent sections in `module-map.md`.

### The two finances

`finance.*` covers `src/modules/finance/` — the ops-side operational P&L module
mounted at `/api/v1/operations`, owned by `map_finance_module`. The statutory
finance microservice under `services/finance/` (MySQL GL, `/api/v1/finance/*`,
`finance.model.JournalEntry` in the examples above) is a **separate deployment
artefact with no mapping task at all and zero nodes in the graph**. If you map
it, disambiguate by `file_path`, not by node_id prefix.

When emitting cross-namespace edges, target the consumer's expected
node_id — if you create an edge pointing at a node that doesn't exist
yet, the markdown generator will tolerate the dangle and Mongo doesn't
enforce FK constraints. But pick the right convention so the sibling
task's emitted nodes will match.

---

## When this doc is wrong

This is descriptive of the de-facto graph as of 2026-05-30. If you
discover a divergence:

1. Don't silently invent your own convention — pick the closest match
   here.
2. Flag the divergence in your task report.
3. After the run, update this doc and update the affected
   `batch_*.json` `metadata.node_id_convention_doc` field if the format
   has changed.

Avoid letting the conventions drift. The cleanup tax is real — the
2026-05-30 Wave 3 regen run had to delete 100 orphan edges across two
tasks that diverged silently.
