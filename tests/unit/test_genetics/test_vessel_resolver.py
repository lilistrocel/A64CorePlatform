"""
Unit tests for T-804 step 2 — vessel-ordinal split validation and the
forward resolver walk.

See ``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §3 (why the vessel
ordinal cannot be derived from ``quantity``) and §4.1 (the exact validation
rules) for the reasoning these tests pin down.

Covers:
  - AccessionService.split_accession, vesselNumbers validation
      - unnumbered split (default []) behaves exactly as before — no
        validation runs, sourceVesselNumbers on the child stays []
      - len(vesselNumbers) != quantity -> 400
      - ordinal outside 1..labelledVesselCount -> 400
      - ordinal already claimed by a sibling split -> 400
      - duplicate ordinals in the same request -> 400
      - labelledVesselCount on the parent is untouched by either a numbered
        or an unnumbered split
  - vessel_resolver.resolve_vessel
      - unclaimed ordinal -> returns the accession passed in, unchanged
      - claimed ordinal -> resolves to the direct child
      - two-level split chain -> resolves to the grandchild
      - a chain deeper than MAX_SPLIT_DEPTH (modelling a cycle) -> terminates
        at the cap, returns without raising, logs a warning

No live database is used — Motor's AsyncIOMotorCollection is stood in for
with unittest.mock.AsyncMock/MagicMock, following the pattern in
tests/unit/test_purchasing/test_gr_service.py (there is no mongomock in
requirements.txt; motor==3.6.0 is the real async driver).
"""

import logging
import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.modules.genetics.models.accession import Accession, AccessionSplit
from src.modules.genetics.models.enums import VesselForm
from src.modules.genetics.services.accession.accession_service import AccessionService
from src.modules.genetics.services.accession.vessel_resolver import (
    MAX_SPLIT_DEPTH,
    resolve_vessel,
)
from src.modules.genetics.services.common import model_to_doc

ACCESSION_ID_KEY = "accessionId"


# ---------------------------------------------------------------------------
# Shared test doubles
# ---------------------------------------------------------------------------


class _AsyncIter:
    """Minimal async iterator standing in for a Motor cursor."""

    def __init__(self, items: List[Dict[str, Any]]) -> None:
        self._items = list(items)

    def __aiter__(self) -> "_AsyncIter":
        return self

    async def __anext__(self) -> Dict[str, Any]:
        if not self._items:
            raise StopAsyncIteration
        return self._items.pop(0)


def _make_accession(
    quantity: int = 10,
    labelled: int = 10,
    accession_id: Optional[str] = None,
    code: str = "PO-BLU-G3-004",
    split_from: Optional[str] = None,
) -> Accession:
    return Accession(
        id=accession_id or str(uuid.uuid4()),
        lineId=str(uuid.uuid4()),
        accessionCode=code,
        form=VesselForm.PETRI_DISH,
        quantity=quantity,
        unit="plates",
        labelledVesselCount=labelled,
        splitFromAccessionId=split_from,
    )


def _make_split_collection(
    source_doc: Dict[str, Any], sibling_docs: Optional[List[Dict[str, Any]]] = None
) -> Tuple[MagicMock, List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, Any]]:
    """Build a Motor-collection-shaped mock over a single mutable document.

    find_one/update_one operate on `state` (standing in for the source
    accession's Mongo document) so a split's $inc/$set is visible to the
    AccessionService.get_accession() call split_accession makes immediately
    afterwards to build its return value — matching real Mongo
    read-after-write.
    """
    sibling_docs = sibling_docs or []
    state: Dict[str, Any] = dict(source_doc)
    insert_calls: List[Dict[str, Any]] = []
    update_calls: List[Dict[str, Any]] = []

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        if query.get(ACCESSION_ID_KEY) == state.get(ACCESSION_ID_KEY):
            return dict(state)
        return None

    async def _update_one(query: Dict[str, Any], update: Dict[str, Any], *args: Any, **kwargs: Any) -> None:
        update_calls.append({"query": query, "update": update})
        if query.get(ACCESSION_ID_KEY) == state.get(ACCESSION_ID_KEY):
            for field, amount in update.get("$inc", {}).items():
                state[field] = state.get(field, 0) + amount
            state.update(update.get("$set", {}))

    async def _insert_one(doc: Dict[str, Any], *args: Any, **kwargs: Any) -> None:
        insert_calls.append(doc)

    def _find(*args: Any, **kwargs: Any) -> _AsyncIter:
        return _AsyncIter([dict(d) for d in sibling_docs])

    col = MagicMock()
    col.find_one = AsyncMock(side_effect=_find_one)
    col.update_one = AsyncMock(side_effect=_update_one)
    col.insert_one = AsyncMock(side_effect=_insert_one)
    col.find = MagicMock(side_effect=_find)
    return col, insert_calls, update_calls, state


