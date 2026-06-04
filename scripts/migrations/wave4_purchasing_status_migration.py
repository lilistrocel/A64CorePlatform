"""
Wave 4 — T-200.21: Purchasing document status vocabulary migration.

Converts the ``status`` field in the ``document_headers`` collection for all
purchasing document types (PR, PO, GR, AP) from the legacy TitleCase strings
to the shared ``DocumentStatus`` lowercase_snake vocabulary.

REQUIRED before the updated API container starts.  Run this migration AFTER
the new code is deployed but BEFORE the api service restarts.

Conversion table applied
------------------------
    "Draft"            → "draft"
    "Pending Approval" → "pending_approval"
    "Approved"         → "open"          (purchasing "Approved" = shared "open")
    "Open"             → "open"
    "Partly Closed"    → "partly_closed"
    "Closed"           → "closed"
    "Cancelled"        → "cancelled"
    "Posted"           → "open"          (GR "Posted" = shared "open")

NOT converted (purchasing-internal states with no shared enum equivalent)
---------
    "Rejected"         — kept as-is (PR rejection path, Wave 4 gap)
    "Sent"             — kept as-is (PO sent-to-vendor path, Wave 4 gap)
    "Partially Received" — kept as-is (PO fulfillment string)
    "Received"         — kept as-is (PO fulfillment string)

Idempotent: documents already storing a lowercase_snake value are skipped.
Running this script twice produces the same result as running it once.

Usage
-----
    # Local (ensure MONGODB_URL and MONGODB_DB_NAME point to the right instance)
    python scripts/migrations/wave4_purchasing_status_migration.py

    # Docker (against the running stack)
    docker compose exec api python scripts/migrations/wave4_purchasing_status_migration.py

Environment variables
---------------------
    MONGODB_URL      — defaults to mongodb://localhost:27017
    MONGODB_DB_NAME  — defaults to a64core_db
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from typing import Dict, List

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Migration vocabulary map
# Only keys that exist in MongoDB need to be here. Values that do not appear
# as keys are left untouched (e.g. "Rejected", "Sent").
# ---------------------------------------------------------------------------

_CONVERT: Dict[str, str] = {
    "Draft": "draft",
    "Pending Approval": "pending_approval",
    "Approved": "open",
    "Open": "open",
    "Partly Closed": "partly_closed",
    "Closed": "closed",
    "Cancelled": "cancelled",
    "Posted": "open",
}

# Document types stored in document_headers that are owned by the purchasing
# module.  The "AP" discriminator is what document_service.py writes —
# not "AP_INVOICE".
_PURCHASING_DOC_TYPES: List[str] = ["PR", "PO", "GR", "AP"]


async def run_migration() -> Dict[str, Dict[str, int]]:
    """
    Apply the status vocabulary migration to all purchasing documents.

    Returns a nested dict: { doc_type: { old_value: count_converted } }
    so callers can log a per-type summary.

    Raises:
        RuntimeError: If MongoDB connection fails.
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]
        collection = db["document_headers"]

        summary: Dict[str, Dict[str, int]] = {}

        for doc_type in _PURCHASING_DOC_TYPES:
            summary[doc_type] = {}
            type_total = 0

            for old_value, new_value in _CONVERT.items():
                # Reason: Only update docs that still have the legacy value.
                # Docs already migrated (lowercase) match neither key and are
                # skipped automatically — this is the idempotency guarantee.
                query = {
                    "docType": doc_type,
                    "status": old_value,
                    "deletedAt": None,
                }
                to_convert = await collection.count_documents(query)
                if to_convert == 0:
                    continue

                result = await collection.update_many(
                    query,
                    {"$set": {"status": new_value}},
                )
                converted = result.modified_count
                summary[doc_type][old_value] = converted
                type_total += converted
                logger.info(
                    "wave4_purchasing_status_migration: "
                    "docType=%s  '%s' → '%s'  converted=%d",
                    doc_type,
                    old_value,
                    new_value,
                    converted,
                )

            if type_total == 0:
                logger.info(
                    "wave4_purchasing_status_migration: "
                    "docType=%s  nothing to convert (already migrated or empty)",
                    doc_type,
                )

        return summary
    finally:
        client.close()


def main() -> None:
    summary = asyncio.run(run_migration())

    grand_total = sum(
        count
        for doc_counts in summary.values()
        for count in doc_counts.values()
    )

    if grand_total == 0:
        print(
            "wave4_purchasing_status_migration: "
            "0 documents converted — already up to date."
        )
    else:
        print(
            f"wave4_purchasing_status_migration: "
            f"converted {grand_total} document(s) across "
            f"{len([dt for dt, c in summary.items() if c])} doc type(s)."
        )
        for doc_type, conversions in summary.items():
            if conversions:
                for old_val, count in conversions.items():
                    print(f"  {doc_type}: '{old_val}' → converted {count}")

    # Exit 0 always — the migration is idempotent and a zero-convert run is
    # not an error.
    sys.exit(0)


if __name__ == "__main__":
    main()
