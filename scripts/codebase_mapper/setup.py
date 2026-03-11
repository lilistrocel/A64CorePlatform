#!/usr/bin/env python3
"""
Codebase Mapper Setup Script
Initializes MongoDB collections, indexes, and seeds all 26 mapping tasks.

Usage:
    python scripts/codebase_mapper/setup.py [--reset]

Options:
    --reset    Drop existing mapper_* collections before seeding (re-run from scratch)
"""

import sys
import argparse
from datetime import datetime
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "a64core_db"

TASKS = [
    # ─── Backend Tasks ───────────────────────────────────────────────────────
    {
        "task_id": "map_core_api",
        "description": "Map src/api/ routes and src/main.py — all top-level API routers, middleware registration, startup events",
        "scope": ["src/api/", "src/main.py"],
        "priority": 1,
        "category": "backend",
        "output_map": "api-map.md",
    },
    {
        "task_id": "map_core_services",
        "description": "Map src/services/ and src/core/ — shared services (auth, cache, email), core utilities",
        "scope": ["src/services/", "src/core/"],
        "priority": 1,
        "category": "backend",
        "output_map": "service-map.md",
    },
    {
        "task_id": "map_core_middleware",
        "description": "Map src/middleware/, src/models/, src/config/ — request pipeline, base models, settings",
        "scope": ["src/middleware/", "src/models/", "src/config/"],
        "priority": 1,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_farm_api",
        "description": "Map src/modules/farm_manager/api/ — all farm API endpoints, routes, request/response schemas",
        "scope": ["src/modules/farm_manager/api/"],
        "priority": 2,
        "category": "backend",
        "output_map": "api-map.md",
    },
    {
        "task_id": "map_farm_services",
        "description": "Map src/modules/farm_manager/services/ — farm business logic, harvest service, analytics service",
        "scope": ["src/modules/farm_manager/services/"],
        "priority": 2,
        "category": "backend",
        "output_map": "service-map.md",
    },
    {
        "task_id": "map_farm_models",
        "description": "Map src/modules/farm_manager/models/ — farm data models, plant data, enums",
        "scope": ["src/modules/farm_manager/models/"],
        "priority": 2,
        "category": "backend",
        "output_map": "database-map.md",
    },
    {
        "task_id": "map_hr_module",
        "description": "Map src/modules/hr/ — all HR module files (API, services, models)",
        "scope": ["src/modules/hr/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_crm_module",
        "description": "Map src/modules/crm/ — all CRM module files (API, services, models)",
        "scope": ["src/modules/crm/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_sales_module",
        "description": "Map src/modules/sales/ — all sales module files (API, services, models)",
        "scope": ["src/modules/sales/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_logistics_module",
        "description": "Map src/modules/logistics/ — all logistics module files (API, services, models)",
        "scope": ["src/modules/logistics/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_marketing_module",
        "description": "Map src/modules/marketing/ — all marketing module files (API, services, models)",
        "scope": ["src/modules/marketing/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_ai_analytics_module",
        "description": "Map src/modules/ai_analytics/ — AI analytics module, Vertex AI integration, chat endpoints",
        "scope": ["src/modules/ai_analytics/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    # ─── Frontend Tasks ───────────────────────────────────────────────────────
    {
        "task_id": "map_frontend_farm",
        "description": "Map frontend/user-portal/src/components/farm/, pages/farm/, hooks/farm/ — farm UI components",
        "scope": [
            "frontend/user-portal/src/components/farm/",
            "frontend/user-portal/src/pages/farm/",
            "frontend/user-portal/src/hooks/farm/",
        ],
        "priority": 2,
        "category": "frontend",
        "output_map": "frontend-map.md",
    },
    {
        "task_id": "map_frontend_components",
        "description": "Map frontend/user-portal/src/components/ (excl. farm) and pages/ (excl. farm) — shared UI components",
        "scope": [
            "frontend/user-portal/src/components/",
            "frontend/user-portal/src/pages/",
        ],
        "priority": 3,
        "category": "frontend",
        "output_map": "frontend-map.md",
    },
    {
        "task_id": "map_frontend_hooks_services",
        "description": "Map frontend/user-portal/src/hooks/, services/, stores/ — data fetching, state management",
        "scope": [
            "frontend/user-portal/src/hooks/",
            "frontend/user-portal/src/services/",
            "frontend/user-portal/src/stores/",
        ],
        "priority": 3,
        "category": "frontend",
        "output_map": "frontend-map.md",
    },
    {
        "task_id": "map_frontend_types",
        "description": "Map frontend/user-portal/src/types/, config/, App.tsx — TypeScript types, app config, routing",
        "scope": [
            "frontend/user-portal/src/types/",
            "frontend/user-portal/src/config/",
            "frontend/user-portal/src/App.tsx",
        ],
        "priority": 3,
        "category": "frontend",
        "output_map": "frontend-map.md",
    },
    {
        "task_id": "map_frontend_other_modules",
        "description": "Map frontend components for marketing, sales, hr, logistics, crm modules",
        "scope": [
            "frontend/user-portal/src/components/marketing/",
            "frontend/user-portal/src/components/sales/",
            "frontend/user-portal/src/components/hr/",
            "frontend/user-portal/src/components/logistics/",
            "frontend/user-portal/src/components/crm/",
        ],
        "priority": 3,
        "category": "frontend",
        "output_map": "frontend-map.md",
    },
    # ─── Integration Tasks ────────────────────────────────────────────────────
    {
        "task_id": "map_api_frontend_links",
        "description": "Cross-reference: match backend endpoint URLs to frontend service calls and API hooks",
        "scope": [
            "src/modules/",
            "frontend/user-portal/src/services/",
            "frontend/user-portal/src/hooks/",
        ],
        "priority": 4,
        "category": "integration",
        "output_map": "api-map.md",
    },
    {
        "task_id": "map_database_collections",
        "description": "Map all MongoDB collection names, schemas, and indexes across all backend modules",
        "scope": ["src/modules/", "src/models/"],
        "priority": 4,
        "category": "integration",
        "output_map": "database-map.md",
    },
    {
        "task_id": "map_config_env",
        "description": "Map all settings files, environment variables, module configs, and external service config",
        "scope": ["src/config/", ".env.example", "docker-compose.yml"],
        "priority": 4,
        "category": "integration",
        "output_map": "module-map.md",
    },
    # ─── Summary Generation Tasks ─────────────────────────────────────────────
    {
        "task_id": "gen_api_map",
        "description": "Generate Docs/CodeMaps/api-map.md from mapper_nodes/edges data for API layer",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "api-map.md",
        "depends_on": ["map_core_api", "map_farm_api", "map_api_frontend_links"],
    },
    {
        "task_id": "gen_database_map",
        "description": "Generate Docs/CodeMaps/database-map.md — all collections, schemas, relationships",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "database-map.md",
        "depends_on": ["map_farm_models", "map_database_collections"],
    },
    {
        "task_id": "gen_module_map",
        "description": "Generate Docs/CodeMaps/module-map.md — backend module dependency graph",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "module-map.md",
        "depends_on": [
            "map_core_middleware",
            "map_hr_module",
            "map_crm_module",
            "map_sales_module",
            "map_logistics_module",
            "map_marketing_module",
            "map_ai_analytics_module",
            "map_config_env",
        ],
    },
    {
        "task_id": "gen_frontend_map",
        "description": "Generate Docs/CodeMaps/frontend-map.md — React component tree and data flow",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "frontend-map.md",
        "depends_on": [
            "map_frontend_farm",
            "map_frontend_components",
            "map_frontend_hooks_services",
            "map_frontend_types",
            "map_frontend_other_modules",
        ],
    },
    {
        "task_id": "gen_service_map",
        "description": "Generate Docs/CodeMaps/service-map.md — service layer dependency injection graph",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "service-map.md",
        "depends_on": ["map_core_services", "map_farm_services"],
    },
    {
        "task_id": "gen_index",
        "description": "Generate Docs/CodeMaps/INDEX.md — master index linking all maps, entry point for agents",
        "scope": [],
        "priority": 6,
        "category": "summary",
        "output_map": "INDEX.md",
        "depends_on": [
            "gen_api_map",
            "gen_database_map",
            "gen_module_map",
            "gen_frontend_map",
            "gen_service_map",
        ],
    },
]


def get_client():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except ConnectionFailure:
        print("ERROR: Cannot connect to MongoDB at", MONGO_URL)
        sys.exit(1)
    return client


def setup(reset: bool = False):
    client = get_client()
    db = client[DB_NAME]

    if reset:
        print("Dropping existing mapper collections...")
        db.mapper_tasks.drop()
        db.mapper_nodes.drop()
        db.mapper_edges.drop()
        print("  Dropped: mapper_tasks, mapper_nodes, mapper_edges")

    # ── Create indexes ────────────────────────────────────────────────────────
    db.mapper_tasks.create_index([("task_id", ASCENDING)], unique=True)
    db.mapper_tasks.create_index([("status", ASCENDING), ("priority", ASCENDING)])
    db.mapper_tasks.create_index([("started_at", ASCENDING)])

    db.mapper_nodes.create_index([("node_id", ASCENDING)], unique=True)
    db.mapper_nodes.create_index([("node_type", ASCENDING)])
    db.mapper_nodes.create_index([("module", ASCENDING)])
    db.mapper_nodes.create_index([("layer", ASCENDING)])
    db.mapper_nodes.create_index([("file_path", ASCENDING)])

    db.mapper_edges.create_index([("source_id", ASCENDING)])
    db.mapper_edges.create_index([("target_id", ASCENDING)])
    db.mapper_edges.create_index([("edge_type", ASCENDING)])
    db.mapper_edges.create_index([("source_id", ASCENDING), ("target_id", ASCENDING)])

    print("Indexes created on mapper_tasks, mapper_nodes, mapper_edges")

    # ── Seed tasks ────────────────────────────────────────────────────────────
    seeded = 0
    skipped = 0
    for task in TASKS:
        doc = {
            **task,
            "status": "pending",
            "agent_id": None,
            "started_at": None,
            "completed_at": None,
            "error": None,
            "created_at": datetime.utcnow(),
        }
        result = db.mapper_tasks.update_one(
            {"task_id": task["task_id"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if result.upserted_id:
            seeded += 1
        else:
            skipped += 1

    print(f"Tasks seeded: {seeded} new, {skipped} already existed")
    print(f"Total tasks in collection: {db.mapper_tasks.count_documents({})}")

    # ── Summary by category ───────────────────────────────────────────────────
    print("\nTask breakdown:")
    for cat in ["backend", "frontend", "integration", "summary"]:
        count = db.mapper_tasks.count_documents({"category": cat})
        print(f"  {cat:12s}: {count} tasks")

    client.close()
    print("\nSetup complete. Run mapping agents to populate the knowledge graph.")
    print("Check status: python scripts/codebase_mapper/task_manager.py stats")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Initialize Codebase Mapper infrastructure")
    parser.add_argument("--reset", action="store_true", help="Drop and re-seed all mapper collections")
    args = parser.parse_args()
    setup(reset=args.reset)
