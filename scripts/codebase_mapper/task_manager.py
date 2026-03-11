#!/usr/bin/env python3
"""
Codebase Mapper Task Manager
Atomic task claiming, completion, failure reporting, and stats.

Usage:
    python scripts/codebase_mapper/task_manager.py stats
    python scripts/codebase_mapper/task_manager.py claim --agent-id <id> [--category <cat>]
    python scripts/codebase_mapper/task_manager.py complete --task-id <id> [--agent-id <id>]
    python scripts/codebase_mapper/task_manager.py fail --task-id <id> --error "<message>"
    python scripts/codebase_mapper/task_manager.py reset --task-id <id>
    python scripts/codebase_mapper/task_manager.py list [--status <status>]
    python scripts/codebase_mapper/task_manager.py reseed --changed-files "<file1 file2 ...>"
"""

import sys
import argparse
import json
from datetime import datetime, timedelta
from pymongo import MongoClient, ReturnDocument
from pymongo.errors import ConnectionFailure

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "a64core_db"
DEAD_AGENT_TIMEOUT_MINUTES = 30

# Maps file path prefixes to task IDs that should be re-seeded
FILE_TO_TASK_MAP = [
    ("src/api/", ["map_core_api", "gen_api_map"]),
    ("src/main.py", ["map_core_api", "gen_api_map"]),
    ("src/services/", ["map_core_services", "gen_service_map"]),
    ("src/core/", ["map_core_services", "gen_service_map"]),
    ("src/middleware/", ["map_core_middleware", "gen_module_map"]),
    ("src/models/", ["map_core_middleware", "map_database_collections", "gen_database_map"]),
    ("src/config/", ["map_core_middleware", "map_config_env", "gen_module_map"]),
    ("src/modules/farm_manager/api/", ["map_farm_api", "gen_api_map"]),
    ("src/modules/farm_manager/services/", ["map_farm_services", "gen_service_map"]),
    ("src/modules/farm_manager/models/", ["map_farm_models", "gen_database_map"]),
    ("src/modules/hr/", ["map_hr_module", "gen_module_map"]),
    ("src/modules/crm/", ["map_crm_module", "gen_module_map"]),
    ("src/modules/sales/", ["map_sales_module", "gen_module_map"]),
    ("src/modules/logistics/", ["map_logistics_module", "gen_module_map"]),
    ("src/modules/marketing/", ["map_marketing_module", "gen_module_map"]),
    ("src/modules/ai_analytics/", ["map_ai_analytics_module", "gen_module_map"]),
    ("frontend/user-portal/src/components/farm/", ["map_frontend_farm", "gen_frontend_map"]),
    ("frontend/user-portal/src/pages/farm/", ["map_frontend_farm", "gen_frontend_map"]),
    ("frontend/user-portal/src/hooks/farm/", ["map_frontend_farm", "gen_frontend_map"]),
    ("frontend/user-portal/src/components/", ["map_frontend_components", "gen_frontend_map"]),
    ("frontend/user-portal/src/pages/", ["map_frontend_components", "gen_frontend_map"]),
    ("frontend/user-portal/src/hooks/", ["map_frontend_hooks_services", "gen_frontend_map"]),
    ("frontend/user-portal/src/services/", ["map_frontend_hooks_services", "map_api_frontend_links", "gen_frontend_map", "gen_api_map"]),
    ("frontend/user-portal/src/stores/", ["map_frontend_hooks_services", "gen_frontend_map"]),
    ("frontend/user-portal/src/types/", ["map_frontend_types", "gen_frontend_map"]),
    ("frontend/user-portal/src/config/", ["map_frontend_types", "gen_frontend_map"]),
    (".env.example", ["map_config_env", "gen_module_map"]),
    ("docker-compose.yml", ["map_config_env", "gen_module_map"]),
]


def get_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except ConnectionFailure:
        print("ERROR: Cannot connect to MongoDB at", MONGO_URL)
        sys.exit(1)
    return client, client[DB_NAME]


