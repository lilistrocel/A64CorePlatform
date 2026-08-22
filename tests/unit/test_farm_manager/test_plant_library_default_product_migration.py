"""
Unit tests for the Plant Library default-product seeding migration
(scripts/migrations/plant_library_default_product_migration.py — see design
doc Docs/2-Working-Progress/plant-library-product-extension-design.md §8
step 1).

No live database — a minimal hand-rolled Motor-collection-shaped fake
(mirrors the pattern used by tests/unit/test_genetics/test_line_purge.py;
no mongomock in requirements.txt), extended just enough to support this
migration's queries: a plain-equality `find()` for `deletedAt: None`, and an
`update_one()` whose filter includes `$or` over `{"products": {"$exists":
False}}` / `{"products": {"$size": 0}}` — the concurrent-write guard the
migration uses at write time.

Test cases:
    1. seed run: a mother with no `products` key gets exactly one product
       seeded, matching the mother's plantName / category=sellable /
       unit=kg / isActive=True, with a deterministic productId.
    2. idempotency: running the (real, --execute) migration TWICE against
       the same fake database seeds on the first pass and reports 100%
       skipped with zero writes on the second pass — the exact guarantee
       the task requires.
    3. a mother that already has a product (seeded by this migration or
       added by a human) is skipped, not appended to — products array
       length stays 1, not 2.
    4. deletedAt is respected: a soft-deleted mother is never touched.
    5. a mother with `organizationId: null` is still seeded (logged, not
       blocked) — covers the real data's one such row.
    6. dry-run makes no writes at all.
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

import pytest

from scripts.migrations.plant_library_default_product_migration import (
    product_id_for_mother,
    run_migration,
    _seed_default_products,
)

# ---------------------------------------------------------------------------
# Minimal Motor-collection-shaped fake
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, clause) for clause in expected):
                return False
            continue

        actual = doc.get(key)

        if isinstance(expected, dict) and "$exists" in expected:
            present = key in doc
            if present != expected["$exists"]:
                return False
            continue

        if isinstance(expected, dict) and "$size" in expected:
            if not isinstance(actual, list) or len(actual) != expected["$size"]:
                return False
            continue

        if isinstance(expected, dict) and "$ne" in expected:
            if actual == expected["$ne"]:
                return False
            continue

        if actual != expected:
            return False
    return True


class _AsyncCursor:
    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = list(items)

    def __aiter__(self) -> "_AsyncCursor":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


class _UpdateResult:
    def __init__(self, matched_count: int) -> None:
        self.matched_count = matched_count
        self.modified_count = matched_count


class _FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None) -> None:
        # Reason: store independent copies so mutating one test's fixture
        # dict after seeding never leaks into the fake's internal state.
        self.docs = [dict(d) for d in (docs or [])]

    def find(self, query: Optional[Dict[str, Any]] = None) -> _AsyncCursor:
        query = query or {}
        return _AsyncCursor([dict(d) for d in self.docs if _matches(d, query)])

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> _UpdateResult:
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update.get("$set", {}))
                return _UpdateResult(matched_count=1)
        return _UpdateResult(matched_count=0)


class _FakeDB:
    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def seed(self, name: str, docs: List[Dict[str, Any]]) -> None:
        self._collections[name] = _FakeCollection(docs)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _mother(**overrides: Any) -> Dict[str, Any]:
    defaults: Dict[str, Any] = dict(
        plantMotherId=str(uuid.uuid4()),
        plantName="Potato",
        organizationId="00000000-0000-0000-0000-000000000001",
        deletedAt=None,
    )
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestSeeding:
    @pytest.mark.asyncio
    async def test_seeds_one_matching_product_for_a_mother_with_no_products(self):
        mother = _mother(plantName="Cabbage")
        db = _FakeDB()
        db.seed("plant_mothers", [mother])

        stats = await _seed_default_products(db, dry_run=False)

        assert stats["seeded"] == 1
        assert stats["skipped_already_has_products"] == 0

        updated = db["plant_mothers"].docs[0]
        assert len(updated["products"]) == 1
        product = updated["products"][0]
        assert product["name"] == "Cabbage"
        assert product["category"] == "sellable"
        assert product["unit"] == "kg"
        assert product["isActive"] is True
        assert product["productId"] == str(
            product_id_for_mother(mother["plantMotherId"])
        )

    @pytest.mark.asyncio
    async def test_dry_run_makes_no_writes(self):
        mother = _mother()
        db = _FakeDB()
        db.seed("plant_mothers", [mother])

        stats = await _seed_default_products(db, dry_run=True)

        assert stats["seeded"] == 1
        assert "products" not in db["plant_mothers"].docs[0]

    @pytest.mark.asyncio
    async def test_deleted_mother_is_never_touched(self):
        import datetime

        mother = _mother(deletedAt=datetime.datetime.utcnow())
        db = _FakeDB()
        db.seed("plant_mothers", [mother])

        stats = await _seed_default_products(db, dry_run=False)

        assert stats["seeded"] == 0
        assert stats["skipped_already_has_products"] == 0
        assert "products" not in db["plant_mothers"].docs[0]

    @pytest.mark.asyncio
    async def test_null_organization_id_still_gets_seeded(self):
        mother = _mother(organizationId=None)
        db = _FakeDB()
        db.seed("plant_mothers", [mother])

        stats = await _seed_default_products(db, dry_run=False)

        assert stats["seeded"] == 1
        assert len(db["plant_mothers"].docs[0]["products"]) == 1


class TestIdempotency:
    @pytest.mark.asyncio
    async def test_mother_with_existing_product_is_skipped_not_appended(self):
        existing_product = {
            "productId": str(uuid.uuid4()),
            "name": "Manually added product",
            "unit": "kg",
            "category": "process",
            "isActive": True,
        }
        mother = _mother(products=[existing_product])
        db = _FakeDB()
        db.seed("plant_mothers", [mother])

        stats = await _seed_default_products(db, dry_run=False)

        assert stats["seeded"] == 0
        assert stats["skipped_already_has_products"] == 1
        # Reason: the guarantee under test — a mother with ANY existing
        # product is left with exactly that product, never a second one
        # appended alongside it.
        updated = db["plant_mothers"].docs[0]
        assert len(updated["products"]) == 1
        assert updated["products"][0] == existing_product

    @pytest.mark.asyncio
    async def test_full_migration_run_twice_is_a_no_op_on_the_second_pass(self):
        """
        The exact guarantee the task requires: running the real (--execute)
        migration a second time against a database it already fully seeded
        reports everything skipped and nothing seeded.
        """
        mothers = [_mother(plantName=f"Crop{i}") for i in range(5)]
        db = _FakeDB()
        db.seed("plant_mothers", mothers)

        first_pass = await _seed_default_products(db, dry_run=False)
        assert first_pass["seeded"] == 5
        assert first_pass["skipped_already_has_products"] == 0

        snapshot_after_first_pass = [
            dict(d) for d in db["plant_mothers"].docs
        ]

        second_pass = await _seed_default_products(db, dry_run=False)
        assert second_pass["seeded"] == 0
        assert second_pass["skipped_already_has_products"] == 5

        # Reason: not just the counters — the documents themselves must be
        # byte-for-byte unchanged by the no-op second pass.
        assert db["plant_mothers"].docs == snapshot_after_first_pass

    @pytest.mark.asyncio
    async def test_product_id_is_deterministic_across_reissue(self):
        mother_id = str(uuid.uuid4())
        first = product_id_for_mother(mother_id)
        second = product_id_for_mother(mother_id)
        assert first == second
        assert isinstance(first, uuid.UUID)


class TestRunMigrationOrchestration:
    @pytest.mark.asyncio
    async def test_run_migration_dry_run_summary_shape(self, monkeypatch):
        """
        run_migration() opens its own AsyncIOMotorClient — patch the client
        constructor so this test still exercises the real orchestration
        function (env var reads, summary shape) without touching a real
        Mongo connection.
        """
        import scripts.migrations.plant_library_default_product_migration as mod

        db = _FakeDB()
        db.seed("plant_mothers", [_mother()])

        class _FakeClient:
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                pass

            def __getitem__(self, name: str) -> _FakeDB:
                return db

            def close(self) -> None:
                pass

        monkeypatch.setattr(mod, "AsyncIOMotorClient", _FakeClient)

        summary = await run_migration(dry_run=True)

        assert summary["dry_run"] is True
        assert summary["products"]["seeded"] == 1
