"""
Unit tests for the genetics orphan-sweep maintenance feature (T-809).

Bug this closes: cascade purge (see test_line_cascade_purge.py) and the
zero-dependents purge (T-807) are both line-scoped — they only ever clean up
records that still point at a line the caller names. In practice, orphaned
records already exist from before this feature shipped (the motivating
example: an accession ``T808-TEST-G1-002`` whose line had been purged,
invisible to any line-scoped cleanup because nobody can ask a deleted line
"what points at you?"). This suite covers ``MaintenanceService``, the
org-wide sweep that finds and removes exactly those leftovers.

The load-bearing rule under test: a null/absent ``lineId`` is NOT an orphan.
Only a ``lineId`` that IS set and resolves to nothing counts. Getting this
backwards would delete live, correctly-recorded records that simply never
carried a line reference — the suite asserts this both ways (an orphan IS
found, a null-lineId record is NOT flagged) rather than only the positive
case.

No live database — the same generic Motor-collection-shaped fake used by
``test_line_cascade_purge.py``, reused here unmodified (delete_many is
already required and already present).

Test cases:
   1.  find_orphans flags an accession whose lineId points at nothing
   2.  find_orphans does NOT flag an accession whose lineId still resolves
   3.  find_orphans does NOT flag an observation with a null lineId
   4.  find_orphans flags an observation whose lineId points at nothing
   5.  find_orphans does NOT flag a propagation event where at least one
       referenced line still exists (partial reference — not dangling)
   6.  find_orphans flags a propagation event where every referenced line
       is gone
   7.  find_orphans does NOT flag a propagation event with no line
       references at all (empty sourceLineIds/resultLineIds)
   8.  delete_orphans(dryRun=True) reports accurate counts and deletes
       nothing
   9.  delete_orphans removes only the orphans — the live accession and the
       null-lineId observation both survive
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

from src.modules.genetics.services.database import (
    ACCESSIONS,
    LINES,
    OBSERVATIONS,
    PROPAGATIONS,
)
from src.modules.genetics.services.maintenance import maintenance_service as maint_module
from src.modules.genetics.services.maintenance.maintenance_service import (
    MaintenanceService,
)


# ---------------------------------------------------------------------------
# Same generic Motor-collection-shaped fake as test_line_cascade_purge.py.
# ---------------------------------------------------------------------------


def _matches(doc: Dict[str, Any], query: Dict[str, Any]) -> bool:
    for key, expected in query.items():
        actual = doc.get(key)
        if isinstance(expected, dict) and "$in" in expected:
            if actual not in expected["$in"]:
                return False
        elif actual != expected:
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


class _FakeCollection:
    def __init__(self, docs: Optional[List[Dict[str, Any]]] = None) -> None:
        self.docs = list(docs or [])

    def find(self, query: Optional[Dict[str, Any]] = None, *args: Any, **kwargs: Any) -> _AsyncCursor:
        query = query or {}
        return _AsyncCursor([dict(d) for d in self.docs if _matches(d, query)])

    async def delete_many(self, query: Dict[str, Any]) -> SimpleNamespace:
        before = len(self.docs)
        self.docs = [d for d in self.docs if not _matches(d, query)]
        return SimpleNamespace(deleted_count=before - len(self.docs))


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
    monkeypatch.setattr(maint_module.genetics_db, "get_database", lambda: db)
    return db


class _User:
    def __init__(self, role: str = "super_admin"):
        self.role = role
        self.userId = "u-maintenance-test"
        self.email = "maintenance-tester@example.com"


LIVE_LINE_ID = "line-still-alive"
GONE_LINE_ID = "line-purged-away"
OTHER_GONE_LINE_ID = "line-also-purged"


def _seed_baseline(fake_db: _FakeGeneticsDB) -> None:
    """One real line; nothing else seeded until a test adds it."""
    fake_db.seed(LINES, [{"lineId": LIVE_LINE_ID, "code": "LIVE"}])


# ---------------------------------------------------------------------------
# Accessions
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_finds_accession_whose_line_is_gone(fake_db: _FakeGeneticsDB) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        ACCESSIONS,
        [{"accessionId": "a-orphan", "accessionCode": "T808-TEST-G1-002", "lineId": GONE_LINE_ID}],
    )

    orphans = await MaintenanceService.find_orphans()

    assert orphans["counts"]["accessions"] == 1
    assert orphans["accessions"][0]["accessionCode"] == "T808-TEST-G1-002"
    assert orphans["accessions"][0]["lineId"] == GONE_LINE_ID


@pytest.mark.asyncio
async def test_does_not_flag_accession_whose_line_still_exists(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        ACCESSIONS,
        [{"accessionId": "a-live", "accessionCode": "LIVE-G0-001", "lineId": LIVE_LINE_ID}],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["accessions"] == 0


# ---------------------------------------------------------------------------
# Observations — the null-lineId-is-not-an-orphan rule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_does_not_flag_observation_with_null_line_id(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        OBSERVATIONS,
        [{"observationId": "o-null", "lineId": None, "accessionId": "a-x"}],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["observations"] == 0


@pytest.mark.asyncio
async def test_flags_observation_whose_line_is_gone(fake_db: _FakeGeneticsDB) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        OBSERVATIONS,
        [{"observationId": "o-orphan", "lineId": GONE_LINE_ID, "accessionId": "a-x"}],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["observations"] == 1
    assert orphans["observations"][0]["observationId"] == "o-orphan"


# ---------------------------------------------------------------------------
# Propagation events — multi-reference rule
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_does_not_flag_propagation_event_with_one_surviving_reference(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        PROPAGATIONS,
        [
            {
                "eventId": "e-partial",
                # One parent line gone, one still alive — a genuine cross
                # between an old and a current line. Not dangling.
                "sourceLineIds": [GONE_LINE_ID, LIVE_LINE_ID],
                "resultLineIds": [],
            }
        ],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["propagationEvents"] == 0


@pytest.mark.asyncio
async def test_flags_propagation_event_when_every_reference_is_gone(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        PROPAGATIONS,
        [
            {
                "eventId": "e-orphan",
                "sourceLineIds": [GONE_LINE_ID],
                "resultLineIds": [OTHER_GONE_LINE_ID],
            }
        ],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["propagationEvents"] == 1
    assert orphans["propagationEvents"][0]["eventId"] == "e-orphan"


@pytest.mark.asyncio
async def test_does_not_flag_propagation_event_with_no_line_references(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        PROPAGATIONS,
        [{"eventId": "e-unknown-ancestry", "sourceLineIds": [], "resultLineIds": []}],
    )

    orphans = await MaintenanceService.find_orphans()
    assert orphans["counts"]["propagationEvents"] == 0


# ---------------------------------------------------------------------------
# Dry run and real delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_orphans_dry_run_reports_accurate_counts_and_deletes_nothing(
    fake_db: _FakeGeneticsDB,
) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        ACCESSIONS,
        [
            {"accessionId": "a-orphan", "accessionCode": "GONE-G0-001", "lineId": GONE_LINE_ID},
            {"accessionId": "a-live", "accessionCode": "LIVE-G0-001", "lineId": LIVE_LINE_ID},
        ],
    )
    fake_db.seed(
        OBSERVATIONS,
        [{"observationId": "o-null", "lineId": None, "accessionId": "a-live"}],
    )

    result = await MaintenanceService.delete_orphans(_User(), dry_run=True)

    assert result["dryRun"] is True
    assert result["counts"]["accessions"] == 1
    assert result["counts"]["observations"] == 0

    # Nothing deleted — both accessions and the observation survive.
    assert len(fake_db[ACCESSIONS].docs) == 2
    assert len(fake_db[OBSERVATIONS].docs) == 1


@pytest.mark.asyncio
async def test_delete_orphans_removes_only_the_orphans(fake_db: _FakeGeneticsDB) -> None:
    _seed_baseline(fake_db)
    fake_db.seed(
        ACCESSIONS,
        [
            {"accessionId": "a-orphan", "accessionCode": "GONE-G0-001", "lineId": GONE_LINE_ID},
            {"accessionId": "a-live", "accessionCode": "LIVE-G0-001", "lineId": LIVE_LINE_ID},
        ],
    )
    fake_db.seed(
        OBSERVATIONS,
        [
            {"observationId": "o-null", "lineId": None, "accessionId": "a-live"},
            {"observationId": "o-orphan", "lineId": GONE_LINE_ID, "accessionId": "a-orphan"},
        ],
    )
    fake_db.seed(
        PROPAGATIONS,
        [
            {"eventId": "e-live", "sourceLineIds": [LIVE_LINE_ID], "resultLineIds": []},
            {"eventId": "e-orphan", "sourceLineIds": [GONE_LINE_ID], "resultLineIds": []},
        ],
    )

    result = await MaintenanceService.delete_orphans(_User(), dry_run=False)

    assert result["dryRun"] is False
    assert result["counts"] == {"accessions": 1, "observations": 1, "propagationEvents": 1}

    remaining_accession_ids = {d["accessionId"] for d in fake_db[ACCESSIONS].docs}
    assert remaining_accession_ids == {"a-live"}

    remaining_observation_ids = {d["observationId"] for d in fake_db[OBSERVATIONS].docs}
    assert remaining_observation_ids == {"o-null"}

    remaining_event_ids = {d["eventId"] for d in fake_db[PROPAGATIONS].docs}
    assert remaining_event_ids == {"e-live"}