def recover_dead_agents(db):
    """Reset tasks claimed by agents that have been running > DEAD_AGENT_TIMEOUT_MINUTES."""
    cutoff = datetime.utcnow() - timedelta(minutes=DEAD_AGENT_TIMEOUT_MINUTES)
    result = db.mapper_tasks.update_many(
        {"status": "in_progress", "started_at": {"$lt": cutoff}},
        {"$set": {"status": "pending", "agent_id": None, "started_at": None, "error": "recovered_dead_agent"}},
    )
    if result.modified_count > 0:
        print(f"[recovery] Reset {result.modified_count} stale in_progress task(s) to pending")


def cmd_stats(db, args):
    """Print task completion statistics."""
    recover_dead_agents(db)

    total = db.mapper_tasks.count_documents({})
    by_status = {}
    for status in ["pending", "in_progress", "completed", "failed"]:
        by_status[status] = db.mapper_tasks.count_documents({"status": status})

    print(f"\n{'='*50}")
    print(f"  Codebase Mapper — Task Stats")
    print(f"{'='*50}")
    print(f"  Total tasks  : {total}")
    print(f"  Pending      : {by_status['pending']}")
    print(f"  In progress  : {by_status['in_progress']}")
    print(f"  Completed    : {by_status['completed']}")
    print(f"  Failed       : {by_status['failed']}")

    if total > 0:
        pct = (by_status["completed"] / total) * 100
        print(f"  Progress     : {pct:.1f}%")

    print(f"\nBy category:")
    for cat in ["backend", "frontend", "integration", "summary"]:
        done = db.mapper_tasks.count_documents({"category": cat, "status": "completed"})
        cat_total = db.mapper_tasks.count_documents({"category": cat})
        print(f"  {cat:12s}: {done}/{cat_total} completed")

    node_count = db.mapper_nodes.count_documents({})
    edge_count = db.mapper_edges.count_documents({})
    print(f"\nKnowledge graph:")
    print(f"  Nodes        : {node_count}")
    print(f"  Edges        : {edge_count}")
    print(f"{'='*50}\n")


def cmd_claim(db, args):
    """Atomically claim the next pending task. Prints task JSON to stdout."""
    recover_dead_agents(db)

    query = {"status": "pending"}
    if args.category:
        query["category"] = args.category

    task = db.mapper_tasks.find_one_and_update(
        query,
        {
            "$set": {
                "status": "in_progress",
                "agent_id": args.agent_id,
                "started_at": datetime.utcnow(),
            }
        },
        sort=[("priority", 1), ("created_at", 1)],
        return_document=ReturnDocument.AFTER,
    )

    if task is None:
        print(json.dumps({"claimed": False, "message": "No pending tasks available"}))
        return

    task["_id"] = str(task["_id"])
    if task.get("started_at"):
        task["started_at"] = task["started_at"].isoformat()
    if task.get("created_at"):
        task["created_at"] = task["created_at"].isoformat()

    print(json.dumps({"claimed": True, "task": task}))


def cmd_complete(db, args):
    """Mark a task as completed."""
    result = db.mapper_tasks.update_one(
        {"task_id": args.task_id},
        {
            "$set": {
                "status": "completed",
                "completed_at": datetime.utcnow(),
                "error": None,
            }
        },
    )
    if result.matched_count == 0:
        print(f"ERROR: Task '{args.task_id}' not found")
        sys.exit(1)
    print(f"Task '{args.task_id}' marked as completed")


def cmd_fail(db, args):
    """Mark a task as failed with an error message."""
    result = db.mapper_tasks.update_one(
        {"task_id": args.task_id},
        {
            "$set": {
                "status": "failed",
                "completed_at": datetime.utcnow(),
                "error": args.error,
            }
        },
    )
    if result.matched_count == 0:
        print(f"ERROR: Task '{args.task_id}' not found")
        sys.exit(1)
    print(f"Task '{args.task_id}' marked as failed: {args.error}")


