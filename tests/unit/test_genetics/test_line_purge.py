"""
Unit tests for the genetics line purge feature (T-807).

Bug this closes: ``LineService.deactivate_line()`` was the only removal path
— a soft delete. There was no way to remove a line created by mistake, a
typo, or a test, because hard deletion was "deliberately unsupported" (the
old docstring's words) on the grounds that accessions and propagation events
reference the line. That reasoning is correct for a line WITH material, but
it left no path at all for one that never had any.

This suite covers the fix, which follows the existing
``RoomService.room_dependents()`` / ``delete_room()`` precedent in
mushroom_manager exactly: count everything that would be orphaned, and
refuse — never cascade — unless every count is zero.

No live database — the same generic Motor-collection-shaped fake used by
``test_lineage_service.py`` and ``test_public_route.py`` (no mongomock in
requirements.txt), extended here with ``count_documents``, ``delete_one`` and
``update_one`` since this suite needs them and the existing fake did not.

Test cases:
   1.  dependents reports zero across the board for an unused line
   2.  dependents counts accessions accurately
   3.  dependents counts propagation events referencing the line as source
   4.  dependents counts propagation events referencing the line as result
   5.  dependents counts observations accurately
   6.  dependents counts child lines accurately
   7.  dependents counts harvests accurately (cross-module mushroom_harvests)
   8.  purge succeeds on a line with zero dependents and the document is gone
   9.  purge 409s when accessions exist, and the message names the count
  10.  purge 409s when propagation events exist
  11.  purge 409s when observations exist
  12.  purge 409s when child lines exist
  13.  purge 409s when harvests exist
  14.  purge 404s for an unknown line id
  15.  deactivate_line behaviour is unchanged (soft delete, document remains)
  16.  permission: bench role ("user") is rejected from purge; moderator allowed
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import HTTPException

from src.modules.genetics.middleware.auth import require_permission
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.database import (
    ACCESSIONS,
    LINES,
    OBSERVATIONS,
    PROPAGATIONS,
)
from src.modules.genetics.services.line import line_service as line_module
from src.modules.genetics.services.line.line_service import LineService
from src.modules.genetics.models.line import Line
from src.modules.genetics.models.enums import DerivationType, OrganismKind

_LINE_ID_KEY = "lineId"


# ---------------------------------------------------------------------------
# Generic Motor-collection-shaped fake (mirrors test_lineage_service.py),
# extended with count_documents / delete_one / update_one for this suite.
# ---------------------------------------------------------------------------


def _resolve_dotted(doc: Any, dotted_key: str) -> List[Any]:
    current: List[Any] = [doc]
    for part in dotted_key.split("."):
        nxt: List[Any] = []
        for value in current:
            if isinstance(value, dict):
                if part in value:
                    nxt.append(value[part])
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict) and part in item:
                        nxt.append(item[part])
        current = nxt
    return current


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(doc, clause) for clause in expected):
                return False
            continue
        if "." in key:
            actual_values = _resolve_dotted(doc, key)
            if isinstance(expected, dict) and "$ne" in expected:
                if all(v == expected["$ne"] for v in actual_values):
                    return False
            elif expected not in actual_values:
                return False
            continue

        actual = doc.get(key)
        if isinstance(expected, dict) and "$ne" in expected:
            if actual == expected["$ne"]:
                return False
        elif isinstance(actual, list) and not isinstance(expected, list):
            if expected not in actual:
                return False
        elif actual != expected:
            return False
    return True


class _AsyncCursor:
    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = list(items)

    def sort(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def limit(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def skip(self, *args: Any, **kwargs: Any) -> "_AsyncCursor":
        return self

    def __aiter__(self) -> "_AsyncCursor":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


class _FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None) -> None:
        self.docs = list(docs or [])

    async def find_one(self, query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        for doc in self.docs:
            if _matches(doc, query):
                return dict(doc)
        return None

    def find(self, query: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any) -> _AsyncCursor:
        query = query or {}
        return _AsyncCursor([dict(d) for d in self.docs if _matches(d, query)])

    async def count_documents(self, query: Dict[str, Any]) -> int:
        return sum(1 for doc in self.docs if _matches(doc, query))

    async def delete_one(self, query: Dict[str, Any]) -> SimpleNamespace:
        for i, doc in enumerate(self.docs):
            if _matches(doc, query):
                del self.docs[i]
                return SimpleNamespace(deleted_count=1)
        return SimpleNamespace(deleted_count=0)

    async def update_one(self, query: Dict[str, Any], update: Dict[str, Any]) -> SimpleNamespace:
        for doc in self.docs:
            if _matches(doc, query):
                doc.update(update.get("$set", {}))
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)


class _FakeGeneticsDB:
    def __init__(self) -> None:
        self._collections: Dict[str, _FakeCollection] = {}

    def seed(self, name: str, docs: List[Dict[str, Any]]) -> None:
        self._collections[name] = _FakeCollection(docs)

    def __getitem__(self, name: str) -> _FakeCollection:
        return self._collections.setdefault(name, _FakeCollection())

    def __getattr__(self, name: str) -> _FakeCollection:
        # Supports `db.mushroom_harvests.count_documents(...)` — the
        # cross-module attribute-style access LineService.line_dependents
        # uses, mirroring RoomService.room_dependents' own reach into
        # genetic_accessions.
        return self[name]


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    monkeypatch.setattr(line_module.genetics_db, "get_database", lambda: db)
    return db


def _make_line(**overrides: Any) -> Line:
    defaults: Dict[str, Any] = dict(
        code="TEST-LINE",
        commonName="Test Line",
        kind=OrganismKind.FUNGUS,
        derivation=DerivationType.ORIGINAL,
    )
    defaults.update(overrides)
    return Line(**defaults)


def _seed_line(db: _FakeGeneticsDB, line: Line) -> None:
    db.seed(LINES, [model_to_doc(line, _LINE_ID_KEY)])


class _User:
    def __init__(self, role: str = "moderator"):
        self.role = role
        self.userId = "u-purge-test"


# ---------------------------------------------------------------------------
# Dependents — accurate counts per category
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dependents_all_zero_for_unused_line(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)

    deps = await LineService.line_dependents(line.id)

    assert deps == {
        "accessions": 0,
        "propagationEvents": 0,
        "observations": 0,
        "childLines": 0,
        "harvests": 0,
    }


@pytest.mark.asyncio
async def test_dependents_counts_accessions(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        ACCESSIONS,
        [{"accessionId": "a-1", "lineId": line.id}, {"accessionId": "a-2", "lineId": line.id}],
    )

    deps = await LineService.line_dependents(line.id)
    assert deps["accessions"] == 2


@pytest.mark.asyncio
async def test_dependents_counts_propagation_events_as_source(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        PROPAGATIONS,
        [{"eventId": "e-1", "sourceLineIds": [line.id], "resultLineIds": []}],
    )

    deps = await LineService.line_dependents(line.id)
    assert deps["propagationEvents"] == 1


@pytest.mark.asyncio
async def test_dependents_counts_propagation_events_as_result(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        PROPAGATIONS,
        [{"eventId": "e-1", "sourceLineIds": [], "resultLineIds": [line.id]}],
    )

    deps = await LineService.line_dependents(line.id)
    assert deps["propagationEvents"] == 1


@pytest.mark.asyncio
async def test_dependents_counts_observations(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        OBSERVATIONS,
        [{"observationId": "o-1", "lineId": line.id, "accessionId": "a-1"}],
    )

    deps = await LineService.line_dependents(line.id)
    assert deps["observations"] == 1


@pytest.mark.asyncio
async def test_dependents_counts_child_lines(fake_db: _FakeGeneticsDB) -> None:
    parent = _make_line(code="PARENT")
    child = _make_line(code="CHILD", parentLineId=parent.id)
    _seed_line(fake_db, parent)
    fake_db[LINES].docs.append(model_to_doc(child, _LINE_ID_KEY))

    deps = await LineService.line_dependents(parent.id)
    assert deps["childLines"] == 1


@pytest.mark.asyncio
async def test_dependents_counts_harvests(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        "mushroom_harvests",
        [{"harvestId": "h-1", "lineId": line.id}],
    )

    deps = await LineService.line_dependents(line.id)
    assert deps["harvests"] == 1


# ---------------------------------------------------------------------------
# Purge — succeeds only at zero dependents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_purge_succeeds_with_zero_dependents_and_document_is_gone(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_line(fake_db, line)

    result = await LineService.purge_line(line.id, _User())

    assert result["code"] == line.code
    with pytest.raises(HTTPException) as exc:
        await LineService.get_line(line.id)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_purge_409s_when_accessions_exist_and_names_the_count(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        ACCESSIONS,
        [
            {"accessionId": "a-1", "lineId": line.id},
            {"accessionId": "a-2", "lineId": line.id},
            {"accessionId": "a-3", "lineId": line.id},
        ],
    )

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(line.id, _User())

    assert exc.value.status_code == 409
    assert "3 accessions" in exc.value.detail

    # Refused, not cascaded — the line must still exist.
    surviving = await LineService.get_line(line.id)
    assert surviving.id == line.id


@pytest.mark.asyncio
async def test_purge_409s_when_propagation_events_exist(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(
        PROPAGATIONS,
        [{"eventId": "e-1", "sourceLineIds": [line.id], "resultLineIds": []}],
    )

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(line.id, _User())
    assert exc.value.status_code == 409
    assert "1 propagationEvents" in exc.value.detail
    assert await LineService.get_line(line.id) is not None


@pytest.mark.asyncio
async def test_purge_409s_when_observations_exist(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed(OBSERVATIONS, [{"observationId": "o-1", "lineId": line.id}])

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(line.id, _User())
    assert exc.value.status_code == 409
    assert "1 observations" in exc.value.detail
    assert await LineService.get_line(line.id) is not None


@pytest.mark.asyncio
async def test_purge_409s_when_child_lines_exist(fake_db: _FakeGeneticsDB) -> None:
    parent = _make_line(code="PARENT2")
    child = _make_line(code="CHILD2", parentLineId=parent.id)
    _seed_line(fake_db, parent)
    fake_db[LINES].docs.append(model_to_doc(child, _LINE_ID_KEY))

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(parent.id, _User())
    assert exc.value.status_code == 409
    assert "1 childLines" in exc.value.detail
    assert await LineService.get_line(parent.id) is not None


@pytest.mark.asyncio
async def test_purge_409s_when_harvests_exist(fake_db: _FakeGeneticsDB) -> None:
    line = _make_line()
    _seed_line(fake_db, line)
    fake_db.seed("mushroom_harvests", [{"harvestId": "h-1", "lineId": line.id}])

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(line.id, _User())
    assert exc.value.status_code == 409
    assert "1 harvests" in exc.value.detail
    assert await LineService.get_line(line.id) is not None


@pytest.mark.asyncio
async def test_purge_404s_for_unknown_line(fake_db: _FakeGeneticsDB) -> None:
    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line("does-not-exist", _User())
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# deactivate_line — unchanged behaviour
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deactivate_line_still_soft_deletes_and_keeps_the_document(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_line(fake_db, line)

    result = await LineService.deactivate_line(line.id)

    assert result.isActive is False
    # Unlike purge, the document must still be retrievable.
    still_there = await LineService.get_line(line.id)
    assert still_there.id == line.id
    assert still_there.isActive is False


# ---------------------------------------------------------------------------
# Permission — purge requires curation tier (genetics.delete)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bench_role_is_rejected_from_purge_permission() -> None:
    checker = require_permission("genetics.delete")
    with pytest.raises(HTTPException) as exc:
        await checker(current_user=_User("user"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_moderator_role_is_allowed_purge_permission() -> None:
    checker = require_permission("genetics.delete")
    user = _User("moderator")
    assert await checker(current_user=user) is user
