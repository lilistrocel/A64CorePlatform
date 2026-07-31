"""
Unit tests for T-805b — let an observation cite which physical vessel of the
accession's batch it is about.

An accession is a batch record (``quantity`` vessels), not a single plate.
Before this, ``ObservationBase.accessionId`` alone meant "plate 13 is slow"
could only ever be recorded as "this batch is slow". ``ObservationBase.
vesselNo`` closes that gap — same field, same shape, same validation
reasoning as ``ParentRef.vesselNo`` (T-805a, see
``tests/unit/test_genetics/test_vessel_no.py`` and the module docstrings on
``observation.py`` / ``observation_service.py``).

Covers:
  - ObservationService.create_observation()
      - vesselNo supplied -> stored on the observation
      - vesselNo omitted -> None throughout, matching every observation
        recorded before this field existed (the common path; must not
        regress)
      - vesselNo above max(labelledVesselCount, quantity) -> 400
      - accession with neither labelledVesselCount nor quantity -> 400
      - vesselNo valid against quantity alone when labelledVesselCount is 0

No live database is used — Motor's AsyncIOMotorCollection is stood in for
with unittest.mock.AsyncMock/MagicMock, following the pattern already used in
tests/unit/test_genetics/test_vessel_no.py (there is no mongomock in
requirements.txt; motor==3.6.0 is the real async driver).
"""

from __future__ import annotations

import uuid
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from src.modules.genetics.models.accession import Accession
from src.modules.genetics.models.enums import VesselForm
from src.modules.genetics.models.observation import ObservationCreate
from src.modules.genetics.services.observation.observation_service import (
    ObservationService,
)

_SERVICE = "src.modules.genetics.services.observation.observation_service"


# ---------------------------------------------------------------------------
# Shared test doubles
# ---------------------------------------------------------------------------


def _make_accession(
    quantity: int = 6,
    labelled: int = 6,
    code: str = "PO-BLU-G3-001",
) -> Accession:
    return Accession(
        id=str(uuid.uuid4()),
        lineId=str(uuid.uuid4()),
        accessionCode=code,
        form=VesselForm.PETRI_DISH,
        quantity=quantity,
        unit="plates",
        labelledVesselCount=labelled,
        cloneGeneration=3,
    )


class _FakeUser:
    userId = "tester"
    divisionId = None
    organizationId = None


async def _run_create_observation(
    accession: Accession,
    vessel_no: Optional[int] = None,
    **extra,
):
    """Call ObservationService.create_observation with collaborators mocked.

    No real MongoDB is touched: AccessionService.get_accession is patched to
    return the given accession, and the insert_one call on the mocked db
    collection just needs to not raise.
    """
    collection = MagicMock()
    collection.insert_one = AsyncMock(return_value=None)

    db = MagicMock()
    db.__getitem__ = MagicMock(return_value=collection)

    data = ObservationCreate(
        accessionId=accession.id,
        text="growth check",
        vesselNo=vessel_no,
        **extra,
    )

    with patch(
        f"{_SERVICE}.AccessionService.get_accession",
        new=AsyncMock(return_value=accession),
    ), patch(f"{_SERVICE}.genetics_db.get_database", return_value=db):
        return await ObservationService.create_observation(data, _FakeUser())


# ---------------------------------------------------------------------------
# vesselNo supplied -> stored
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_with_vessel_no_stores_it() -> None:
    accession = _make_accession(quantity=6, labelled=6, code="PO-BLU-G3-001")

    observation = await _run_create_observation(accession, vessel_no=4)

    assert observation.vesselNo == 4
    assert observation.accessionId == accession.id


# ---------------------------------------------------------------------------
# vesselNo omitted -> the common path, must not regress
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_observation_without_vessel_no_behaves_as_before() -> None:
    """Omitting vesselNo (the default) must produce exactly today's shape:
    vesselNo is None and nothing else about the observation changes."""
    accession = _make_accession(quantity=6, labelled=6, code="PO-BLU-G3-001")

    observation = await _run_create_observation(accession, vessel_no=None)

    assert observation.vesselNo is None
    assert observation.accessionId == accession.id
    assert observation.text == "growth check"


# ---------------------------------------------------------------------------
# Validation rejections
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vessel_no_above_ceiling_is_rejected() -> None:
    accession = _make_accession(quantity=6, labelled=6, code="PO-BLU-G3-001")

    with pytest.raises(HTTPException) as exc_info:
        await _run_create_observation(accession, vessel_no=9)

    assert exc_info.value.status_code == 400
    assert "9" in exc_info.value.detail
    assert "1..6" in exc_info.value.detail
    assert accession.accessionCode in exc_info.value.detail


@pytest.mark.asyncio
async def test_vessel_no_rejected_when_accession_has_no_labelled_count_or_quantity() -> None:
    """A batch with quantity=0 and labelledVesselCount=0 cannot contain any
    vessel — the ceiling-is-zero case gets its own, clearer message rather
    than folding silently into the generic range check."""
    accession = _make_accession(quantity=0, labelled=0, code="PO-BLU-G3-002")

    with pytest.raises(HTTPException) as exc_info:
        await _run_create_observation(accession, vessel_no=1)

    assert exc_info.value.status_code == 400
    assert "neither a labelledVesselCount nor a quantity" in exc_info.value.detail
    assert accession.accessionCode in exc_info.value.detail


# ---------------------------------------------------------------------------
# vesselNo valid against quantity alone when labels were never printed
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vessel_no_valid_against_quantity_when_labelled_count_is_zero() -> None:
    """Labels may never have been printed, but a lab that hand-numbers its
    plates still has a meaningful vessel 4 of 5 — the max() with quantity is
    what makes that legal."""
    accession = _make_accession(quantity=5, labelled=0, code="PO-BLU-G3-003")

    observation = await _run_create_observation(accession, vessel_no=4)

    assert observation.vesselNo == 4