async def _run_split(
    source: Accession,
    split_data: AccessionSplit,
    sibling_docs: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[
    Tuple[Accession, Accession],
    MagicMock,
    List[Dict[str, Any]],
    List[Dict[str, Any]],
    Dict[str, Any],
]:
    """Call AccessionService.split_accession with every collaborator mocked."""
    source_doc = model_to_doc(source, ACCESSION_ID_KEY)
    col, insert_calls, update_calls, state = _make_split_collection(source_doc, sibling_docs)

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=col)

    current_user = SimpleNamespace(userId="tester", divisionId=None, organizationId=None)

    with patch(
        "src.modules.genetics.services.accession.accession_service.genetics_db.get_database",
        return_value=db,
    ), patch(
        "src.modules.genetics.services.accession.accession_service.LineService.get_line",
        new=AsyncMock(return_value=SimpleNamespace(code="PO-BLU")),
    ), patch(
        "src.modules.genetics.services.accession.accession_service.AccessionService.mint_code",
        new=AsyncMock(return_value="PO-BLU-G3-100"),
    ):
        result = await AccessionService.split_accession(source.id, split_data, current_user)

    return result, col, insert_calls, update_calls, state


# ---------------------------------------------------------------------------
# Split validation — unnumbered path must not change
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_unnumbered_split_behaves_exactly_as_before() -> None:
    """vesselNumbers=[] (the default) runs none of the ordinal checks."""
    source = _make_accession(quantity=10, labelled=10)
    split_data = AccessionSplit(quantity=3)

    (updated_source, child), col, insert_calls, update_calls, _state = await _run_split(
        source, split_data
    )

    assert child.sourceVesselNumbers == []
    assert insert_calls[0]["sourceVesselNumbers"] == []
    assert update_calls[0]["update"]["$inc"] == {"quantity": -3}
    assert updated_source.quantity == 7
    # No ordinal validation ran, so the sibling-claims query must never fire.
    col.find.assert_not_called()


# ---------------------------------------------------------------------------
# Split validation — the four rejections (A.1-A.4)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_split_rejects_vessel_count_mismatch() -> None:
    """len(vesselNumbers) != quantity -> 400 naming the offending ordinals."""
    source = _make_accession(quantity=5, labelled=10)
    split_data = AccessionSplit(quantity=3, vesselNumbers=[1, 2])

    with pytest.raises(HTTPException) as exc_info:
        await _run_split(source, split_data)

    assert exc_info.value.status_code == 400
    assert "[1, 2]" in exc_info.value.detail
    assert "3" in exc_info.value.detail


@pytest.mark.asyncio
async def test_split_rejects_out_of_range_ordinal_above_high_water_mark() -> None:
    """An ordinal beyond labelledVesselCount -> 400 naming it."""
    source = _make_accession(quantity=5, labelled=10)
    split_data = AccessionSplit(quantity=1, vesselNumbers=[15])

    with pytest.raises(HTTPException) as exc_info:
        await _run_split(source, split_data)

    assert exc_info.value.status_code == 400
    assert "15" in exc_info.value.detail
    assert "1..10" in exc_info.value.detail


@pytest.mark.asyncio
async def test_split_rejects_non_positive_ordinal() -> None:
    """Ordinal 0 (or negative) is out of range -> 400 naming it."""
    source = _make_accession(quantity=5, labelled=10)
    split_data = AccessionSplit(quantity=1, vesselNumbers=[0])

    with pytest.raises(HTTPException) as exc_info:
        await _run_split(source, split_data)

    assert exc_info.value.status_code == 400
    assert "[0]" in exc_info.value.detail


