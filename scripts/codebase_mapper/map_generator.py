#!/usr/bin/env python3
"""
Codebase Mapper - Markdown Map Generator
Generates human-readable and AI-queryable Markdown maps from MongoDB knowledge graph.

Usage:
    python scripts/codebase_mapper/map_generator.py all          # Generate all maps
    python scripts/codebase_mapper/map_generator.py api          # Generate api-map.md
    python scripts/codebase_mapper/map_generator.py database     # Generate database-map.md
    python scripts/codebase_mapper/map_generator.py module       # Generate module-map.md
    python scripts/codebase_mapper/map_generator.py frontend     # Generate frontend-map.md
    python scripts/codebase_mapper/map_generator.py service      # Generate service-map.md
    python scripts/codebase_mapper/map_generator.py index        # Generate INDEX.md (master index)
"""

import sys
import argparse
from datetime import datetime
from pathlib import Path
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "a64core_db"
CODEMAPS_DIR = Path("Docs/CodeMaps")


def get_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except ConnectionFailure:
        print("ERROR: Cannot connect to MongoDB at", MONGO_URL)
        sys.exit(1)
    return client, client[DB_NAME]


def ts():
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")


def write_map(filename: str, content: str):
    CODEMAPS_DIR.mkdir(parents=True, exist_ok=True)
    path = CODEMAPS_DIR / filename
    path.write_text(content, encoding="utf-8")
    print(f"  Written: {path}")


def get_nodes_by_layer(db, layer: str):
    return list(db.mapper_nodes.find({"layer": layer}, {"_id": 0}).sort("name", 1))


def get_nodes_by_type(db, node_type: str):
    return list(db.mapper_nodes.find({"node_type": node_type}, {"_id": 0}).sort("name", 1))


def get_edges_by_type(db, edge_type: str):
    return list(db.mapper_edges.find({"edge_type": edge_type}, {"_id": 0}))


def get_edges_for_node(db, node_id: str):
    return list(db.mapper_edges.find(
        {"$or": [{"source_id": node_id}, {"target_id": node_id}]},
        {"_id": 0}
    ))


def format_node_row(node: dict) -> str:
    name = node.get("name", node.get("node_id", "?"))
    file_path = node.get("file_path", "")
    desc = node.get("description", "")
    exports = ", ".join(node.get("exports", []))
    line = node.get("line_number")
    loc = f"`{file_path}:{line}`" if line else f"`{file_path}`"
    row = f"| `{name}` | {loc} | {desc} |"
    if exports:
        row += f" {exports[:80]} |"
    return row


def gen_api_map(db) -> str:
    endpoints = list(db.mapper_nodes.find({"node_type": "api_endpoint"}, {"_id": 0}).sort([("module", 1), ("name", 1)]))
    routers = list(db.mapper_nodes.find({"layer": "api"}, {"_id": 0}).sort([("module", 1), ("name", 1)]))

    lines = [
        f"# API Map",
        f"",
        f"> Generated: {ts()}  ",
        f"> Source: MongoDB `mapper_nodes` (layer=api, node_type=api_endpoint)",
        f"",
        f"## Quick Reference",
        f"",
        f"This map covers all backend API endpoints, routers, request/response schemas,",
        f"and their connections to frontend service calls.",
        f"",
        f"**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md) | [frontend-map.md](frontend-map.md)",
        f"",
    ]

    # Group by module
    modules = {}
    for ep in endpoints:
        mod = ep.get("module", "core")
        modules.setdefault(mod, []).append(ep)

    if endpoints:
        lines += [f"## API Endpoints ({len(endpoints)} total)", f""]
        for mod, eps in sorted(modules.items()):
            lines += [f"### Module: `{mod}`", f"", f"| Endpoint | File | Description |", f"|----------|------|-------------|"]
            for ep in eps:
                lines.append(format_node_row(ep))
            lines.append("")
    else:
        lines += [f"## API Endpoints", f"", f"*No endpoints mapped yet. Run mapping agents first.*", f""]

    # API routers/files
    if routers:
        lines += [f"## API Router Files ({len(routers)} total)", f"", f"| Name | File | Description |", f"|------|------|-------------|"]
        for r in routers:
            lines.append(format_node_row(r))
        lines.append("")

    # Import edges (API → Service)
    import_edges = list(db.mapper_edges.find(
        {"edge_type": {"$in": ["imports", "calls"]}},
        {"_id": 0}
    ).limit(200))

    if import_edges:
        lines += [f"## API → Service Dependencies", f"", f"| API File | Edge | Service/Target | Context |", f"|----------|------|----------------|---------|"]
        for e in import_edges[:100]:  # cap at 100 for readability
            ctx = e.get("context", "")[:80]
            lines.append(f"| `{e.get('source_id','')}` | {e.get('edge_type','')} | `{e.get('target_id','')}` | {ctx} |")
        lines.append("")

    return "\n".join(lines)


