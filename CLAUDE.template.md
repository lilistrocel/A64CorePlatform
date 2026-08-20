# A64 Core Platform - Development Guide

## Core Principles

- **KISS** - Keep It Simple, Stupid
- **YAGNI** - You Aren't Gonna Need It
- **Cross-Platform** - Code MUST work on Windows AND Linux
- **Never Assume** - When in doubt, ask for clarification
- **Delegate to Specialists** - Use specialized agents for complex tasks

## Critical Rules

### Before ANY Task
1. Read `Docs/CodeMaps/INDEX.md` + relevant map for your task area
2. Read relevant docs in `Docs/1-Main-Documentation/`
3. Read existing code to understand current implementation
4. If requirements are ambiguous, security is involved, or breaking changes might occur: **STOP and ASK**

### Quality Over Speed
- **Never rush fixes** — understand root cause before acting
- **Never skip errors during testing** — stop, investigate, consult user before continuing
- **Never make assumptions** — if unsure, ask
- **Never implement quick hacks** — no try-catch to hide errors, no making required fields optional without migration, no disabling checks "temporarily"
- **Fix root causes**, not symptoms. Ask user if a fix seems like a workaround.

### Agent Delegation (MANDATORY)

**If a specialized agent exists for a task, you MUST delegate. Handle directly ONLY for simple reads, lookups, and trivial edits (<10 lines).**

| Task | Agent | Subagent Type |
|------|-------|---------------|
| Backend/FastAPI/Python | `backend-dev-expert` | `backend-dev-expert` |
| Frontend/React/TypeScript | `frontend-dev-expert` | `frontend-dev-expert` |
| API design & endpoints | `api-developer` | `api-developer` |
| Database schema/indexing | `database-schema-architect` | `database-schema-architect` |
| Backend/API testing | `testing-backend-specialist` | `testing-backend-specialist` |
| Frontend/UI testing | `frontend-testing-playwright` | `frontend-testing-playwright` |
| Docs, commits, versioning | `change-guardian` | `change-guardian` |

**Agent instruction template:**
```
Task: [description]

CRITICAL: Read Docs/Backlog/BACKLOG.md — claim task (set Active). When done, move to ARCHIVE.md.
CRITICAL: Read Docs/CodeMaps/INDEX.md + relevant map for your task area.

MCP Requirements:
- Use Playwright MCP for all frontend/API testing (NOT curl/wget)
- Use mongosh via Bash for DB verification (MongoDB MCP is broken)
- Test through UI with Playwright before declaring anything "working"

Post-Implementation:
- Flag if CodeMaps need regeneration (structural changes made)
- Update Docs/Backlog/BACKLOG.md
```

**Multi-agent workflow:** CodeMaps -> Backlog -> Implementation Agent -> Testing Agent -> Change Guardian -> Update Backlog -> Regenerate CodeMaps (if structural changes)

## MCP & Testing Requirements

### Playwright MCP (MANDATORY for all testing)
- Use for frontend UI testing, API verification, auth flows, CORS checks
- **Never** use curl, wget, or manual browser testing
- Save large outputs to file (`filename` parameter), then read relevant sections
- Minimize snapshots: take ONE to get refs, reuse refs, re-snapshot only on significant page changes
- Use `browser_evaluate` for targeted checks instead of full snapshots
- Navigate directly via URL, don't click through pages

