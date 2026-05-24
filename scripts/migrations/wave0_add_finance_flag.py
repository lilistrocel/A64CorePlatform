"""
Wave 0 — Add per-tenant `modules.financeEnabled` flag to organizations.

Idempotent. Run once at deploy time, before the new backend rolls.

For every existing organization that does not yet have
`modules.financeEnabled` set, sets it to `true`. Organizations that
already have a value (true OR false) are left untouched.

Usage:
    # Local
    python scripts/migrations/wave0_add_finance_flag.py

    # Docker (against the running stack)
    docker compose exec api python scripts/migrations/wave0_add_finance_flag.py

Environment variables:
    MONGODB_URL      — defaults to mongodb://localhost:27017
    MONGODB_DB_NAME  — defaults to a64core_db
"""

import asyncio
import logging
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


async def run_migration() -> int:
    """
    Apply the migration. Returns the number of organizations updated.
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    try:
        db = client[db_name]
        collection = db["organizations"]

        # Reason: $exists:false misses orgs where `modules` exists but
        # `modules.financeEnabled` doesn't. We match both cases.
        query = {
            "$or": [
                {"modules": {"$exists": False}},
                {"modules.financeEnabled": {"$exists": False}},
            ]
        }
        update = {"$set": {"modules.financeEnabled": True}}

        # Count first so the log shows the impact even on a no-op run.
        to_update = await collection.count_documents(query)
        if to_update == 0:
            logger.info(
                "wave0_add_finance_flag: nothing to do — every org already "
                "has modules.financeEnabled set"
            )
            return 0

        result = await collection.update_many(query, update)
        logger.info(
            "wave0_add_finance_flag: matched=%s modified=%s",
            result.matched_count,
            result.modified_count,
        )
        return result.modified_count
    finally:
        client.close()


def main() -> None:
    modified = asyncio.run(run_migration())
    # Exit 0 always (idempotent) — non-zero count is informational.
    print(f"wave0_add_finance_flag: updated {modified} organization(s)")
    sys.exit(0)


if __name__ == "__main__":
    main()