def gen_database_map(db) -> str:
    db_models = list(db.mapper_nodes.find({"node_type": "db_model"}, {"_id": 0}).sort([("module", 1), ("name", 1)]))
    collections = list(db.mapper_nodes.find({"layer": "model"}, {"_id": 0}).sort([("module", 1), ("name", 1)]))

    lines = [
        f"# Database Map",
        f"",
        f"> Generated: {ts()}  ",
        f"> Source: MongoDB `mapper_nodes` (node_type=db_model, layer=model)",
        f"",
        f"## Overview",
        f"",
        f"A64 Core Platform uses MongoDB 7.0 as primary database.",
        f"This map covers all collections, document schemas, and inter-collection relationships.",
        f"",
        f"**Related Maps:** [module-map.md](module-map.md) | [service-map.md](service-map.md)",
        f"",
    ]

    modules = {}
    for m in (db_models + collections):
        mod = m.get("module", "core")
        key = m.get("node_id", "")
        modules.setdefault(mod, {})[key] = m  # deduplicate

    if modules:
        lines += [f"## Collections by Module ({len(db_models)} models)", f""]
        for mod, models_dict in sorted(modules.items()):
            models = list(models_dict.values())
            lines += [f"### Module: `{mod}`", f"", f"| Collection/Model | File | Description |", f"|------------------|------|-------------|"]
            for m in sorted(models, key=lambda x: x.get("name", "")):
                lines.append(format_node_row(m))
            lines.append("")
    else:
        lines += [f"## Collections", f"", f"*No database models mapped yet. Run mapping agents first.*", f""]

    # reads_from / stores_in edges
    db_edges = list(db.mapper_edges.find(
        {"edge_type": {"$in": ["stores_in", "reads_from"]}},
        {"_id": 0}
    ))
    if db_edges:
        lines += [f"## Service → Collection Access", f"", f"| Service | Access | Collection | Context |", f"|---------|--------|------------|---------|"]
        for e in db_edges[:100]:
            ctx = e.get("context", "")[:80]
            lines.append(f"| `{e.get('source_id','')}` | {e.get('edge_type','')} | `{e.get('target_id','')}` | {ctx} |")
        lines.append("")

    return "\n".join(lines)


def gen_module_map(db) -> str:
    all_modules = list(db.mapper_nodes.aggregate([
        {"$group": {"_id": "$module", "count": {"$sum": 1}, "layers": {"$addToSet": "$layer"}}},
        {"$sort": {"_id": 1}}
    ]))

    lines = [
        f"# Module Map",
        f"",
        f"> Generated: {ts()}  ",
        f"> Source: MongoDB `mapper_nodes` (grouped by module)",
        f"",
        f"## Backend Module Architecture",
        f"",
        f"A64 Core Platform is organized into modular business applications.",
        f"Each module contains API, service, and model layers.",
        f"",
        f"**Related Maps:** [api-map.md](api-map.md) | [service-map.md](service-map.md) | [database-map.md](database-map.md)",
        f"",
    ]

    if all_modules:
        lines += [f"## Module Overview", f"", f"| Module | Nodes | Layers Present |", f"|--------|-------|----------------|"]
        for m in all_modules:
            mod = m["_id"] or "(none)"
            layers = ", ".join(sorted(l for l in m["layers"] if l))
            lines.append(f"| `{mod}` | {m['count']} | {layers} |")
        lines.append("")

        # Per-module detail
        lines += [f"## Module Details", f""]
        for m in all_modules:
            mod = m["_id"]
            if not mod:
                continue
            nodes = list(db.mapper_nodes.find({"module": mod}, {"_id": 0}).sort([("layer", 1), ("name", 1)]))
            lines += [f"### `{mod}` ({len(nodes)} nodes)", f"", f"| Type | Name | Layer | File |", f"|------|------|-------|------|"]
            for n in nodes:
                lines.append(f"| {n.get('node_type','')} | `{n.get('name','')}` | {n.get('layer','')} | `{n.get('file_path','')}` |")
            lines.append("")
    else:
        lines += [f"## Modules", f"", f"*No modules mapped yet. Run mapping agents first.*", f""]

    # Dependency edges between modules
    dep_edges = list(db.mapper_edges.find({"edge_type": "depends_on"}, {"_id": 0}))
    if dep_edges:
        lines += [f"## Cross-Module Dependencies", f"", f"| Source Module | Edge | Target Module |", f"|---------------|------|---------------|"]
        for e in dep_edges:
            lines.append(f"| `{e['source_id']}` | {e['edge_type']} | `{e['target_id']}` |")
        lines.append("")

    return "\n".join(lines)