### MongoDB Verification
- MongoDB MCP is broken (connection doesn't persist), on every deployment — use `mongosh` via Bash as workaround
- Pattern: `docker exec <prefix>-mongodb-1 mongosh --quiet mongodb://localhost:27017/a64core_db --eval "db.collection.find()"` — find `<prefix>` via `docker ps` (see "Server & Git" below); reference deployment example: `docker exec a64coreplatform-mongodb-1 mongosh --quiet mongodb://localhost:27017/a64core_db --eval "db.collection.find()"`
- `mongosh` is NOT on the host — it only exists inside the mongo container

### UI Testing is Ultimate Truth
- **API working + UI broken = Feature is BROKEN**
- Never declare a feature "working" based only on API tests
- Testing sequence: Unit -> API -> UI (Playwright) -> E2E (Playwright)

## Work Tracking

### Backlog System (`Docs/Backlog/`)

| File | Purpose |
|------|---------|
| `BACKLOG.md` | Active, ready, and blocked tasks with dependencies |
| `ARCHIVE.md` | Completed tasks history |

**Rules:** Read backlog before implementation. Claim tasks as Active. Respect blockers. Move completed tasks to ARCHIVE.md. Create entry if your work isn't tracked.

**Lifecycle:** Ready -> Active -> Done (moved to ARCHIVE.md). Blocked if dependency discovered.

### DevLog Journals (`Docs/3-DevLog/`)
When user requests "keep journal" or "create journal", create a dated journal using the template at `Docs/3-DevLog/TEMPLATE.md`.

## Project Overview

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite, styled-components, Zustand, TanStack Query, Axios, React Router v6, Recharts, MapLibre GL, React Hook Form + Zod (port 5173) |
| Backend | Python 3.11+ / FastAPI, Uvicorn async (port 8000) |
| Database | MongoDB 7.0 (primary), MySQL 8.0 (secondary) |
| Cache | Redis 7 (caching, rate limiting, sessions) |
| AI | Google Vertex AI / Gemini 2.5-flash |
| Auth | passlib+bcrypt, python-jose HS256 JWT |
| Infra | Docker Compose, Nginx 1.25 (ports 80/443), Docker Registry (5000), Adminer (8080) |
| API | RESTful JSON at `/api/v1`, Swagger/ReDoc auto-generated |

**Prerequisites:** Docker 20.10+, Python 3.11+, Node.js 18+, MongoDB/Redis/MySQL via Docker, Vertex AI credentials, WeatherBit API key, 25+ env vars.

## Modules / Deployment Modes (Wave 0)

A64 ships in two deployment shapes; same git artifacts, different `docker compose` invocations:

- **Ops-only:** `docker compose -f docker-compose.yml up -d` — mongo, redis, api, nginx, user-portal. Full PR→PO→GR→AP works; tax codes / cost centres become free-text.
- **Full stack:** add `-f docker-compose.finance.yml --profile finance` to start mysql, finance, finance_consumer. Run `python scripts/migrations/wave0_add_finance_flag.py` after first start.

The per-tenant `organizations.modules.financeEnabled` flag hides the Finance sidebar/routes and gates `OutboxWriter.publish()` so events stop queuing. Toggle via **Settings → Tenant Modules** (super_admin only, audit-logged) or `PATCH /api/v1/organizations/{orgId}/modules`. See `Docs/1-Main-Documentation/Deployment-Modes.md`.

**CI guard:** `scripts/ci/check_finance_imports.sh` blocks `from services.finance` imports in `src/` — the ops backend must stay decoupled.

## Documentation & CodeMaps

### Key Documentation Paths
- **CodeMaps (read FIRST):** `Docs/CodeMaps/INDEX.md` — the graph size is stated in
  that file's header, which is regenerated with the maps; don't duplicate the count
  here, it only goes stale (it read "446 nodes, 285 edges" while the graph held 812/995)
- **Main Docs:** `Docs/1-Main-Documentation/` (System-Architecture, API-Structure, User-Structure, Versioning)
- **Working Progress:** `Docs/2-Working-Progress/`
- **DevLog:** `Docs/3-DevLog/`

### CodeMap Lookup Table

| Question | Map File |
|----------|----------|
| API endpoints | `Docs/CodeMaps/api-map.md` |
| MongoDB collections | `Docs/CodeMaps/database-map.md` |
| Backend modules | `Docs/CodeMaps/module-map.md` |
| React components/hooks | `Docs/CodeMaps/frontend-map.md` |
| Service dependencies | `Docs/CodeMaps/service-map.md` |

### Regenerating CodeMaps
Required after structural changes (new/removed endpoints, services, components, collections, modules). NOT needed for bug fixes, logic changes, or style updates.

```bash
bash scripts/codebase_mapper/rerun.sh                    # Incremental
python3 scripts/codebase_mapper/map_generator.py all     # Regenerate maps
python3 scripts/codebase_mapper/task_manager.py stats    # Verify
```

## API Quick Reference

**Full endpoint listing:** See `Docs/CodeMaps/api-map.md`

**Base URLs:**
- Local: `http://localhost/api/v1` | Health: `http://localhost/api/health` | Live: this deployment's own `PUBLIC_BASE_URL` + `/api/v1` — see `Docs/1-Main-Documentation/Deployment-Identity.md` (reference deployment example: `https://dev.a20core.com/api/v1`, reached via Cloudflare on the `noobai` box, not necessarily "this machine")

**Critical gotchas:**
- Login is `POST /api/v1/auth/login` (NOT `/users/login`)
- Farm endpoints are `/api/v1/farm/*` (NOT `/farm-management/*` — no longer a separate service)
- Default admin: `admin@a64platform.com` / `SuperAdmin123!`

### `response_model` silently strips fields — restart after model changes

FastAPI filters every response through its declared `response_model`. Any field
the *running process* does not know about is **dropped without error**. Two
distinct ways this bites, both of which look like "the data was never saved":

1. **Stale process after adding a field.** Add a field to a Pydantic model,
   `docker cp` the file, and the API keeps serving the old model until it is
   restarted. The field is written to MongoDB correctly and is missing from
   every API response. Verify with `mongosh` before assuming a write failed —
   if the document has it and the response does not, you need a restart:
   `docker restart <prefix>-api-1` — that container has no `--reload`, on any
   deployment (see "Server & Git" below for finding `<prefix>`;
   `a64coreplatform-api-1` on the reference deployment).

2. **Declaring a narrower model than the service returns.** A route declared
   `response_model=PaginatedResponse[Line]` will strip the rollups off a
   `LineWithStats` the service carefully computed. If a service enriches a
   model, the route must declare the enriched type.

Neither raises. The symptom is always a field that is present in the database,
present in the service return value, and absent on the client. This has cost
debugging time twice — check it early when a field "isn't saving".

## Server & Git

### THIS MACHINE (local, untracked — do not sync)

> **This is the tracked TEMPLATE.** Copy it to `CLAUDE.md` on a new machine and
> fill in the table below. `CLAUDE.md` itself is gitignored, because these facts
> differ per box — production server, dev PC, another dev PC — and asserting one
> box's values on another has caused real mistakes. Everything OUTSIDE this
> section is shared knowledge and belongs in this template; keep it in sync.
> Never `git add` `CLAUDE.md`.

| | |
|---|---|
| **Role** | `TODO` — production deployment / dev PC / staging? |
| Hostname | `TODO` — run `hostname` |
| Container prefix | `TODO` — run `docker ps --format '{{.Names}}'`, take what precedes `-api-1` |
| Serves | `TODO` — public URL, and whether anything (e.g. Cloudflare Access) sits in front |

Run `scripts/preflight.sh` to resolve the first three automatically.

#### ⚠ Does this box hold real data?

`TODO` — state it explicitly. A box being a "dev PC" does NOT imply the database
is disposable; an install may carry production-migrated data. If it does, say so
here, name the collections that matter, and treat every write as production:
never `deleteMany`/`updateMany` with an empty `{}` filter, never mutate a record
you did not just create, and take a `mongodump` or have a documented reverse
before any migration. Code is branch-scoped; data is not.

#### Is a checkout here a deployment?

`TODO` — if the containers bind-mount this working tree (`./src` → `/app/src`,
`./frontend/user-portal/src` → Vite), then **changing branch changes what this
box serves**, and uncommitted changes travel across checkouts. Use
`git worktree add` when you need another branch's code without disturbing the
running stack. If this box does not run the stack, say that instead.

### Determine THIS deployment's identity before doing anything below

Every A64 deployment is its own machine, with its own hostname, its own
container name prefix, and its own public URL. Nothing about those values
carries over from one deployment to another — a sibling install on a
different box can (and has) had none of the container names this file used
to assert. Work out the following for the box you're actually on before
running any command in this section:

1. **Hostname** — run `hostname`.
2. **Container name prefix** — run `docker ps --format '{{.Names}}'`. The
   prefix is whatever precedes `-api-1`, `-mongodb-1`, `-user-portal-1`, etc.
   in the actual output. **Do not assume any specific prefix** — infer it
   from `docker ps`, every time, on every box.
3. **Public base URL** — the hostname baked into this deployment's printed
   genetics QR labels (`PUBLIC_BASE_URL` in the API's environment). Getting
   this wrong is not a config fix later — it ships on physical labels. See
   `Docs/1-Main-Documentation/Deployment-Identity.md` before touching it.
4. **Is this box actually the server**, or a dev/staging box that sits behind
   a different tunnel/domain than production?

`scripts/preflight.sh` automates steps 1–3 and prints what the current box
resolved to — run it first on any box you haven't worked on before, rather
than trusting a doc's example values.

Every command below follows the pattern `docker <verb> <prefix>-<service>-1`.
Substitute the prefix you found in step 2 — do not copy the reference
deployment's prefix onto a different box.

**Reference deployment (`noobai`) — a worked example, not a fact about your
machine.** Verified 2026-07-31 for that one box only:

| Host | Reaches | Notes |
|------|---------|-------|
| `dev.a20core.com` | `noobai`, via Cloudflare | serves the app *and* `/api/v1` |
| `a20core.com` / `www.a20core.com` | a different site | marketing/landing, NOT this app |
| ~~`a64core.com`~~ | **dead** — no response | pre-rebrand, decommissioned |
| ~~`51.112.224.227`~~ | **dead** | old AWS box; do NOT try to SSH here |

That reference box: hostname `noobai`, public IP `5.194.221.100`, container
prefix `a64coreplatform-`, stack started with `docker-compose.yml` +
`docker-compose.finance.yml`. If your `hostname` and `docker ps` output don't
match this, only the *patterns* in this section apply to you, not these
concrete values.

**Consequence for any deployment that IS a live instance:** its database
holds REAL data, not disposable seed. Treat every write as production. Never
`deleteMany`/`updateMany` with an empty `{}` filter, and never mutate a
record you did not just create. Confirm liveness before assuming otherwise —
don't assume a box is disposable just because it's unfamiliar.

### Deploying a change
No SSH, no pull step — `src/` is bind-mounted into the api container, so edits
are visible immediately. But **the api container has no `--reload`, on any
deployment**:

```bash
docker restart <prefix>-api-1            # REQUIRED after any Python change
docker restart a64coreplatform-api-1     # reference deployment example
```

Restart *immediately before verifying*, not merely after editing — a stale
process serves old code while the files on disk look correct, which has produced
false "verified" results.

Frontend is Vite with hot reload; no restart needed. If Vite throws an import
error for an export that demonstrably exists, its module graph is stale:
`docker restart <prefix>-user-portal-1` (`a64coreplatform-user-portal-1` on
the reference deployment).

### Verifying the database
MongoDB MCP is broken, on every deployment. `mongosh` is **not installed on
the host** — run it inside the container, using this deployment's prefix:

```bash
docker exec <prefix>-mongodb-1 mongosh --quiet \
  mongodb://localhost:27017/a64core_db --eval 'db.genetic_lines.find({}, {_id:0, code:1})'

# reference deployment example:
docker exec a64coreplatform-mongodb-1 mongosh --quiet \
  mongodb://localhost:27017/a64core_db --eval 'db.genetic_lines.find({}, {_id:0, code:1})'
```

### Running backend tests
`/app/tests` is **not** bind-mounted — copy it in, and note a restart wipes it.
Stale `__pycache__` in the container has caused phantom failures, on any
deployment:

```bash
docker exec <prefix>-api-1 sh -c 'rm -rf /app/tests'
docker cp tests <prefix>-api-1:/app/tests
docker exec <prefix>-api-1 python -m pytest tests/unit/test_genetics -q
```

### Assets and `.gitignore`
`.gitignore` carries a blanket `*.png`. Any image that genuinely belongs in the
repo — a brand mark, an icon shipped to a backend service — needs `git add -f`,
or it will be silently absent from a fresh checkout while the code still runs.

### Server-Only Files (never commit)
`.env`, `.env.production`, `.env.local`, SSL certificates, server-specific
config — must be in `.gitignore`.
