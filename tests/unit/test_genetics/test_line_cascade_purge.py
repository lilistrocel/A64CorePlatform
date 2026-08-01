"""
Unit tests for the genetics line cascade purge feature (T-809).

Bug this closes: T-807's ``LineService.purge_line`` is correct as a safe
default (refuse rather than cascade) but leaves no path at all for the case
the user actually described — "sometimes i have demo lines or test lines
which shouldn't clutter when the test or demo is cancelled." Deactivating
keeps clutter around forever; the zero-dependents purge refuses the moment a
single accession exists. This suite covers the deliberate, explicit,
audited escalation: ``LineService.cascade_purge_line``, reached only via
``DELETE /lines/{id}/purge?cascade=true``.

No live database — the same generic Motor-collection-shaped fake used by
``test_line_purge.py``, extended here with ``delete_many`` since cascade
purge deletes by explicit ``$in`` id list rather than one document at a time.

Test cases:
   1.  cascade removes accessions, propagation events and observations for
       the line, and the line document itself is gone
   2.  cascade with a missing confirm value -> 400, nothing deleted
   3.  cascade with a wrong confirm value -> 400, nothing deleted
   4.  cascade 409s when harvests exist, even with a correct confirm — and
       deletes nothing (line, accessions, harvests all survive)
   5.  cascade 409s when child lines exist, even with a correct confirm —
       and deletes nothing
   6.  dryRun returns accurate counts and accession codes, and deletes
       nothing (counts identical before/after)
   7.  dryRun still hard-refuses (409) when harvests exist — a preview must
       not promise a cascade that can never actually happen
   8.  non-super_admin is rejected by require_super_admin_for; super_admin
       is allowed
   9.  purge_line (no cascade) is completely unaffected by this feature —
       T-807 behaviour unchanged
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest
from fastapi import HTTPException

from src.modules.genetics.middleware.auth import require_super_admin_for
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
# Generic Motor-collection-shaped fake (mirrors test_line_purge.py), extended
# with delete_many for this suite's $in-based cascade deletes.
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
        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
                return False
        elif isinstance(expected, dict) and "$ne" in expected:
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

    async def delete_many(self, query: Dict[str, Any]) -> SimpleNamespace:
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))

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
        return self[name]


@pytest.fixture
def fake_db(monkeypatch: pytest.MonkeyPatch) -> _FakeGeneticsDB:
    db = _FakeGeneticsDB()
    monkeypatch.setattr(line_module.genetics_db, "get_database", lambda: db)
    return db


def _make_line(**overrides: Any) -> Line:
    defaults: Dict[str, Any] = dict(
        code="CASCADE-TEST",
        commonName="Cascade Test Line",
        kind=OrganismKind.FUNGUS,
        derivation=DerivationType.ORIGINAL,
    )
    defaults.update(overrides)
    return Line(**defaults)


def _seed_line(db: _FakeGeneticsDB, line: Line) -> None:
    db.seed(LINES, [model_to_doc(line, _LINE_ID_KEY)])


class _User:
    def __init__(self, role: str = "super_admin"):
        self.role = role
        self.userId = "u-cascade-test"
        self.email = "cascade-tester@example.com"


def _seed_full_line(fake_db: _FakeGeneticsDB, line: Line) -> None:
    """A line with one accession, one propagation event, one observation."""
    _seed_line(fake_db, line)
    fake_db.seed(
        ACCESSIONS,
        [
            {
                "accessionId": "a-1",
                "accessionCode": f"{line.code}-G0-001",
                "lineId": line.id,
            }
        ],
    )
    fake_db.seed(
        PROPAGATIONS,
        [
            {
                "eventId": "e-1",
                "sourceLineIds": [line.id],
                "resultLineIds": [],
            }
        ],
    )
    fake_db.seed(
        OBSERVATIONS,
        [{"observationId": "o-1", "lineId": line.id, "accessionId": "a-1"}],
    )


# ---------------------------------------------------------------------------
# 1. Real cascade — removes everything, line included
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascade_removes_accessions_events_observations_and_line(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)

    result = await LineService.cascade_purge_line(
        line_id=line.id, confirm=line.code, current_user=_User(), dry_run=False
    )

    assert result["accessionsRemoved"] == 1
    assert result["accessionCodesRemoved"] == [f"{line.code}-G0-001"]
    assert result["propagationEventsRemoved"] == 1
    assert result["observationsRemoved"] == 1
    assert result["dryRun"] is False

    assert fake_db[ACCESSIONS].docs == []
    assert fake_db[PROPAGATIONS].docs == []
    assert fake_db[OBSERVATIONS].docs == []
    assert fake_db[LINES].docs == []

    with pytest.raises(HTTPException) as exc:
        await LineService.get_line(line.id)
    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# 2 & 3. Confirm mismatch -> 400, nothing deleted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascade_with_missing_confirm_400s_and_deletes_nothing(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)

    with pytest.raises(HTTPException) as exc:
        await LineService.cascade_purge_line(
            line_id=line.id, confirm=None, current_user=_User(), dry_run=False
        )
    assert exc.value.status_code == 400

    assert len(fake_db[ACCESSIONS].docs) == 1
    assert len(fake_db[PROPAGATIONS].docs) == 1
    assert len(fake_db[OBSERVATIONS].docs) == 1
    assert len(fake_db[LINES].docs) == 1


@pytest.mark.asyncio
async def test_cascade_with_wrong_confirm_400s_and_deletes_nothing(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)

    with pytest.raises(HTTPException) as exc:
        await LineService.cascade_purge_line(
            line_id=line.id,
            confirm="NOT-THE-CODE",
            current_user=_User(),
            dry_run=False,
        )
    assert exc.value.status_code == 400

    assert len(fake_db[ACCESSIONS].docs) == 1
    assert len(fake_db[PROPAGATIONS].docs) == 1
    assert len(fake_db[OBSERVATIONS].docs) == 1
    assert len(fake_db[LINES].docs) == 1


# ---------------------------------------------------------------------------
# 4. Harvests -> hard refuse, even with correct confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascade_409s_when_harvests_exist_even_with_correct_confirm(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)
    fake_db.seed("mushroom_harvests", [{"harvestId": "h-1", "lineId": line.id}])

    with pytest.raises(HTTPException) as exc:
        await LineService.cascade_purge_line(
            line_id=line.id, confirm=line.code, current_user=_User(), dry_run=False
        )
    assert exc.value.status_code == 409
    assert "harvest" in exc.value.detail.lower()

    # Nothing deleted — line, accessions, harvests all survive.
    assert len(fake_db[ACCESSIONS].docs) == 1
    assert len(fake_db[PROPAGATIONS].docs) == 1
    assert len(fake_db[OBSERVATIONS].docs) == 1
    assert len(fake_db[LINES].docs) == 1
    assert len(fake_db["mushroom_harvests"].docs) == 1
    assert await LineService.get_line(line.id) is not None


# ---------------------------------------------------------------------------
# 5. Child lines -> hard refuse, even with correct confirm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cascade_409s_when_child_lines_exist_even_with_correct_confirm(
    fake_db: _FakeGeneticsDB,
) -> None:
    parent = _make_line(code="CASCADE-PARENT")
    _seed_full_line(fake_db, parent)
    child = _make_line(code="CASCADE-CHILD", parentLineId=parent.id)
    fake_db[LINES].docs.append(model_to_doc(child, _LINE_ID_KEY))

    with pytest.raises(HTTPException) as exc:
        await LineService.cascade_purge_line(
            line_id=parent.id,
            confirm=parent.code,
            current_user=_User(),
            dry_run=False,
        )
    assert exc.value.status_code == 409
    assert "child" in exc.value.detail.lower()

    assert len(fake_db[ACCESSIONS].docs) == 1
    assert len(fake_db[PROPAGATIONS].docs) == 1
    assert len(fake_db[OBSERVATIONS].docs) == 1
    # Both parent and child lines survive.
    assert len(fake_db[LINES].docs) == 2
    assert await LineService.get_line(parent.id) is not None
    assert await LineService.get_line(child.id) is not None


# ---------------------------------------------------------------------------
# 6. Dry run — accurate preview, deletes nothing
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_dry_run_returns_accurate_counts_and_deletes_nothing(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)

    before = {
        name: len(fake_db[name].docs)
        for name in (ACCESSIONS, PROPAGATIONS, OBSERVATIONS, LINES)
    }

    result = await LineService.cascade_purge_line(
        line_id=line.id, confirm=None, current_user=_User(), dry_run=True
    )

    assert result["dryRun"] is True
    assert result["accessionsRemoved"] == 1
    assert result["accessionCodesRemoved"] == [f"{line.code}-G0-001"]
    assert result["propagationEventsRemoved"] == 1
    assert result["observationsRemoved"] == 1

    after = {
        name: len(fake_db[name].docs)
        for name in (ACCESSIONS, PROPAGATIONS, OBSERVATIONS, LINES)
    }
    assert before == after
    # The line document itself must still be retrievable after a dry run.
    assert await LineService.get_line(line.id) is not None


@pytest.mark.asyncio
async def test_dry_run_still_hard_refuses_when_harvests_exist(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)
    fake_db.seed("mushroom_harvests", [{"harvestId": "h-1", "lineId": line.id}])

    with pytest.raises(HTTPException) as exc:
        await LineService.cascade_purge_line(
            line_id=line.id, confirm=None, current_user=_User(), dry_run=True
        )
    assert exc.value.status_code == 409
    # Nothing touched by the (refused) dry run either.
    assert len(fake_db[ACCESSIONS].docs) == 1
    assert len(fake_db[LINES].docs) == 1


# ---------------------------------------------------------------------------
# 8. Permission — super_admin only
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_non_super_admin_rejected_from_cascade_permission() -> None:
    for role in ("user", "moderator", "admin"):
        with pytest.raises(HTTPException) as exc:
            require_super_admin_for("genetics.delete.cascade", _User(role))
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_super_admin_allowed_cascade_permission() -> None:
    # Must not raise.
    require_super_admin_for("genetics.delete.cascade", _User("super_admin"))


# ---------------------------------------------------------------------------
# 9. Plain purge_line (T-807) unaffected by this feature
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plain_purge_line_still_refuses_with_dependents_present(
    fake_db: _FakeGeneticsDB,
) -> None:
    line = _make_line()
    _seed_full_line(fake_db, line)

    with pytest.raises(HTTPException) as exc:
        await LineService.purge_line(line.id, _User("moderator"))
    assert exc.value.status_code == 409
    assert len(fake_db[LINES].docs) == 1
