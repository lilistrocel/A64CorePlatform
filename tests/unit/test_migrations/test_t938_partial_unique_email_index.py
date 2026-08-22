"""
Unit tests for the pre-flight duplicate-detection logic in
scripts/migrations/t938_partial_unique_email_index.py.

This migration replaces the full unique index on `users.email` with a
partial one scoped to live (deletedAt: null) users. Before touching any
index, it refuses to run if two or more LIVE users already share an email
— dropping the old full index while such a duplicate exists would remove
the only thing currently preventing a third live duplicate, corrupting the
invariant the migration exists to preserve.

Only `find_live_duplicate_emails` is exercised here, against a small
in-memory fake that implements just the one aggregation pipeline this
function issues (match deletedAt: null -> group by email, counting -> keep
groups with count > 1). No live database, no `run_migration()` (which owns
its own `AsyncIOMotorClient` and connects to `MONGODB_URL` — out of scope
for a unit test; the parent session runs the real script by hand after
review, never this test suite).
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from scripts.migrations.t938_partial_unique_email_index import (
    find_live_duplicate_emails,
)

# ---------------------------------------------------------------------------
# Minimal in-memory fake — supports exactly the one pipeline
# find_live_duplicate_emails builds: $match deletedAt: null, $group by
# email counting + collecting userIds, $match count > 1.
# ---------------------------------------------------------------------------


class _FakeAggregateCursor:
    def __init__(self, results: List[Dict[str, Any]]) -> None:
        self._results = results

    async def to_list(self, length: Any = None) -> List[Dict[str, Any]]:
        return self._results


class _FakeUsersCollection:
    def __init__(self, docs: List[Dict[str, Any]]) -> None:
        self._docs = docs

    def aggregate(self, pipeline: List[Dict[str, Any]]) -> _FakeAggregateCursor:
        live = [d for d in self._docs if d.get("deletedAt") is None]

        groups: Dict[str, Dict[str, Any]] = {}
        for doc in live:
            email = doc["email"]
            group = groups.setdefault(email, {"_id": email, "count": 0, "userIds": []})
            group["count"] += 1
            group["userIds"].append(doc.get("userId"))

        duplicates = [g for g in groups.values() if g["count"] > 1]
        return _FakeAggregateCursor(duplicates)


def _user(email: str, user_id: str, deleted: bool = False) -> Dict[str, Any]:
    return {
        "userId": user_id,
        "email": email,
        "deletedAt": "2026-01-01T00:00:00" if deleted else None,
    }


@pytest.mark.asyncio
async def test_no_duplicates_among_live_users_returns_empty() -> None:
    collection = _FakeUsersCollection(
        [
            _user("a@example.com", "u1"),
            _user("b@example.com", "u2"),
            _user("c@example.com", "u3"),
        ]
    )

    duplicates = await find_live_duplicate_emails(collection)

    assert duplicates == []


@pytest.mark.asyncio
async def test_two_live_users_sharing_an_email_are_flagged() -> None:
    collection = _FakeUsersCollection(
        [
            _user("dup@example.com", "u1"),
            _user("dup@example.com", "u2"),
            _user("unique@example.com", "u3"),
        ]
    )

    duplicates = await find_live_duplicate_emails(collection)

    assert len(duplicates) == 1
    assert duplicates[0]["_id"] == "dup@example.com"
    assert duplicates[0]["count"] == 2
    assert sorted(duplicates[0]["userIds"]) == ["u1", "u2"]


@pytest.mark.asyncio
async def test_soft_deleted_user_sharing_email_with_live_user_is_not_flagged() -> None:
    """
    This is the exact shape the migration is meant to legalize: one live
    user and one soft-deleted tombstone on the same email must NOT block
    the migration — only two or more LIVE users sharing an email should.
    """
    collection = _FakeUsersCollection(
        [
            _user("was-deleted@example.com", "u1", deleted=True),
            _user("was-deleted@example.com", "u2", deleted=False),
        ]
    )

    duplicates = await find_live_duplicate_emails(collection)

    assert duplicates == []


@pytest.mark.asyncio
async def test_three_live_users_sharing_an_email_all_listed() -> None:
    collection = _FakeUsersCollection(
        [
            _user("triple@example.com", "u1"),
            _user("triple@example.com", "u2"),
            _user("triple@example.com", "u3"),
        ]
    )

    duplicates = await find_live_duplicate_emails(collection)

    assert len(duplicates) == 1
    assert duplicates[0]["count"] == 3
    assert sorted(duplicates[0]["userIds"]) == ["u1", "u2", "u3"]