@pytest.mark.asyncio
async def test_split_rejects_ordinal_already_claimed_by_sibling() -> None:
    """An ordinal a prior sibling split already claimed -> 400 naming it."""
    source = _make_accession(quantity=5, labelled=10)
    sibling = model_to_doc(
        _make_accession(quantity=1, labelled=0, split_from=source.id),
        ACCESSION_ID_KEY,
    )
    sibling["sourceVesselNumbers"] = [7]
    split_data = AccessionSplit(quantity=1, vesselNumbers=[7])

    with pytest.raises(HTTPException) as exc_info:
        await _run_split(source, split_data, sibling_docs=[sibling])

    assert exc_info.value.status_code == 400
    assert "[7]" in exc_info.value.detail


@pytest.mark.asyncio
async def test_split_rejects_duplicate_ordinals() -> None:
    """A duplicate ordinal within the same request -> 400 naming it."""
    source = _make_accession(quantity=5, labelled=10)
    split_data = AccessionSplit(quantity=2, vesselNumbers=[3, 3])

    with pytest.raises(HTTPException) as exc_info:
        await _run_split(source, split_data)

    assert exc_info.value.status_code == 400
    assert "[3]" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Split validation — success path sets sourceVesselNumbers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_numbered_split_sets_source_vessel_numbers_on_child() -> None:
    source = _make_accession(quantity=5, labelled=10)
    split_data = AccessionSplit(quantity=2, vesselNumbers=[7, 8])

    (updated_source, child), _col, insert_calls, _update_calls, _state = await _run_split(
        source, split_data
    )

    assert child.sourceVesselNumbers == [7, 8]
    assert insert_calls[0]["sourceVesselNumbers"] == [7, 8]
    assert updated_source.quantity == 3


# ---------------------------------------------------------------------------
# labelledVesselCount must never move across a split
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_labelled_vessel_count_unchanged_after_unnumbered_split() -> None:
    source = _make_accession(quantity=10, labelled=10)
    split_data = AccessionSplit(quantity=4)

    (updated_source, _child), _col, _insert_calls, update_calls, _state = await _run_split(
        source, split_data
    )

    assert updated_source.labelledVesselCount == 10
    assert all("labelledVesselCount" not in u["update"].get("$inc", {}) for u in update_calls)
    assert all("labelledVesselCount" not in u["update"].get("$set", {}) for u in update_calls)


@pytest.mark.asyncio
async def test_labelled_vessel_count_unchanged_after_numbered_split() -> None:
    source = _make_accession(quantity=10, labelled=10)
    split_data = AccessionSplit(quantity=1, vesselNumbers=[7])

    (updated_source, child), _col, _insert_calls, update_calls, _state = await _run_split(
        source, split_data
    )

    assert updated_source.labelledVesselCount == 10
    assert child.sourceVesselNumbers == [7]
    assert all("labelledVesselCount" not in u["update"].get("$inc", {}) for u in update_calls)
    assert all("labelledVesselCount" not in u["update"].get("$set", {}) for u in update_calls)


# ---------------------------------------------------------------------------
# resolve_vessel — the forward walk
# ---------------------------------------------------------------------------


def _make_resolver_db(find_one_side_effect: Any) -> MagicMock:
    col = MagicMock()
    col.find_one = AsyncMock(side_effect=find_one_side_effect)
    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=col)
    return db


@pytest.mark.asyncio
async def test_resolve_vessel_returns_same_accession_when_unclaimed() -> None:
    """No child has split off this ordinal -> the vessel is still in this batch."""
    parent = _make_accession(quantity=10, labelled=10)

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> None:
        return None

    db = _make_resolver_db(_find_one)
    with patch(
        "src.modules.genetics.services.accession.vessel_resolver.genetics_db.get_database",
        return_value=db,
    ):
        result = await resolve_vessel(parent, 7)

    assert result.id == parent.id
    assert result.accessionCode == parent.accessionCode


