"""
T-938 — Replace the full unique index on `users.email` with a partial
unique index scoped to LIVE users only.

Bug this fixes
---------------
`users` has always carried a plain unique index (`email_1`, no partial
filter), and `delete_user` (src/api/v1/admin.py) is a SOFT delete: it sets
`deletedAt` + `isActive: False` and leaves the document in place. The two
login paths then disagreed about what a soft-deleted user means:

  - Cloudflare Access login (`AuthService.login_via_cf_access`) used to
    filter its lookup to `deletedAt: None`, making a soft-deleted user
    invisible, then JIT-provisioned a brand-new document with the SAME
    email. `email_1` rejected the insert with `DuplicateKeyError`, and
    there was no try/except, so it propagated as an unhandled 500 on
    `POST /api/v1/auth/cf-access/session`.
  - Password registration (`AuthService.register_user`) queries by email
    with no `deletedAt` filter, finds the tombstone, and correctly returns
    409 "Email already registered" — never resurrects, never crashes.

`src/services/auth_service.py` was fixed to stop the 500 (the CF lookup no
longer filters `deletedAt`, and the JIT insert is wrapped in
`except DuplicateKeyError` as defense in depth) — but the underlying schema
still forbids reusing a deleted email at all, forever. This migration is
the actual fix for that: replace `email_1` with

    unique=True, partialFilterExpression={"deletedAt": None}

so uniqueness is enforced only among live users, and a deleted email
becomes reusable by a genuinely new account.

`src/services/database.py`'s `MongoDBManager._create_indexes` (runs on
every API boot) has been updated in the same change to create this same
partial index under the name `email_live_unique` — deliberately NOT named
`email_1`, so it can coexist with the not-yet-dropped old index without a
name collision on a database this migration hasn't touched yet. Both this
script and that boot-time call target the identical name/keys/options, so
whichever runs second is a no-op against what the first already created.

Ordering — why create-then-drop, never drop-then-create
---------------------------------------------------------
The new partial index is created FIRST; the old `email_1` is dropped
SECOND. This is the only order under which the collection is never left
without a uniqueness guarantee on live emails: from the moment this script
starts to the moment it finishes, either the old full index, the new
partial index, or both are protecting live-email uniqueness. Reversing the
order would open a window — however small — where nothing on the server
enforces the invariant at all, during which a concurrent write (any live
process, not just this script) could insert a genuine duplicate live email
that neither index would then be able to reject.

Pre-flight duplicate check
---------------------------
Before touching any index, this script refuses to run if two or more LIVE
(`deletedAt: null`) users already share an email — creating the partial
unique index would fail outright in that case, but more importantly,
dropping the old full index while such a duplicate exists would corrupt
the very invariant this migration exists to preserve. Offending emails are
printed so an operator can resolve them by hand before re-running.

Idempotency
-----------
Safe to run any number of times:
  - The pre-flight check is read-only.
  - Creating an index that already exists (identical name + keys +
    options) is a no-op in MongoDB.
  - Dropping an index that no longer exists (already migrated) is caught
    and treated as already-done, not an error.

Usage
-----
    # Dry run — the SAFE, DEFAULT behavior. No flags, or --dry-run
    # explicitly, both print the pre-flight result and the current index
    # state without creating or dropping anything.
    docker compose exec api python scripts/migrations/t938_partial_unique_email_index.py
    docker compose exec api python scripts/migrations/t938_partial_unique_email_index.py --dry-run

    # Real run — requires the explicit --execute flag:
    docker compose exec api python scripts/migrations/t938_partial_unique_email_index.py --execute

    # Host-side testing (Mongo on this box runs as a replica set advertising
    # the internal hostname `mongodb` — a host-side client needs
    # directConnection):
    MONGODB_URL="mongodb://localhost:27017/?directConnection=true" \\
        python scripts/migrations/t938_partial_unique_email_index.py --dry-run

Environment variables
----------------------
    MONGODB_URL      — full connection string. Defaults to
                        mongodb://localhost:27017 (no credentials — this DB
                        does not require them for local/dev access).
    MONGODB_DB_NAME  — defaults to a64core_db

CRITICAL: do not run --execute against a live deployment without the
operator's own review and a fresh backup — this changes a uniqueness
constraint on the primary account collection.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection
from pymongo.errors import OperationFailure

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

COLLECTION = "users"
OLD_INDEX_NAME = "email_1"
NEW_INDEX_NAME = "email_live_unique"
LIVE_FILTER = {"deletedAt": None}


async def find_live_duplicate_emails(
    collection: AsyncIOMotorCollection,
) -> List[Dict[str, Any]]:
    """
    Find any email shared by two or more LIVE (deletedAt: null) users.

    Args:
        collection: the `users` collection (or a test double exposing an
            async `aggregate(pipeline)` returning a cursor with
            `.to_list(length=None)`).

    Returns:
        A list of `{"_id": <email>, "count": <int>, "userIds": [...]}`
        dicts, one per duplicated email. Empty if no live duplicates exist.
    """
    pipeline = [
        {"$match": LIVE_FILTER},
        {
            "$group": {
                "_id": "$email",
                "count": {"$sum": 1},
                "userIds": {"$push": "$userId"},
            }
        },
        {"$match": {"count": {"$gt": 1}}},
    ]
    cursor = collection.aggregate(pipeline)
    return await cursor.to_list(length=None)


async def _print_index_state(collection: AsyncIOMotorCollection, label: str) -> None:
    print(f"users index state — {label}:")
    info = await collection.index_information()
    for name, spec in sorted(info.items()):
        keys = spec.get("key")
        unique = spec.get("unique", False)
        partial = spec.get("partialFilterExpression")
        bits = [f"keys={keys}"]
        if unique:
            bits.append("unique=True")
        if partial is not None:
            bits.append(f"partialFilterExpression={partial}")
        print(f"  - {name}: {', '.join(bits)}")
    print()


async def run_migration(dry_run: bool = True) -> Dict[str, Any]:
    """
    Apply (or, if dry_run, only report on) the email_1 -> partial unique
    index cutover.

    Args:
        dry_run: When True (the default), performs the pre-flight check
            and prints the current index state, but creates and drops
            nothing.

    Returns:
        Summary dict: {"dry_run", "duplicates", "aborted", "created",
        "dropped"}.
    """
    mongo_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB_NAME", "a64core_db")

    client = AsyncIOMotorClient(mongo_url)
    summary: Dict[str, Any] = {
        "dry_run": dry_run,
        "duplicates": [],
        "aborted": False,
        "created": False,
        "dropped": False,
    }
    try:
        db = client[db_name]
        collection = db[COLLECTION]

        logger.info(
            "t938_partial_unique_email_index: starting (dry_run=%s) against " "db=%s",
            dry_run,
            db_name,
        )

        # Pre-flight: refuse to touch any index if two live users already
        # share an email. Creating the partial unique index would fail on
        # its own in that case, but the real danger is dropping the OLD
        # full index while such a duplicate exists — that would remove the
        # only thing currently preventing a third live duplicate, and
        # corrupt the invariant this migration exists to preserve.
        duplicates = await find_live_duplicate_emails(collection)
        summary["duplicates"] = duplicates
        if duplicates:
            summary["aborted"] = True
            print(
                "t938_partial_unique_email_index: ABORTED — found "
                f"{len(duplicates)} email(s) shared by two or more LIVE "
                "users. Resolve these by hand (merge, rename, or soft-"
                "delete the extras) before re-running:"
            )
            for dup in duplicates:
                print(
                    f"  - {dup['_id']!r}: {dup['count']} live users, "
                    f"userIds={dup['userIds']}"
                )
            return summary

        logger.info(
            "t938_partial_unique_email_index: pre-flight OK — no live "
            "email is shared by more than one user"
        )

        await _print_index_state(collection, "BEFORE")

        if dry_run:
            print(
                "t938_partial_unique_email_index: DRY RUN — would create "
                f"'{NEW_INDEX_NAME}' (unique, partialFilterExpression="
                f"{LIVE_FILTER}) and then drop '{OLD_INDEX_NAME}' if "
                "present. No changes made."
            )
            return summary

        # Step 1: create the new partial unique index FIRST. It can
        # coexist with the old full index (same keys, different options,
        # different name — MongoDB allows this). create_index is a no-op
        # if an identical index already exists under this name, which is
        # what makes re-running this script after a successful --execute
        # safe.
        await collection.create_index(
            "email",
            unique=True,
            partialFilterExpression=LIVE_FILTER,
            name=NEW_INDEX_NAME,
        )
        summary["created"] = True
        logger.info("t938_partial_unique_email_index: created '%s'", NEW_INDEX_NAME)

        # Step 2: drop the old full unique index SECOND — only now that
        # live-email uniqueness is already guaranteed by the new partial
        # index. If it's already gone (a prior --execute run), that's the
        # already-migrated state; treat it as success, not an error.
        try:
            await collection.drop_index(OLD_INDEX_NAME)
            summary["dropped"] = True
            logger.info("t938_partial_unique_email_index: dropped '%s'", OLD_INDEX_NAME)
        except OperationFailure as exc:
            if "index not found" in str(exc).lower():
                logger.info(
                    "t938_partial_unique_email_index: '%s' already absent "
                    "— already migrated",
                    OLD_INDEX_NAME,
                )
            else:
                raise

        await _print_index_state(collection, "AFTER")

        return summary
    finally:
        client.close()


def _print_summary(summary: Dict[str, Any]) -> None:
    if summary["aborted"]:
        print("t938_partial_unique_email_index: ABORTED (pre-flight failed)")
        return

    mode = (
        "DRY RUN (no writes made)" if summary["dry_run"] else "EXECUTED (writes made)"
    )
    print(f"t938_partial_unique_email_index: {mode}")
    print(f"  created '{NEW_INDEX_NAME}': {summary['created']}")
    print(f"  dropped '{OLD_INDEX_NAME}':  {summary['dropped']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "T-938 — replace the full unique index on users.email with a "
            "partial unique index scoped to live (deletedAt: null) users, "
            "so a soft-deleted user's email can be reused."
        )
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Actually create/drop indexes. Without this flag, the script "
            "ALWAYS runs in dry-run mode (the default) and only reports "
            "the pre-flight result and current index state."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help=(
            "Explicit alias for the default (no-write) behavior. Identical "
            "to omitting --execute; provided for discoverability."
        ),
    )
    args = parser.parse_args()

    dry_run = not args.execute

    summary = asyncio.run(run_migration(dry_run=dry_run))
    _print_summary(summary)


if __name__ == "__main__":
    main()
