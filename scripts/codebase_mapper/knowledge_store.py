#!/usr/bin/env python3
"""
Codebase Mapper Knowledge Store
Writes nodes and edges to MongoDB from agent-provided JSON input.

Usage:
    # Write a single node
    python scripts/codebase_mapper/knowledge_store.py node \
        --node-id "FarmAnalyticsService" \
        --node-type "class" \
        --name "FarmAnalyticsService" \
        --file "src/modules/farm_manager/services/farm/farm_analytics_service.py" \
        --line 45 \
        --module "farm_manager" \
        --layer "service" \
        --exports "calculate_analytics,get_trends" \
        --description "Computes farm-level analytics and trend data"

    # Write multiple nodes/edges from JSON file
    python scripts/codebase_mapper/knowledge_store.py batch --file results.json

    # Write a single edge
    python scripts/codebase_mapper/knowledge_store.py edge \
        --source "dashboard_endpoint" \
        --target "FarmAnalyticsService" \
        --type "imports" \
        --source-file "src/modules/farm_manager/api/v1/dashboard.py" \
        --target-file "src/modules/farm_manager/services/farm/farm_analytics_service.py" \
        --context "line 12: from ...services.farm.farm_analytics_service import FarmAnalyticsService"

    # Show node/edge counts
    python scripts/codebase_mapper/knowledge_store.py stats

    # Query nodes by module or type
    python scripts/codebase_mapper/knowledge_store.py query --module farm_manager --layer service
"""

import sys
import json
import argparse
from datetime import datetime
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, DuplicateKeyError

MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "a64core_db"

VALID_NODE_TYPES = {"class", "function", "file", "api_endpoint", "db_model", "component", "hook", "store", "type", "middleware", "config"}
VALID_LAYERS = {"service", "api", "model", "core", "frontend", "middleware", "config", "integration"}
VALID_EDGE_TYPES = {"imports", "calls", "extends", "renders", "defines", "stores_in", "reads_from", "uses", "exports", "depends_on"}


def get_db():
    client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    try:
        client.admin.command("ping")
    except ConnectionFailure:
        print("ERROR: Cannot connect to MongoDB at", MONGO_URL)
        sys.exit(1)
    return client, client[DB_NAME]


def upsert_node(db, node: dict) -> bool:
    """Insert or update a node. Returns True if inserted, False if updated."""
    node_doc = {
        "node_id": node["node_id"],
        "node_type": node.get("node_type", "file"),
        "name": node.get("name", node["node_id"]),
        "file_path": node.get("file_path", ""),
        "line_number": node.get("line_number"),
        "module": node.get("module", ""),
        "layer": node.get("layer", ""),
        "exports": node.get("exports", []),
        "description": node.get("description", ""),
        "updated_at": datetime.utcnow(),
    }
    result = db.mapper_nodes.update_one(
        {"node_id": node["node_id"]},
        {"$set": node_doc, "$setOnInsert": {"created_at": datetime.utcnow()}},
        upsert=True,
    )
    return result.upserted_id is not None


def upsert_edge(db, edge: dict) -> bool:
    """Insert or update an edge. Returns True if inserted, False if updated."""
    edge_doc = {
        "source_id": edge["source_id"],
        "target_id": edge["target_id"],
        "edge_type": edge.get("edge_type", "imports"),
        "source_file": edge.get("source_file", ""),
        "target_file": edge.get("target_file", ""),
        "context": edge.get("context", ""),
        "updated_at": datetime.utcnow(),
    }
    # Use composite key to deduplicate edges
    result = db.mapper_edges.update_one(
        {
            "source_id": edge["source_id"],
            "target_id": edge["target_id"],
            "edge_type": edge.get("edge_type", "imports"),
        },
        {"$set": edge_doc, "$setOnInsert": {"created_at": datetime.utcnow()}},
        upsert=True,
    )
    return result.upserted_id is not None


def cmd_node(db, args):
    exports = [e.strip() for e in args.exports.split(",")] if args.exports else []
    node = {
        "node_id": args.node_id,
        "node_type": args.node_type,
        "name": args.name or args.node_id,
        "file_path": args.file or "",
        "line_number": args.line,
        "module": args.module or "",
        "layer": args.layer or "",
        "exports": exports,
        "description": args.description or "",
    }
    inserted = upsert_node(db, node)
    action = "Inserted" if inserted else "Updated"
    print(f"{action} node: {args.node_id}")


def cmd_edge(db, args):
    edge = {
        "source_id": args.source,
        "target_id": args.target,
        "edge_type": args.type,
        "source_file": args.source_file or "",
        "target_file": args.target_file or "",
        "context": args.context or "",
    }
    inserted = upsert_edge(db, edge)
    action = "Inserted" if inserted else "Updated"
    print(f"{action} edge: {args.source} --[{args.type}]--> {args.target}")