def gen_frontend_map(db) -> str:
    components = list(db.mapper_nodes.find({"node_type": "component"}, {"_id": 0}).sort("name", 1))
    hooks = list(db.mapper_nodes.find({"node_type": "hook"}, {"_id": 0}).sort("name", 1))
    stores = list(db.mapper_nodes.find({"node_type": "store"}, {"_id": 0}).sort("name", 1))
    types = list(db.mapper_nodes.find({"node_type": "type", "layer": "frontend"}, {"_id": 0}).sort("name", 1))

    lines = [
        f"# Frontend Map",
        f"",
        f"> Generated: {ts()}  ",
        f"> Source: MongoDB `mapper_nodes` (node_type=component|hook|store|type, layer=frontend)",
        f"",
        f"## Overview",
        f"",
        f"Frontend: React 18 + TypeScript + Vite. State via Zustand. Server state via TanStack Query.",
        f"Styling with styled-components. Charts with Recharts. Maps with MapLibre GL.",
        f"",
        f"**Related Maps:** [api-map.md](api-map.md) | [module-map.md](module-map.md)",
        f"",
    ]

    # Components
    if components:
        lines += [f"## React Components ({len(components)})", f"", f"| Component | File | Description |", f"|-----------|------|-------------|"]
        for c in components:
            lines.append(format_node_row(c))
        lines.append("")
    else:
        lines += [f"## React Components", f"", f"*Not yet mapped.*", f""]

    # Hooks
    if hooks:
        lines += [f"## Custom Hooks ({len(hooks)})", f"", f"| Hook | File | Description |", f"|------|------|-------------|"]
        for h in hooks:
            lines.append(format_node_row(h))
        lines.append("")

    # Stores
    if stores:
        lines += [f"## Zustand Stores ({len(stores)})", f"", f"| Store | File | Description |", f"|-------|------|-------------|"]
        for s in stores:
            lines.append(format_node_row(s))
        lines.append("")

    # Types
    if types:
        lines += [f"## TypeScript Types ({len(types)})", f"", f"| Type | File | Description |", f"|------|------|-------------|"]
        for t in types:
            lines.append(format_node_row(t))
        lines.append("")

    # renders edges (component → component)
    render_edges = list(db.mapper_edges.find({"edge_type": "renders"}, {"_id": 0}).limit(200))
    if render_edges:
        lines += [f"## Component Render Tree (sample)", f"", f"| Parent | Renders | Child |", f"|--------|---------|-------|"]
        for e in render_edges[:80]:
            lines.append(f"| `{e['source_id']}` | renders | `{e['target_id']}` |")
        lines.append("")

    return "\n".join(lines)