def cmd_reset(db, args):
    """Reset a task back to pending status."""
    result = db.mapper_tasks.update_one(
        {"task_id": args.task_id},
        {
            "$set": {
                "status": "pending",
                "agent_id": None,
                "started_at": None,
                "completed_at": None,
                "error": None,
            }
        },
    )
    if result.matched_count == 0:
        print(f"ERROR: Task '{args.task_id}' not found")
        sys.exit(1)
    print(f"Task '{args.task_id}' reset to pending")


def cmd_list(db, args):
    """List tasks, optionally filtered by status."""
    query = {}
    if args.status:
        query["status"] = args.status

    tasks = list(db.mapper_tasks.find(query, {"_id": 0}).sort([("priority", 1), ("task_id", 1)]))
    print(f"\n{'TASK_ID':<35} {'STATUS':<12} {'CATEGORY':<12} {'PRI'}")
    print("-" * 70)
    for t in tasks:
        print(f"{t['task_id']:<35} {t['status']:<12} {t.get('category',''):<12} {t.get('priority','')}")
    print(f"\nTotal: {len(tasks)} tasks")


def cmd_reseed(db, args):
    """Re-seed tasks affected by changed files (for incremental re-runs)."""
    changed_files = args.changed_files.split()
    tasks_to_reseed = set()

    for changed_file in changed_files:
        for prefix, task_ids in FILE_TO_TASK_MAP:
            if changed_file.startswith(prefix):
                tasks_to_reseed.update(task_ids)

    if not tasks_to_reseed:
        print("No tasks matched the changed files. Nothing re-seeded.")
        return

    reseeded = 0
    for task_id in tasks_to_reseed:
        result = db.mapper_tasks.update_one(
            {"task_id": task_id, "status": "completed"},
            {
                "$set": {
                    "status": "pending",
                    "agent_id": None,
                    "started_at": None,
                    "completed_at": None,
                    "error": None,
                }
            },
        )
        if result.modified_count > 0:
            reseeded += 1

    print(f"Re-queued {reseeded} tasks: {', '.join(sorted(tasks_to_reseed))}")
    print("Run mapping agents to process re-queued tasks.")


def main():
    parser = argparse.ArgumentParser(description="Codebase Mapper Task Manager")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # stats
    subparsers.add_parser("stats", help="Show task completion statistics")

    # claim
    claim_p = subparsers.add_parser("claim", help="Claim next pending task")
    claim_p.add_argument("--agent-id", required=True, help="Unique agent identifier")
    claim_p.add_argument("--category", help="Filter by task category (backend/frontend/integration/summary)")

    # complete
    complete_p = subparsers.add_parser("complete", help="Mark task as completed")
    complete_p.add_argument("--task-id", required=True)

    # fail
    fail_p = subparsers.add_parser("fail", help="Mark task as failed")
    fail_p.add_argument("--task-id", required=True)
    fail_p.add_argument("--error", required=True)

    # reset
    reset_p = subparsers.add_parser("reset", help="Reset task to pending")
    reset_p.add_argument("--task-id", required=True)

    # list
    list_p = subparsers.add_parser("list", help="List tasks")
    list_p.add_argument("--status", choices=["pending", "in_progress", "completed", "failed"])

    # reseed
    reseed_p = subparsers.add_parser("reseed", help="Re-seed tasks for changed files")
    reseed_p.add_argument("--changed-files", required=True, help="Space-separated list of changed file paths")

    args = parser.parse_args()
    client, db = get_db()

    try:
        dispatch = {
            "stats": cmd_stats,
            "claim": cmd_claim,
            "complete": cmd_complete,
            "fail": cmd_fail,
            "reset": cmd_reset,
            "list": cmd_list,
            "reseed": cmd_reseed,
        }
        dispatch[args.command](db, args)
    finally:
        client.close()


if __name__ == "__main__":
    main()