def cmd_batch(db, args):
    """Load a JSON file with 'nodes' and/or 'edges' arrays and bulk upsert."""
    try:
        with open(args.file) as f:
            data = json.load(f)
    except FileNotFoundError:
        print(f"ERROR: File not found: {args.file}")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON: {e}")
        sys.exit(1)

    nodes_inserted = nodes_updated = edges_inserted = edges_updated = 0

    for node in data.get("nodes", []):
        inserted = upsert_node(db, node)
        if inserted:
            nodes_inserted += 1
        else:
            nodes_updated += 1

    for edge in data.get("edges", []):
        inserted = upsert_edge(db, edge)
        if inserted:
            edges_inserted += 1
        else:
            edges_updated += 1

    print(f"Nodes: {nodes_inserted} inserted, {nodes_updated} updated")
    print(f"Edges: {edges_inserted} inserted, {edges_updated} updated")


def cmd_stats(db, args):
    node_count = db.mapper_nodes.count_documents({})
    edge_count = db.mapper_edges.count_documents({})

    print(f"\nKnowledge Graph Stats")
    print(f"{'='*40}")
    print(f"Total nodes: {node_count}")
    print(f"Total edges: {edge_count}")

    if node_count > 0:
        print(f"\nNodes by type:")
        pipeline = [{"$group": {"_id": "$node_type", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
        for r in db.mapper_nodes.aggregate(pipeline):
            print(f"  {r['_id']:<20}: {r['count']}")

        print(f"\nNodes by layer:")
        pipeline = [{"$group": {"_id": "$layer", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
        for r in db.mapper_nodes.aggregate(pipeline):
            print(f"  {r['_id']:<20}: {r['count']}")

        print(f"\nNodes by module:")
        pipeline = [{"$group": {"_id": "$module", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
        for r in db.mapper_nodes.aggregate(pipeline):
            if r["_id"]:
                print(f"  {r['_id']:<20}: {r['count']}")

    if edge_count > 0:
        print(f"\nEdges by type:")
        pipeline = [{"$group": {"_id": "$edge_type", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}]
        for r in db.mapper_edges.aggregate(pipeline):
            print(f"  {r['_id']:<20}: {r['count']}")

    print(f"{'='*40}\n")


def cmd_query(db, args):
    """Query nodes by various filters."""
    query = {}
    if args.module:
        query["module"] = args.module
    if args.layer:
        query["layer"] = args.layer
    if args.node_type:
        query["node_type"] = args.node_type

    nodes = list(db.mapper_nodes.find(query, {"_id": 0}).sort("name", 1))
    print(f"\nFound {len(nodes)} nodes:")
    for n in nodes:
        exp = ", ".join(n.get("exports", []))[:60]
        print(f"  [{n.get('node_type','?')}] {n['name']:<40} {n.get('file_path','')}")
        if n.get("description"):
            print(f"    → {n['description']}")


def main():
    parser = argparse.ArgumentParser(description="Codebase Mapper Knowledge Store")
    subparsers = parser.add_subparsers(dest="command", required=True)

    # node
    node_p = subparsers.add_parser("node", help="Insert or update a node")
    node_p.add_argument("--node-id", required=True)
    node_p.add_argument("--node-type", choices=list(VALID_NODE_TYPES), default="file")
    node_p.add_argument("--name")
    node_p.add_argument("--file")
    node_p.add_argument("--line", type=int)
    node_p.add_argument("--module")
    node_p.add_argument("--layer", choices=list(VALID_LAYERS))
    node_p.add_argument("--exports", help="Comma-separated list of exports")
    node_p.add_argument("--description")

    # edge
    edge_p = subparsers.add_parser("edge", help="Insert or update an edge")
    edge_p.add_argument("--source", required=True, dest="source")
    edge_p.add_argument("--target", required=True, dest="target")
    edge_p.add_argument("--type", required=True, choices=list(VALID_EDGE_TYPES))
    edge_p.add_argument("--source-file")
    edge_p.add_argument("--target-file")
    edge_p.add_argument("--context")

    # batch
    batch_p = subparsers.add_parser("batch", help="Bulk load from JSON file")
    batch_p.add_argument("--file", required=True, help="JSON file with nodes/edges arrays")

    # stats
    subparsers.add_parser("stats", help="Show knowledge graph stats")

    # query
    query_p = subparsers.add_parser("query", help="Query nodes")
    query_p.add_argument("--module")
    query_p.add_argument("--layer")
    query_p.add_argument("--node-type")

    args = parser.parse_args()
    client, db = get_db()

    try:
        dispatch = {
            "node": cmd_node,
            "edge": cmd_edge,
            "batch": cmd_batch,
            "stats": cmd_stats,
            "query": cmd_query,
        }
        dispatch[args.command](db, args)
    finally:
        client.close()


if __name__ == "__main__":
    main()
