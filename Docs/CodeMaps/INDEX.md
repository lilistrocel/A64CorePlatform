# A64 Core Platform — Codebase Knowledge Graph

> **Generated:** 2026-08-21 15:36 UTC  
> **Graph:** 1214 nodes · 2578 edges  
> **Tasks:** 29/33 mapping tasks completed

## What Is This?

This directory contains AI-queryable maps of the A64 Core Platform codebase.
Instead of reading raw source files, agents read these maps to understand
architecture, dependencies, and relationships.

**Read this file FIRST**, then navigate to the specific map you need.

## Project Overview

A64 Core Platform is an agricultural management system with:
- **Backend:** FastAPI (Python 3.11+), MongoDB 7.0, Redis 7
- **Frontend:** React 18 + TypeScript, Vite, styled-components, TanStack Query
- **Infrastructure:** Docker Compose, Nginx, business modules (see Module Directory below — hard-coding a count here only goes stale)
- **AI:** Google Vertex AI (Gemini 2.5-flash) for Farm AI chat

**Key ports:** API=8000 (nginx→80), Frontend=5173, MongoDB=27017, Redis=6379

## Available Maps

| Map | Contents | Status |
|-----|----------|--------|
| [api-map.md](api-map.md) | All REST API endpoints, routes, auth requirements, response types | ✅ |
| [database-map.md](database-map.md) | MongoDB collections, document schemas, inter-collection relationships | ✅ |
| [module-map.md](module-map.md) | Every backend module under `src/modules/` and its nodes by layer, plus cross-module dependencies (see the Module Directory below for the authoritative list) | ✅ |
| [frontend-map.md](frontend-map.md) | React components, custom hooks, Zustand stores, TypeScript types, routing | ✅ |
| [service-map.md](service-map.md) | Service layer classes, business logic, dependency injection graph | ✅ |

## Module Directory

| Module | Location | Purpose |
|--------|----------|---------|
| `farm_manager` | `src/modules/farm_manager/` | Farm blocks, harvests, plant data, analytics (industry: vegetable_fruits) |
| `mushroom_manager` | `src/modules/mushroom_manager/` | Facilities, growing rooms, substrate, flush harvests, strain growing-profiles (industry: mushroom) |
| `genetics` | `src/modules/genetics/` | Genetics Repo — lines, accessions with G/F generations, propagation events, medium recipes, observations (industry: all, shared) |
| `hr` | `src/modules/hr/` | Employee management, Emirates ID, payroll |
| `crm` | `src/modules/crm/` | Customer relationships, contacts, leads |
| `sales` | `src/modules/sales/` | Sales orders, invoices, products |
| `purchasing` | `src/modules/purchasing/` | PR→PO→GR→AP chain, vendors, purchase items, payment terms, approvals |
| `finance` | `src/modules/finance/` | Operational P&L analytics from MongoDB, mounted at `/api/v1/operations`. NOT the statutory GL — that is the MySQL microservice at `services/finance/` (`/api/v1/finance/*`, profile-gated), which has no mapping task and no nodes in this graph. |
| `logistics` | `src/modules/logistics/` | Delivery, inventory, warehousing |
| `marketing` | `src/modules/marketing/` | Campaigns, analytics |
| `ai_analytics` | `src/modules/ai_analytics/` | Vertex AI integration, Farm AI chat |
| `ai_assistant` | `src/modules/ai_assistant/` | Claude assistant: conversations, tool executor, cost tracking. Not a plugin — mounted from `src/api/routes.py` at `/api/v1/ai` |
| `attachments` | `src/modules/attachments/` | Document attachments, pluggable storage, range requests. Not a plugin — mounted from `src/api/routes.py` at `/api/v1/attachments` |
| `protocols` | `src/modules/protocols/` | Versioned SOPs, approve/retire lifecycle, scope tags, version pinning |
| `finance_bridge` | `src/modules/finance_bridge/` | Outbox writer bridging ops events to the finance microservice |

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
*Maps generated by the Codebase Mapper pipeline. Do not edit manually.*