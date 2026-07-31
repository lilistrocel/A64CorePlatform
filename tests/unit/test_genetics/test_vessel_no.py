"""
Unit tests for T-805 — record which physical vessel of a parent batch a
propagation was taken from.

An accession is a batch record (``quantity`` vessels), not a single plate.
``ParentRef.accessionId`` alone can say "this came from that batch" but not
"from plate #4 of its 6 plates". ``ParentRef.vesselNo`` closes that gap. It
only means anything because T-804's vessel ordinals are stable and never
renumbered (``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §3) — see
that spec plus the module docstrings on ``accession.py`` and
``propagation_service.py`` for the full reasoning.

Covers:
  - PropagationService.propagate()
      - vesselNo supplied -> stored on the child's parents[0] (and on the
        event's parents[0])
      - vesselNo omitted -> None throughout, matching every propagation
        recorded before this field existed (the common path; must not
        regress)
      - vesselNo without accessionId -> 400
      - vesselNo above max(labelledVesselCount, quantity) -> 400
      - parent with neither labelledVesselCount nor quantity -> 400
      - vesselNo valid against quantity alone when labelledVesselCount is 0
      - a two-parent cross carries a distinct vesselNo per parent
  - AccessionService.split_accession()
      - the split child inherits `parents` verbatim, vesselNo included
        unchanged (T-805 changes nothing here; this pins that down)

No live database is used — Motor's AsyncIOMotorCollection is stood in for
with unittest.mock.AsyncMock/MagicMock, following the pattern already used in
tests/unit/test_genetics/test_vessel_resolver.py (there is no mongomock in
requirements.txt; motor==3.6.0 is the real async driver).
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.modules.genetics.models.accession import Accession, AccessionSplit, ParentRef
from src.modules.genetics.models.enums import ParentRole, PropagationMethod, VesselForm
from src.modules.genetics.models.propagation import PropagationCreate, PropagationTarget
from src.modules.genetics.services.accession.accession_service import AccessionService
from src.modules.genetics.services.common import model_to_doc
from src.modules.genetics.services.propagation.propagation_service import (
    PropagationService,
)

_SERVICE = "src.modules.genetics.services.propagation.propagation_service"
_ACCESSION_ID_KEY = "accessionId"


# ---------------------------------------------------------------------------
# Shared test doubles
# ---------------------------------------------------------------------------


def _make_parent(
    quantity: int = 6,
    labelled: int = 6,
    accession_id: Optional[str] = None,
    code: str = "PO-BLU-G3-001",
    line_id: Optional[str] = None,
) -> Accession:
    return Accession(
        id=accession_id or str(uuid.uuid4()),
        lineId=line_id or str(uuid.uuid4()),
        accessionCode=code,
        form=VesselForm.PETRI_DISH,
        quantity=quantity,
        unit="plates",
        labelledVesselCount=labelled,
        cloneGeneration=3,
    )


def _current_user() -> SimpleNamespace:
    return SimpleNamespace(userId="tester", divisionId=None, organizationId=None)


async def _run_propagate(
    data: PropagationCreate,
    parents: List[Accession],
) -> Tuple[Any, List[Accession]]:
    """Call PropagationService.propagate with every collaborator mocked.

    No real MongoDB is touched: get_many, mint_code, LineService.get_line and
    build_protocol_ref are all patched, and the insert calls on the mocked
    db just need to not raise.
    """
    parent_map = {p.id: p for p in parents}

    collection = MagicMock()
    collection.insert_many = AsyncMock(return_value=None)
    collection.insert_one = AsyncMock(return_value=None)

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)

    with patch(
        f"{_SERVICE}.AccessionService.get_many", new=AsyncMock(return_value=parent_map)
    ), patch(
        f"{_SERVICE}.AccessionService.mint_code",
        new=AsyncMock(return_value="PO-BLU-G4-001"),
    ), patch(
        f"{_SERVICE}.LineService.get_line",
        new=AsyncMock(return_value=SimpleNamespace(code="PO-BLU")),
    ), patch(
        f"{_SERVICE}.build_protocol_ref", new=AsyncMock(return_value=None)
    ), patch(
        f"{_SERVICE}.genetics_db.get_database", return_value=db
    ):
        event, children = await PropagationService.propagate(data, _current_user())

    return event, children


# ---------------------------------------------------------------------------
# vesselNo supplied -> survives onto the child and the event
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_propagation_with_vessel_no_stores_it_on_child_parent() -> None:
    parent = _make_parent(quantity=6, labelled=6, code="PO-BLU-G3-001")
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[
            ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE, vesselNo=4)
        ],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    event, children = await _run_propagate(data, [parent])

    assert event.parents[0].vesselNo == 4
    assert children[0].parents[0].vesselNo == 4
    assert children[0].parents[0].accessionId == parent.id


# ---------------------------------------------------------------------------
# vesselNo omitted -> the common path, must not regress
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_propagation_without_vessel_no_behaves_as_before() -> None:
    """Omitting vesselNo (the default) must produce exactly today's shape:
    vesselNo is None throughout and nothing else about the parent ref
    changes."""
    parent = _make_parent(quantity=6, labelled=6, code="PO-BLU-G3-001")
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE)],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    event, children = await _run_propagate(data, [parent])

    assert event.parents[0].vesselNo is None
    assert children[0].parents[0].vesselNo is None
    assert children[0].parents[0].accessionId == parent.id
    assert children[0].parents[0].lineId == parent.lineId
    assert children[0].cloneGeneration == 4


# ---------------------------------------------------------------------------
# Validation rejections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vessel_no_without_accession_id_is_rejected() -> None:
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[ParentRef(accessionId=None, role=ParentRole.CLONE_SOURCE, vesselNo=2)],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    with pytest.raises(HTTPException) as exc_info:
        await _run_propagate(data, [])

    assert exc_info.value.status_code == 400
    assert "without an accessionId" in exc_info.value.detail
    assert "2" in exc_info.value.detail


@pytest.mark.asyncio
async def test_vessel_no_above_ceiling_is_rejected() -> None:
    parent = _make_parent(quantity=6, labelled=6, code="PO-BLU-G3-001")
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[
            ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE, vesselNo=9)
        ],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    with pytest.raises(HTTPException) as exc_info:
        await _run_propagate(data, [parent])

    assert exc_info.value.status_code == 400
    assert "9" in exc_info.value.detail
    assert "1..6" in exc_info.value.detail
    assert parent.accessionCode in exc_info.value.detail


@pytest.mark.asyncio
async def test_vessel_no_rejected_when_parent_has_no_labelled_count_or_quantity() -> None:
    """A batch with quantity=0 and labelledVesselCount=0 cannot contain any
    vessel — the ceiling-is-zero case gets its own, clearer message rather
    than folding silently into the generic range check."""
    parent = _make_parent(quantity=0, labelled=0, code="PO-BLU-G3-002")
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[
            ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE, vesselNo=1)
        ],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    with pytest.raises(HTTPException) as exc_info:
        await _run_propagate(data, [parent])

    assert exc_info.value.status_code == 400
    assert "neither a labelledVesselCount nor a quantity" in exc_info.value.detail
    assert parent.accessionCode in exc_info.value.detail


# ---------------------------------------------------------------------------
# vesselNo valid against quantity alone when labels were never printed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vessel_no_valid_against_quantity_when_labelled_count_is_zero() -> None:
    """Labels may never have been printed, but a lab that hand-numbers its
    plates still has a meaningful vessel 4 of 5 — the max() with quantity is
    what makes that legal."""
    parent = _make_parent(quantity=5, labelled=0, code="PO-BLU-G3-003")
    data = PropagationCreate(
        method=PropagationMethod.AGAR_TO_AGAR,
        parents=[
            ParentRef(accessionId=parent.id, role=ParentRole.CLONE_SOURCE, vesselNo=4)
        ],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    event, children = await _run_propagate(data, [parent])

    assert event.parents[0].vesselNo == 4
    assert children[0].parents[0].vesselNo == 4


# ---------------------------------------------------------------------------
# Two-parent cross — distinct vesselNo per parent
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_cross_carries_distinct_vessel_no_per_parent() -> None:
    dam = _make_parent(quantity=8, labelled=8, code="PO-DAM-G0-001")
    sire = _make_parent(quantity=3, labelled=3, code="PO-SIRE-G0-001")
    data = PropagationCreate(
        method=PropagationMethod.BREEDING,
        parents=[
            ParentRef(accessionId=dam.id, role=ParentRole.DAM, vesselNo=2),
            ParentRef(accessionId=sire.id, role=ParentRole.SIRE, vesselNo=1),
        ],
        targets=[PropagationTarget(form=VesselForm.PETRI_DISH, quantity=1)],
    )

    event, children = await _run_propagate(data, [dam, sire])

    parents_by_role = {p.role: p for p in event.parents}
    assert parents_by_role[ParentRole.DAM].vesselNo == 2
    assert parents_by_role[ParentRole.SIRE].vesselNo == 1

    child_parents_by_role = {p.role: p for p in children[0].parents}
    assert child_parents_by_role[ParentRole.DAM].vesselNo == 2
    assert child_parents_by_role[ParentRole.SIRE].vesselNo == 1


# ---------------------------------------------------------------------------
# Split copies parents (and vesselNo) verbatim — unchanged by T-805
# ---------------------------------------------------------------------------


def _make_split_collection(
    source_doc: Dict[str, Any],
) -> Tuple[MagicMock, List[Dict[str, Any]], Dict[str, Any]]:
    state: Dict[str, Any] = dict(source_doc)
    insert_calls: List[Dict[str, Any]] = []

    async def _find_one(query: Dict[str, Any], *args: Any, **kwargs: Any) -> Optional[Dict[str, Any]]:
        if query.get(_ACCESSION_ID_KEY) == state.get(_ACCESSION_ID_KEY):
            return dict(state)
        return None

    async def _update_one(query: Dict[str, Any], update: Dict[str, Any], *args: Any, **kwargs: Any) -> None:
        if query.get(_ACCESSION_ID_KEY) == state.get(_ACCESSION_ID_KEY):
            for field, amount in update.get("$inc", {}).items():
                state[field] = state.get(field, 0) + amount
            state.update(update.get("$set", {}))

    async def _insert_one(doc: Dict[str, Any], *args: Any, **kwargs: Any) -> None:
        insert_calls.append(doc)

    def _find(*args: Any, **kwargs: Any):
        class _Empty:
            def __aiter__(self):
                return self

            async def __anext__(self):
                raise StopAsyncIteration

        return _Empty()

    col = MagicMock()
    col.find_one = AsyncMock(side_effect=_find_one)
    col.update_one = AsyncMock(side_effect=_update_one)
    col.insert_one = AsyncMock(side_effect=_insert_one)
    col.find = MagicMock(side_effect=_find)
    return col, insert_calls, state


@pytest.mark.asyncio
async def test_split_child_inherits_parents_including_vessel_no() -> None:
    """A split is the same material, not a new generation — `parents`
    (including any `vesselNo` on it) rides along unchanged. T-805 changes
    nothing about split_accession(); this pins that down."""
    upstream_parent_id = str(uuid.uuid4())
    source = Accession(
        lineId=str(uuid.uuid4()),
        accessionCode="PO-BLU-G4-001",
        form=VesselForm.PETRI_DISH,
        quantity=6,
        unit="plates",
        labelledVesselCount=6,
        cloneGeneration=4,
        parents=[
            ParentRef(
                accessionId=upstream_parent_id,
                role=ParentRole.CLONE_SOURCE,
                vesselNo=4,
            )
        ],
    )
    split_data = AccessionSplit(quantity=2)

    source_doc = model_to_doc(source, _ACCESSION_ID_KEY)
    col, insert_calls, _state = _make_split_collection(source_doc)

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=col)

    with patch(
        "src.modules.genetics.services.accession.accession_service.genetics_db.get_database",
        return_value=db,
    ), patch(
        "src.modules.genetics.services.accession.accession_service.LineService.get_line",
        new=AsyncMock(return_value=SimpleNamespace(code="PO-BLU")),
    ), patch(
        "src.modules.genetics.services.accession.accession_service.AccessionService.mint_code",
        new=AsyncMock(return_value="PO-BLU-G4-100"),
    ):
        _updated_source, child = await AccessionService.split_accession(
            source.id, split_data, _current_user()
        )

    assert child.parents == source.parents
    assert child.parents[0].vesselNo == 4
    assert insert_calls[0]["parents"][0]["vesselNo"] == 4
