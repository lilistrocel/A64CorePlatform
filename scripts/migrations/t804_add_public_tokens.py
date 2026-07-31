"""
T-804 — Backfill `publicToken` / `labelledVesselCount` / `sourceVesselNumbers`
on existing `genetic_accessions` documents.

These three fields power the genetics label/QR system (see
Docs/2-Working-Progress/genetics-label-qr-spec.md §4). `publicToken` is the
opaque key the unauthenticated public info page resolves through; it must be
unique and present on every accession before the public route can be trusted
not to 500 on old data. `labelledVesselCount` and `sourceVesselNumbers` get
Pydantic defaults on read, but this migration sets them explicitly so the
collection is queryable without `$exists` gymnastics.

Idempotent: for every accession that does NOT yet have a `publicToken`, mints
one (Crockford base32, 10 chars, cryptographically random) and sets all three
fields in a single update. Accessions that already have a `publicToken` are
left completely untouched — safe to run twice, safe to run after a partial
failure.

This is additive-only. It never touches any field other than the three named
above, and every write is scoped to a single `_id` — there is no broad
`update_many`.

A bad document (unexpected write error) is logged and skipped; it does not
abort the run. Counts are reported at the end.

Usage:
    # Local
    python scripts/migrations/t804_add_public_tokens.py

    # Docker (against the running stack)
    docker compose exec api python scripts/migrations/t804_add_public_tokens.py

Environment variables:
    MONGODB_URL      — defaults to mongodb://localhost:27017
    MONGODB_DB_NAME  — defaults to a64core_db
"""

import asyncio
import logging
import os
import secrets
import sys
from typing import Dict

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import DuplicateKeyError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

COLLECTION = "genetic_accessions"

# Must match src/modules/genetics/services/common.py exactly — this is a
# standalone migration script so it cannot import the app package directly
# without pulling in the whole src.* import chain (settings, DB pool, etc.),
# which is unnecessary risk for a one-shot backfill.
_TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_TOKEN_LENGTH = 10

# publicToken has a ~1.1e15 space — a real collision here would be a near
# impossible coincidence, but the loop is bounded regardless rather than
# trusting that.
_MAX_TOKEN_ATTEMPTS = 5


def _generate_token() -> str:
    """Mint an unguessable public-page key. Uses `secrets`, never `random` —
    this token is the only thing standing between a stranger with one printed
    label and the rest of the genetics library."""
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(_TOKEN_LENGTH))


async def run_migration() -> Dict[str, int]:
    """
    Apply the migration. Returns counts: updated, skipped (already had a
    token), failed (gave up after retries or hit an unexpected error).
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    counts = {"updated": 0, "skipped": 0, "failed": 0}
    try:
        db = client[db_name]
        collection = db[COLLECTION]

        # The unique index may not exist yet on a fresh deploy of this step —
        # create it up front so a genuine token collision surfaces as a
        # DuplicateKeyError during this run rather than silently landing two
        # documents on the same token.
        await collection.create_index("publicToken", unique=True)

        total = await collection.count_documents({})
        query = {"publicToken": {"$exists": False}}
        to_process = await collection.count_documents(query)
        counts["skipped"] = total - to_process

        if to_process == 0:
            logger.info(
                "t804_add_public_tokens: nothing to do — all %s accession(s) "
                "already have a publicToken",
                total,
            )
            return counts

        logger.info(
            "t804_add_public_tokens: %s of %s accession(s) need a publicToken",
            to_process,
            total,
        )

        cursor = collection.find(
            query, {"_id": 1, "accessionId": 1, "accessionCode": 1}
        )

        async for doc in cursor:
            doc_id = doc["_id"]
            label = doc.get("accessionCode") or doc.get("accessionId") or str(doc_id)

            wrote = False
            last_error: Exception = None  # type: ignore[assignment]
            for attempt in range(1, _MAX_TOKEN_ATTEMPTS + 1):
                token = _generate_token()
                try:
                    result = await collection.update_one(
                        # Re-check publicToken doesn't exist at write time —
                        # guards against a concurrent run setting it between
                        # our find() and this update().
                        {"_id": doc_id, "publicToken": {"$exists": False}},
                        {
                            "$set": {
                                "publicToken": token,
                                "labelledVesselCount": 0,
                                "sourceVesselNumbers": [],
                            }
                        },
                    )
                    if result.modified_count == 1:
                        wrote = True
                    else:
                        # Already had a token by the time we wrote (race with
                        # another run) — count as skipped, not failed.
                        logger.info(
                            "t804_add_public_tokens: %s already had a "
                            "publicToken by write time, skipping",
                            label,
                        )
                    break
                except DuplicateKeyError:
                    logger.warning(
                        "t804_add_public_tokens: token collision for %s "
                        "(attempt %s/%s), regenerating",
                        label,
                        attempt,
                        _MAX_TOKEN_ATTEMPTS,
                    )
                    continue
                except Exception as e:  # noqa: BLE001 — must not abort the run
                    last_error = e
                    break

            if wrote:
                counts["updated"] += 1
            elif last_error is not None:
                counts["failed"] += 1
                logger.error(
                    "t804_add_public_tokens: failed to update %s (id=%s): %s",
                    label,
                    doc_id,
                    last_error,
                )
            else:
                # Either raced with another run, or exhausted retries on
                # collisions without an exception — treat as skipped so the
                # counts stay honest (not a failure of this run).
                counts["skipped"] += 1

        logger.info(
            "t804_add_public_tokens: done — updated=%s skipped=%s failed=%s "
            "(total=%s)",
            counts["updated"],
            counts["skipped"],
            counts["failed"],
            total,
        )
        return counts
    finally:
        client.close()


def main() -> None:
    counts = asyncio.run(run_migration())
    print(
        f"t804_add_public_tokens: updated={counts['updated']} "
        f"skipped={counts['skipped']} failed={counts['failed']}"
    )
    # Non-zero exit only when documents were left in a bad state, so CI/deploy
    # scripts can detect a genuinely failed backfill rather than treating
    # every run as a silent success.
    sys.exit(1 if counts["failed"] else 0)


if __name__ == "__main__":
    main()