def gen_service_map(db) -> str:
    services = list(db.mapper_nodes.find({"layer": "service"}, {"_id": 0}).sort([("module", 1), ("name", 1)]))

    lines = [
        f"# Service Map",
        f"",
        f"> Generated: {ts()}  ",
        f"> Source: MongoDB `mapper_nodes` (layer=service)",
        f"",
        f"## Overview",
        f"",
        f"Service layer implements business logic and orchestrates data access.",
        f"Services are injected into API endpoints via FastAPI dependency injection.",
        f"",
        f"**Related Maps:** [api-map.md](api-map.md) | [database-map.md](database-map.md) | [module-map.md](module-map.md)",
        f"",
    ]

    if services:
        # Group by module
        modules = {}
        for s in services:
            mod = s.get("module", "core")
            modules.setdefault(mod, []).append(s)

        lines += [f"## Services by Module ({len(services)} total)", f""]
        for mod, svcs in sorted(modules.items()):
            lines += [f"### `{mod}`", f"", f"| Service | File | Exports | Description |", f"|---------|------|---------|-------------|"]
            for s in svcs:
                exp = ", ".join(s.get("exports", []))[:60]
                file_path = s.get("file_path", "")
                line = s.get("line_number")
                loc = f"`{file_path}:{line}`" if line else f"`{file_path}`"
                desc = s.get("description", "")
                lines.append(f"| `{s.get('name','')}` | {loc} | {exp} | {desc} |")
            lines.append("")
    else:
        lines += [f"## Services", f"", f"*Not yet mapped.*", f""]

    # Dependency injection edges
    di_edges = list(db.mapper_edges.find({"edge_type": "uses"}, {"_id": 0}))
    if di_edges:
        lines += [f"## Dependency Injection Graph", f"", f"| Consumer | Uses | Provider | Context |", f"|----------|------|----------|---------|"]
        for e in di_edges[:100]:
            ctx = e.get("context", "")[:60]
            lines.append(f"| `{e['source_id']}` | uses | `{e['target_id']}` | {ctx} |")
        lines.append("")

    return "\n".join(lines)


