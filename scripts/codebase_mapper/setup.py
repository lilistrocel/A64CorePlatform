#!/usr/bin/env python3
"""
Codebase Mapper Setup Script
Initializes MongoDB collections, indexes, and seeds the mapping task catalogue.

Seeding is idempotent: tasks are upserted with `$setOnInsert`, so re-running
this script only ever ADDS task rows that do not exist yet. Existing rows keep
their status/history and are NOT rewritten — including their `depends_on`
lists. Adding a task below and re-running is therefore the safe way to close a
coverage hole; editing an existing task's fields below has no effect on a
database that already has that row.

Usage:
    python scripts/codebase_mapper/setup.py [--reset]

Options:
    --reset    Drop existing mapper_* collections before seeding (re-run from scratch)

    WARNING: --reset drops mapper_nodes and mapper_edges, i.e. the entire
    knowledge graph, on whatever database MONGO_URL points at. On a live
    deployment that is the production database. Do not use it to add tasks.
"""

import os
import sys
import argparse
from datetime import datetime
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure

# Reason: see task_manager.py / map_generator.py — every other script in this
# package honours MONGO_URL. setup.py hard-coded an unauthenticated localhost
# URL, so it could not seed any deployment whose mongo requires credentials
# (it dies on `mongodb://localhost:27017`). Same env contract as its siblings.
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("MONGODB_DB_NAME", "a64core_db")

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
    # ─── Backend modules added after the original 26-task seed ────────────────
    #
    # These seven modules were live in src/modules/ but had NO mapping task, so
    # every generated map showed them as empty while task stats reported
    # "26/26 completed". module-map.md carried `purchasing` and `mushroom`
    # sections built ENTIRELY from React components — a UI with no backend
    # behind it. task_manager.FILE_TO_TASK_MAP already referenced
    # map_purchasing_module / map_mushroom_module / map_finance_module /
    # map_genetics_module before they existed here, so invalidation matched
    # nothing and silently no-op'd.
    #
    # `output_map` is ADVISORY — nothing reads it. map_generator.py selects
    # nodes by `node_type` and `layer`, never by task. A per-module task
    # therefore reaches api-map.md, service-map.md and database-map.md purely
    # by virtue of the nodes its agent emits. That is why each description
    # below names the node types and layers required: emitting only "module"
    # nodes is exactly how these modules stayed invisible.
    {
        "task_id": "map_purchasing_module",
        "description": (
            "Map src/modules/purchasing/ — PR→PO→GR→AP document chain, vendor master, "
            "purchase item master, payment terms, approval engine, blanket agreements, "
            "chain reconciler. Mounted at /api/v1/purchasing by register.py. "
            "MUST emit: one api_endpoint node (layer=api) per router file under api/v1/ "
            "using file-level ids (purchasing.api.purchase_orders, …); layer=service nodes "
            "for every services/*.py (purchasing.service.approval_engine, …); layer=model "
            "nodes for models/*.py; db_model nodes collection_vendors, collection_purchase_items, "
            "collection_payment_terms, collection_document_headers, collection_document_lines, "
            "collection_ap_down_payments_v2; and stores_in/reads_from edges from each service "
            "to the collections it touches. Also map middleware/auth.py."
        ),
        "scope": ["src/modules/purchasing/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_mushroom_module",
        "description": (
            "Map src/modules/mushroom_manager/ — facilities, growing rooms, strain library, "
            "substrate batches, multi-flush harvests, environment logs, contamination reports. "
            "Mounted at /api/v1/mushroom by register.py. Use module=\"mushroom_manager\" (the "
            "directory name) — the frontend nodes already in the graph use module=\"mushroom\", "
            "mirroring the existing farm_manager/farm split; do not merge them. "
            "MUST emit: api_endpoint nodes (layer=api) per router file under api/v1/ "
            "(mushroom_manager.api.growing_rooms, …); layer=service nodes for each "
            "services/<domain>/<domain>_service.py plus services/database.py; layer=model nodes "
            "for models/*.py; db_model nodes collection_mushroom_facilities, "
            "collection_growing_rooms, collection_mushroom_strains, collection_substrate_batches, "
            "collection_mushroom_harvests, collection_room_environment_logs, "
            "collection_contamination_reports, collection_mushroom_tasks (index definitions live "
            "in services/database.py); and service→collection edges."
        ),
        "scope": ["src/modules/mushroom_manager/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_protocols_module",
        "description": (
            "Map src/modules/protocols/ — versioned SOPs with approve/retire lifecycle, scope "
            "tags, and version pinning from work records. Mounted at /api/v1 by register.py "
            "(config/settings.API_PREFIX is /api/v1, routes carry their own /protocols path). "
            "MUST emit: an api_endpoint node protocols.api.protocols (layer=api) covering the 7 "
            "routes in api/v1/protocols.py; layer=service nodes protocols.service.protocol_service "
            "and protocols.service.database; layer=model nodes for models/protocol.py and "
            "models/enums.py; db_model node collection_protocols; middleware/auth.py; and the "
            "cross-module edge genetics.service.protocol_link --[depends_on]--> "
            "protocols.service.protocol_service."
        ),
        "scope": ["src/modules/protocols/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_ai_assistant_module",
        "description": (
            "Map src/modules/ai_assistant/ — Claude-backed assistant: conversation store, context "
            "composer, tool definitions/executor, cost tracking. NOT a plugin: it has no "
            "manifest.json or register.py and is mounted directly from src/api/routes.py at "
            "/api/v1/ai, so plugin discovery never sees it and map_core_api only mapped the "
            "router include, not the module internals. Distinct from src/modules/ai_analytics/ "
            "(Vertex AI) — use module=\"ai_assistant\", and note the graph's existing "
            "module=\"ai\" nodes are the React UI. "
            "MUST emit: api_endpoint node ai_assistant.api.assistant (layer=api); layer=service "
            "nodes for claude_service, context_composer, conversation_repository, cost_tracker, "
            "tool_definitions, tool_executor; layer=model nodes for chat_request, conversation, "
            "cost_log; db_model nodes collection_ai_assistant_conversations and "
            "collection_ai_assistant_cost_log; and calls edges from tool_executor to the services "
            "its tools reach."
        ),
        "scope": ["src/modules/ai_assistant/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_attachments_module",
        "description": (
            "Map src/modules/attachments/ — document attachment upload/download with pluggable "
            "storage backends and HTTP range support. NOT a plugin: no manifest.json or "
            "register.py, mounted directly from src/api/routes.py at /api/v1/attachments. "
            "MUST emit: api_endpoint node attachments.api.attachments (layer=api); layer=service "
            "node attachments.service.attachment_service; storage backend nodes for storage/base.py "
            "(abstract) and storage/local.py with an extends edge; layer=model node for "
            "models/attachment.py; utils/range_parser.py; db_model node "
            "collection_document_attachments (compound index created in attachment_service.py); "
            "and the reads_from edges linking attachments to document_headers/document_lines."
        ),
        "scope": ["src/modules/attachments/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_finance_module",
        "description": (
            "Map src/modules/finance/ — the OPS-side operational P&L module (revenue/COGS/margin "
            "analytics read out of MongoDB), mounted at /api/v1/operations by register.py. This is "
            "NOT the statutory finance microservice under services/finance/ (MySQL GL, "
            "/api/v1/finance/*), which is a separate deployment artefact and remains unmapped. "
            "MUST emit: api_endpoint node finance.api.pnl (layer=api); layer=service nodes "
            "finance.service.pnl_service and finance.service.database; layer=model node "
            "finance.model.pnl; middleware/auth.py; config/settings.py. This module OWNS no "
            "collections — it only reads sales_orders, sales_order_lines, purchase_register, "
            "inventory_movements, block_harvests, farms, customers. Emit reads_from edges to the "
            "existing collection_* nodes rather than re-declaring those collections as "
            "finance-owned db_models."
        ),
        "scope": ["src/modules/finance/"],
        "priority": 3,
        "category": "backend",
        "output_map": "module-map.md",
    },
    {
        "task_id": "map_genetics_module",
        "description": (
            "Map src/modules/genetics/ — lines, accessions (G/F generations), propagation events, "
            "medium recipes/batches, observations, plus the public QR label route. "
            "NOTE: this module was already mapped ad hoc via batch_genetics.json without a task "
            "row (38 backend nodes covering 32 of 32 non-__init__ files). This task exists so the "
            "task id referenced by task_manager.FILE_TO_TASK_MAP resolves and future genetics "
            "edits actually re-queue work. The only real gap on first run is "
            "src/modules/genetics/services/protocol_link.py — map it and emit the depends_on edge "
            "to protocols.service.protocol_service. Node upserts are keyed by node_id, so "
            "re-running over the already-mapped files is safe and non-duplicating. If you do not "
            "want a full re-scan, mark this task completed instead: "
            "task_manager.py complete --task-id map_genetics_module."
        ),
        "scope": ["src/modules/genetics/"],
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
        # NOTE: depends_on is documentation only — no code reads it, and
        # $setOnInsert means edits here never reach a database that already has
        # this row. Kept accurate for fresh setups and for humans.
        "depends_on": [
            "map_core_api",
            "map_farm_api",
            "map_api_frontend_links",
            "map_purchasing_module",
            "map_mushroom_module",
            "map_protocols_module",
            "map_ai_assistant_module",
            "map_attachments_module",
            "map_finance_module",
            "map_genetics_module",
        ],
    },
    {
        "task_id": "gen_database_map",
        "description": "Generate Docs/CodeMaps/database-map.md — all collections, schemas, relationships",
        "scope": [],
        "priority": 5,
        "category": "summary",
        "output_map": "database-map.md",
        "depends_on": [
            "map_farm_models",
            "map_database_collections",
            "map_purchasing_module",
            "map_mushroom_module",
            "map_protocols_module",
            "map_ai_assistant_module",
            "map_attachments_module",
            "map_genetics_module",
        ],
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
            "map_purchasing_module",
            "map_mushroom_module",
            "map_protocols_module",
            "map_ai_assistant_module",
            "map_attachments_module",
            "map_finance_module",
            "map_genetics_module",
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
        "depends_on": [
            "map_core_services",
            "map_farm_services",
            "map_purchasing_module",
            "map_mushroom_module",
            "map_protocols_module",
            "map_ai_assistant_module",
            "map_attachments_module",
            "map_finance_module",
            "map_genetics_module",
        ],
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