@pytest.mark.asyncio
async def test_resolve_vessel_resolves_to_direct_child() -> None:
    parent = _make_accession(quantity=10, labelled=10, code="PO-BLU-G3-004")
    child = _make_accession(quantity=1, labelled=0, code="PO-BLU-G3-100", split_from=parent.id)
    child_doc = model_to_doc(child, ACCESSION_ID_KEY)
    child_doc["sourceVesselNumbers"] = [7]

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        if query.get("splitFromAccessionId") == parent.id and query.get("sourceVesselNumbers") == 7:
            return dict(child_doc)
        return None

    db = _make_resolver_db(_find_one)
    with patch(
        "src.modules.genetics.services.accession.vessel_resolver.genetics_db.get_database",
        return_value=db,
    ):
        result = await resolve_vessel(parent, 7)

    assert result.id == child.id
    assert result.accessionCode == "PO-BLU-G3-100"


@pytest.mark.asyncio
async def test_resolve_vessel_walks_two_levels_to_grandchild() -> None:
    """parent -> child -> grandchild, ordinal claimed only by the grandchild."""
    parent = _make_accession(quantity=10, labelled=10, code="PO-BLU-G3-004")
    child = _make_accession(quantity=5, labelled=0, code="PO-BLU-G3-100", split_from=parent.id)
    grandchild = _make_accession(
        quantity=1, labelled=0, code="PO-BLU-G3-101", split_from=child.id
    )

    child_doc = model_to_doc(child, ACCESSION_ID_KEY)
    child_doc["sourceVesselNumbers"] = []  # child holds other vessels, re-split further
    grandchild_doc = model_to_doc(grandchild, ACCESSION_ID_KEY)
    grandchild_doc["sourceVesselNumbers"] = [7]

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        split_from = query.get("splitFromAccessionId")
        vessel_no = query.get("sourceVesselNumbers")
        if vessel_no != 7:
            return None
        if split_from == parent.id:
            return dict(child_doc)
        if split_from == child.id:
            return dict(grandchild_doc)
        return None

    db = _make_resolver_db(_find_one)
    with patch(
        "src.modules.genetics.services.accession.vessel_resolver.genetics_db.get_database",
        return_value=db,
    ):
        result = await resolve_vessel(parent, 7)

    assert result.id == grandchild.id
    assert result.accessionCode == "PO-BLU-G3-101"


@pytest.mark.asyncio
async def test_resolve_vessel_terminates_at_depth_cap_without_raising(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A chain deeper than MAX_SPLIT_DEPTH (or a genuine cycle, which looks
    identical to the resolver — it can never re-fetch a node it has already
    left behind to notice a repeat) stops at the cap and returns instead of
    looping forever or raising. A warning is logged."""
    parent = _make_accession(quantity=10, labelled=10, code="PO-BLU-G3-004")

    # Build a chain deliberately longer than MAX_SPLIT_DEPTH: every accession
    # in the chain has split off a further child holding ordinal #7.
    created: List[Tuple[str, Dict[str, Any], str]] = []  # (parentId, doc, ownId)
    previous_id = parent.id
    for i in range(MAX_SPLIT_DEPTH + 5):
        nxt = _make_accession(
            quantity=1, labelled=0, code=f"PO-BLU-G3-{200 + i}", split_from=previous_id
        )
        nxt_doc = model_to_doc(nxt, ACCESSION_ID_KEY)
        nxt_doc["sourceVesselNumbers"] = [7]
        created.append((previous_id, nxt_doc, nxt.id))
        previous_id = nxt.id

    lookup = {parent_id: doc for parent_id, doc, _own_id in created}

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        if query.get("sourceVesselNumbers") != 7:
            return None
        split_from = query.get("splitFromAccessionId")
        if split_from in lookup:
            return dict(lookup[split_from])
        return None

    db = _make_resolver_db(_find_one)
    with caplog.at_level(
        logging.WARNING,
        logger="src.modules.genetics.services.accession.vessel_resolver",
    ):
        with patch(
            "src.modules.genetics.services.accession.vessel_resolver.genetics_db.get_database",
            return_value=db,
        ):
            result = await resolve_vessel(parent, 7)

    # Exactly MAX_SPLIT_DEPTH hops are taken; the walk lands on the accession
    # reached at hop MAX_SPLIT_DEPTH, not deeper into the (longer) chain.
    _expected_parent_id, _expected_doc, expected_id = created[MAX_SPLIT_DEPTH - 1]
    assert result.id == expected_id
    assert any(rec.levelno == logging.WARNING for rec in caplog.records)
    assert any("depth" in rec.message.lower() for rec in caplog.records)
