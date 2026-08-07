"""
Unit tests for the widened room-occupancy aggregation
(``AccessionService.room_occupancy``).

Context: the Room Monitor card already showed a bare vessel count; this
widens the same single aggregation to also carry a per-status breakdown and
colonisation age (``byStatus``, ``colonizedCount``, ``oldestColonizedAt``,
``newestColonizedAt``) so a room card can say "23 petri dishes · 18
colonised · oldest 12d" without a second query. See
``src/modules/genetics/services/accession/accession_service.py``,
``room_occupancy()`` docstring for why this is a ``$facet`` over one
``$match`` rather than a single dense ``$group`` — one round trip, three
independently-readable branches.

No live database and no mongomock (not in requirements.txt), following the
no-mongomock precedent in tests/unit/test_genetics/test_vessel_resolver.py.
Unlike that file's collaborators (simple find/find_one/update_one), this
service issues a real MongoDB aggregation pipeline (``$match`` + ``$facet``
+ ``$group`` with ``$sum``/``$min``/``$max``/``$cond``/``$ifNull``), so the
fake collection here carries a small, purpose-built interpreter for exactly
those pipeline operators — not a generic Mongo emulator, just enough to
faithfully execute the pipeline this service actually builds. Real-Mongo
verification of the same aggregation happened separately, against the live
BioSpace Lab room data (T-room-occupancy plan), before these tests were
written.

Test cases:
  - discarded and consumed material is excluded from every field, including
    the new byStatus/colonization branches
  - byStatus vessel totals sum to the room's `vessels` total
  - byForm vessel totals sum to the room's `vessels` total (regression
    guard on the pre-existing behaviour)
  - a room with nothing colonised (colonizedAt missing or explicit None on
    every live record) returns colonizedCount 0 and None for both extremes
  - colonizedCount counts records, not vessels — a single multi-quantity
    record colonised counts once
  - oldestColonizedAt / newestColonizedAt correctly take the min/max across
    records that do have a colonizedAt in a room, ignoring the ones that don't
  - facility_id=None returns rooms across all facilities, not just the
    first one seen — this is the path the (frontend, out of scope here)
    Room Monitor uses since it groups rooms across facilities
  - facility_id set restricts the result to that facility's rooms only
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, patch

import pytest

from src.modules.genetics.services.accession.accession_service import AccessionService

_REMOVE = object()


# ---------------------------------------------------------------------------
# Minimal interpreter for exactly the pipeline shape room_occupancy() builds:
# a top-level $match, followed by a single $facet whose branches are each one
# $group stage using $sum / $min / $max over field refs, $cond, $ifNull and
# $$REMOVE. Not a general-purpose Mongo emulator — only what this pipeline
# actually uses.
# ---------------------------------------------------------------------------


def _get_field(doc: Dict[str, Any], dotted: str) -> Any:
    cur: Any = doc
    for part in dotted.split("."):
        if isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def _eval(doc: Dict[str, Any], expr: Any) -> Any:
    if isinstance(expr, str) and expr.startswith("$$"):
        if expr == "$$REMOVE":
            return _REMOVE
        raise NotImplementedError(expr)
    if isinstance(expr, str) and expr.startswith("$"):
        return _get_field(doc, expr[1:])
    if isinstance(expr, dict):
        if "$ifNull" in expr:
            value_expr, default_expr = expr["$ifNull"]
            value = _eval(doc, value_expr)
            return _eval(doc, default_expr) if value is None else value
        if "$ne" in expr:
            a, b = expr["$ne"]
            return _eval(doc, a) != _eval(doc, b)
        if "$cond" in expr:
            cond, then, otherwise = expr["$cond"]
            return _eval(doc, then) if _eval(doc, cond) else _eval(doc, otherwise)
        raise NotImplementedError(expr)
    return expr  # literal: int, str (non-$), None


def _matches(doc: Dict[str, Any], match: Dict[str, Any]) -> bool:
    for key, cond in match.items():
        actual = _get_field(doc, key)
        if isinstance(cond, dict):
            if "$ne" in cond and actual == cond["$ne"]:
                return False
            if "$nin" in cond and actual in cond["$nin"]:
                return False
        elif actual != cond:
            return False
    return True


def _run_group(
    docs: List[Dict[str, Any]], group_spec: Dict[str, Any]
) -> List[Dict[str, Any]]:
    id_expr = group_spec["_id"]
    buckets: Dict[Any, Dict[str, Any]] = {}
    for doc in docs:
        if isinstance(id_expr, dict):
            id_value = {k: _eval(doc, v) for k, v in id_expr.items()}
            key = tuple(sorted(id_value.items()))
        else:
            id_value = _eval(doc, id_expr)
            key = id_value
        bucket = buckets.setdefault(key, {"_id": id_value, "_docs": []})
        bucket["_docs"].append(doc)

    results = []
    for bucket in buckets.values():
        row: Dict[str, Any] = {"_id": bucket["_id"]}
        docs_in_group = bucket["_docs"]
        for field, acc in group_spec.items():
            if field == "_id":
                continue
            if "$sum" in acc:
                vals = [_eval(d, acc["$sum"]) for d in docs_in_group]
                vals = [v for v in vals if v is not _REMOVE]
                row[field] = sum(vals)
            elif "$min" in acc:
                vals = [_eval(d, acc["$min"]) for d in docs_in_group]
                vals = [v for v in vals if v is not _REMOVE and v is not None]
                row[field] = min(vals) if vals else None
            elif "$max" in acc:
                vals = [_eval(d, acc["$max"]) for d in docs_in_group]
                vals = [v for v in vals if v is not _REMOVE and v is not None]
                row[field] = max(vals) if vals else None
        results.append(row)
    return results


def _run_pipeline(
    docs: List[Dict[str, Any]], pipeline: List[Dict[str, Any]]
) -> Dict[str, Any]:
    cur = docs
    result_doc: Dict[str, Any] = {}
    for stage in pipeline:
        if "$match" in stage:
            cur = [d for d in cur if _matches(d, stage["$match"])]
        elif "$facet" in stage:
            for name, stages in stage["$facet"].items():
                branch = cur
                for sub_stage in stages:
                    if "$group" in sub_stage:
                        branch = _run_group(branch, sub_stage["$group"])
                    else:
                        raise NotImplementedError(sub_stage)
                result_doc[name] = branch
        else:
            raise NotImplementedError(stage)
    return result_doc


class _AsyncIter:
    """Minimal async iterator standing in for a Motor cursor/aggregate result."""

    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = list(items)

    def __aiter__(self) -> "_AsyncIter":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


def _make_db(docs: List[Dict[str, Any]]) -> MagicMock:
    def _aggregate(
        pipeline: List[Dict[str, Any]], *args: Any, **kwargs: Any
    ) -> _AsyncIter:
        return _AsyncIter([_run_pipeline(docs, pipeline)])

    col = MagicMock()
    col.aggregate = MagicMock(side_effect=_aggregate)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=col)
    return db


def _doc(
    *,
    room_id: str,
    facility_id: str = "fac-1",
    form: str = "petri_dish",
    quantity: int = 1,
    status: str = "active",
    colonized_at: Optional[datetime] = None,
) -> Dict[str, Any]:
    return {
        "accessionId": str(uuid.uuid4()),
        "form": form,
        "quantity": quantity,
        "status": status,
        "location": {"facilityId": facility_id, "roomId": room_id},
        "colonizedAt": colonized_at,
    }


def _patched(docs: List[Dict[str, Any]]):
    return patch(
        "src.modules.genetics.services.accession.accession_service.genetics_db.get_database",
        return_value=_make_db(docs),
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_discarded_and_consumed_excluded():
    docs = [
        _doc(room_id="room-1", quantity=5, status="active"),
        _doc(room_id="room-1", quantity=100, status="discarded"),
        _doc(room_id="room-1", quantity=50, status="consumed"),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["vessels"] == 5
    assert entry["records"] == 1
    assert entry["byForm"] == {"petri_dish": 5}
    assert entry["byStatus"] == {"active": 5}
    assert sum(entry["byForm"].values()) == entry["vessels"]
    assert sum(entry["byStatus"].values()) == entry["vessels"]


@pytest.mark.asyncio
async def test_by_status_totals_sum_to_vessels():
    docs = [
        _doc(room_id="room-1", quantity=3, status="active"),
        _doc(room_id="room-1", quantity=2, status="contaminated"),
        _doc(room_id="room-1", quantity=4, status="senescent"),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["vessels"] == 9
    assert entry["byStatus"] == {"active": 3, "contaminated": 2, "senescent": 4}
    assert sum(entry["byStatus"].values()) == entry["vessels"]


@pytest.mark.asyncio
async def test_by_form_totals_sum_to_vessels_regression():
    docs = [
        _doc(room_id="room-1", quantity=20, form="petri_dish"),
        _doc(room_id="room-1", quantity=3, form="agar_plug"),
        _doc(room_id="room-1", quantity=7, form="slant"),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["vessels"] == 30
    assert entry["byForm"] == {"petri_dish": 20, "agar_plug": 3, "slant": 7}
    assert sum(entry["byForm"].values()) == entry["vessels"]


@pytest.mark.asyncio
async def test_room_with_nothing_colonized():
    docs = [
        _doc(room_id="room-1", quantity=5, colonized_at=None),
        _doc(room_id="room-1", quantity=2, colonized_at=None),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["colonizedCount"] == 0
    assert entry["oldestColonizedAt"] is None
    assert entry["newestColonizedAt"] is None


@pytest.mark.asyncio
async def test_room_with_missing_colonized_at_key_also_counts_as_none():
    """A record with no `colonizedAt` key at all (never set) must be treated
    the same as an explicit None — not crash, not count as colonised."""
    doc = _doc(room_id="room-1", quantity=1)
    del doc["colonizedAt"]
    with _patched([doc]):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["colonizedCount"] == 0
    assert entry["oldestColonizedAt"] is None
    assert entry["newestColonizedAt"] is None


@pytest.mark.asyncio
async def test_colonized_count_is_records_not_vessels():
    """A single record with quantity=20, colonised, counts as 1 colonised
    record — colonizedCount is a document count, not a vessel sum."""
    docs = [
        _doc(room_id="room-1", quantity=20, colonized_at=datetime(2026, 1, 1)),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["vessels"] == 20
    assert entry["colonizedCount"] == 1


@pytest.mark.asyncio
async def test_colonized_extremes_take_min_and_max_ignoring_uncolonized():
    oldest = datetime(2026, 1, 1)
    middle = datetime(2026, 3, 1)
    newest = datetime(2026, 6, 1)
    docs = [
        _doc(room_id="room-1", quantity=1, colonized_at=oldest),
        _doc(room_id="room-1", quantity=1, colonized_at=middle),
        _doc(room_id="room-1", quantity=1, colonized_at=newest),
        _doc(
            room_id="room-1", quantity=1, colonized_at=None
        ),  # must not skew the range
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy()

    entry = out["room-1"]
    assert entry["colonizedCount"] == 3
    assert entry["oldestColonizedAt"] == oldest
    assert entry["newestColonizedAt"] == newest


@pytest.mark.asyncio
async def test_facility_id_none_returns_rooms_across_all_facilities():
    docs = [
        _doc(room_id="room-1", facility_id="fac-1", quantity=3),
        _doc(room_id="room-2", facility_id="fac-2", quantity=4),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy(facility_id=None)

    assert set(out.keys()) == {"room-1", "room-2"}
    assert out["room-1"]["vessels"] == 3
    assert out["room-2"]["vessels"] == 4


@pytest.mark.asyncio
async def test_facility_id_filter_restricts_to_that_facility():
    docs = [
        _doc(room_id="room-1", facility_id="fac-1", quantity=3),
        _doc(room_id="room-2", facility_id="fac-2", quantity=4),
    ]
    with _patched(docs):
        out = await AccessionService.room_occupancy(facility_id="fac-1")

    assert set(out.keys()) == {"room-1"}