def gen_index(db) -> str:
    # Collect stats
    node_count = db.mapper_nodes.count_documents({})
    edge_count = db.mapper_edges.count_documents({})
    task_done = db.mapper_tasks.count_documents({"status": "completed"})
    task_total = db.mapper_tasks.count_documents({})

    # Check which maps exist
    maps_status = {}
    for fname in ["api-map.md", "database-map.md", "module-map.md", "frontend-map.md", "service-map.md"]:
        maps_status[fname] = (CODEMAPS_DIR / fname).exists()

    lines = [
        f"# A64 Core Platform — Codebase Knowledge Graph",
        f"",
        f"> **Generated:** {ts()}  ",
        f"> **Graph:** {node_count} nodes · {edge_count} edges  ",
        f"> **Tasks:** {task_done}/{task_total} mapping tasks completed",
        f"",
        f"## What Is This?",
        f"",
        f"This directory contains AI-queryable maps of the A64 Core Platform codebase.",
        f"Instead of reading raw source files, agents read these maps to understand",
        f"architecture, dependencies, and relationships.",
        f"",
        f"**Read this file FIRST**, then navigate to the specific map you need.",
        f"",
        f"## Project Overview",
        f"",
        f"A64 Core Platform is an agricultural management system with:",
        f"- **Backend:** FastAPI (Python 3.11+), MongoDB 7.0, Redis 7",
        f"- **Frontend:** React 18 + TypeScript, Vite, styled-components, TanStack Query",
        f"- **Infrastructure:** Docker Compose, Nginx, 7 business modules",
        f"- **AI:** Google Vertex AI (Gemini 2.5-flash) for Farm AI chat",
        f"",
        f"**Key ports:** API=8000 (nginx→80), Frontend=5173, MongoDB=27017, Redis=6379",
        f"",
        f"## Available Maps",
        f"",
        f"| Map | Contents | Status |",
        f"|-----|----------|--------|",
    ]

    map_descriptions = {
        "api-map.md": "All REST API endpoints, routes, auth requirements, response types",
        "database-map.md": "MongoDB collections, document schemas, inter-collection relationships",
        "module-map.md": "Backend modules (farm, hr, crm, sales, logistics, marketing, ai_analytics), dependencies",
        "frontend-map.md": "React components, custom hooks, Zustand stores, TypeScript types, routing",
        "service-map.md": "Service layer classes, business logic, dependency injection graph",
    }

    for fname, desc in map_descriptions.items():
        status = "✅" if maps_status.get(fname) else "⏳ pending"
        lines.append(f"| [{fname}]({fname}) | {desc} | {status} |")

    lines += [
        f"",
        f"## Module Directory",
        f"",
        f"| Module | Location | Purpose |",
        f"|--------|----------|---------|",
        f"| `farm_manager` | `src/modules/farm_manager/` | Farm blocks, harvests, plant data, analytics |",
        f"| `hr` | `src/modules/hr/` | Employee management, Emirates ID, payroll |",
        f"| `crm` | `src/modules/crm/` | Customer relationships, contacts, leads |",
        f"| `sales` | `src/modules/sales/` | Sales orders, invoices, products |",
        f"| `logistics` | `src/modules/logistics/` | Delivery, inventory, warehousing |",
        f"| `marketing` | `src/modules/marketing/` | Campaigns, analytics |",
        f"| `ai_analytics` | `src/modules/ai_analytics/` | Vertex AI integration, Farm AI chat |",
        f"",
        f"## Key File Locations",
        f"",
        f"| File | Purpose |",
        f"|------|---------|",
        f"| `src/main.py` | FastAPI app entry point, router registration |",
        f"| `src/config/settings.py` | All environment variables (Pydantic BaseSettings) |",
        f"| `src/core/cache/redis_cache.py` | Redis connection pool |",
        f"| `src/middleware/rate_limit.py` | Rate limiting middleware |",
        f"| `src/api/v1/auth.py` | Authentication endpoints |",
        f"| `frontend/user-portal/src/App.tsx` | React app root, routing |",
        f"| `frontend/user-portal/src/services/` | Axios API service calls |",
        f"| `frontend/user-portal/src/stores/` | Zustand state stores |",
        f"| `docker-compose.yml` | Service definitions |",
        f"| `nginx/nginx.dev.conf` | Dev reverse proxy config |",
        f"",
        f"## API Base URLs",
        f"",
        f"- **Dev:** `http://localhost/api/v1`",
        f"- **Auth:** `POST /api/v1/auth/login`",
        f"- **Farms:** `GET /api/v1/farm/farms`",
        f"- **Dashboard:** `GET /api/v1/farm/dashboard`",
        f"",
        f"## Common Questions",
        f"",
        f"**Q: What services does the farm dashboard use?**",
        f"→ See [service-map.md](service-map.md) → `farm_manager` section",
        f"",
        f"**Q: What MongoDB collections exist?**",
        f"→ See [database-map.md](database-map.md)",
        f"",
        f"**Q: What React components render the farm blocks?**",
        f"→ See [frontend-map.md](frontend-map.md) → Components section",
        f"",
        f"**Q: How does the API authenticate requests?**",
        f"→ See [api-map.md](api-map.md) → Core API section",
        f"",
        f"## Regenerating Maps",
        f"",
        f"```bash",
        f"# After code changes, re-seed affected tasks:",
        f"bash scripts/codebase_mapper/rerun.sh",
        f"",
        f"# Regenerate all Markdown maps from MongoDB data:",
        f"python scripts/codebase_mapper/map_generator.py all",
        f"",
        f"# Check mapping progress:",
        f"python scripts/codebase_mapper/task_manager.py stats",
        f"```",
        f"",
        f"---",
        f"*Maps generated by the Codebase Mapper pipeline. Do not edit manually.*",
    ]

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Generate Markdown maps from knowledge graph")
    parser.add_argument(
        "map",
        choices=["all", "api", "database", "module", "frontend", "service", "index"],
        help="Which map to generate"
    )
    args = parser.parse_args()

    client, db = get_db()
    CODEMAPS_DIR.mkdir(parents=True, exist_ok=True)

    generators = {
        "api": ("api-map.md", gen_api_map),
        "database": ("database-map.md", gen_database_map),
        "module": ("module-map.md", gen_module_map),
        "frontend": ("frontend-map.md", gen_frontend_map),
        "service": ("service-map.md", gen_service_map),
        "index": ("INDEX.md", gen_index),
    }

    try:
        if args.map == "all":
            print("Generating all maps...")
            for key, (filename, gen_fn) in generators.items():
                if key == "index":
                    continue  # generate index last
                content = gen_fn(db)
                write_map(filename, content)
            # Always generate index last
            content = gen_index(db)
            write_map("INDEX.md", content)
        else:
            filename, gen_fn = generators[args.map]
            content = gen_fn(db)
            write_map(filename, content)
    finally:
        client.close()

    print(f"Done. Maps in {CODEMAPS_DIR}/")


if __name__ == "__main__":
    main()
