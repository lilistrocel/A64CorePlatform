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
- MongoDB MCP is broken (connection doesn't persist) — use `mongosh` via Bash as workaround
- Pattern: `mongosh --eval "db.collection.find()" mongodb://localhost:27017/a64core_db --quiet`

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

## Documentation & CodeMaps

### Key Documentation Paths
- **CodeMaps (read FIRST):** `Docs/CodeMaps/INDEX.md` — 446 nodes, 285 edges across 7 modules
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
- Local: `http://localhost/api/v1` | Production: `https://a64core.com/api/v1` | Health: `http://localhost/api/health`

**Critical gotchas:**
- Login is `POST /api/v1/auth/login` (NOT `/users/login`)
- Farm endpoints are `/api/v1/farm/*` (NOT `/farm-management/*` — no longer a separate service)
- Default admin: `admin@a64platform.com` / `SuperAdmin123!`

## Remote Server & Git

### Local-First Rule
All code changes happen locally first. Never edit code on remote servers. Git is the single source of truth.

**Workflow:** Edit locally -> Commit -> Push -> SSH to server -> Pull -> Rebuild Docker -> Test

### Production Server
- **Domain:** `a64core.com` (NOT a64platform.com)
- **IP:** `51.112.224.227`
- **SSH:** `ssh -i a64-platform-key.pem ubuntu@51.112.224.227`
- **Dynamic IP:** `bash update-ssh-access.sh` (updates AWS Security Group)

### Deploy Commands
```bash
ssh -i a64-platform-key.pem ubuntu@51.112.224.227
cd ~/A64CorePlatform && git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml build <service>
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d <service>
```

### Server-Only Files (never commit)
`.env.production`, `.env.local`, SSL certificates, server-specific config — must be in `.gitignore`.
