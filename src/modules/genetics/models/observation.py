"""
Genetics Repo Module - Observation Model

Dated notes recorded against an accession: growth rates, morphology,
contamination, sectoring, photos.

Any observation can be flagged ``isNovelTrait``. That flag is what turns a
passing note into a promotion candidate — the trait that gets spotted on one
plate becomes its own genetic line, with the ancestry still walking back to
the original dish.

T-805b: an observation may also cite ``vesselNo`` — which physical vessel of
the accession's batch it is about, e.g. plate #13 of a 6-plate batch. An
accession is a batch record, so without this an observation can only ever
say "this batch is slow", never "plate 13 is slow" — and per-vessel trait
tracking is the whole point of the ``isNovelTrait`` promote-to-line flow.
Same field, same shape, same validation as ``ParentRef.vesselNo`` (T-805a,
see ``accession.py`` and ``ObservationService._validate_vessel_no``).
Optional throughout: a note about the whole batch is a legitimate, common
thing to record, and forcing a vessel number would produce fiction.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import DerivationType, ObservationType


class ObservationMetrics(BaseModel):
    """Optional quantitative readings.

    All nullable — a contamination note carries none of these, a growth check
    carries two or three.
    """
    growthRateMmPerDay: Optional[float] = Field(None, ge=0)
    colonizationPercent: Optional[float] = Field(None, ge=0, le=100)
    daysToFull: Optional[int] = Field(None, ge=0)
    contaminationPercent: Optional[float] = Field(None, ge=0, le=100)
    vigorScore: Optional[float] = Field(None, ge=0, le=10, description="Subjective 0-10 vigour rating")
    temperatureC: Optional[float] = None
    humidityPercent: Optional[float] = Field(None, ge=0, le=100)


class ObservationBase(BaseModel):
    """Fields shared by create and document models."""

    accessionId: str = Field(..., description="Accession being observed")
    type: ObservationType = Field(ObservationType.NOTE)
    observedAt: Optional[datetime] = Field(None, description="Defaults to now")

    text: Optional[str] = Field(None, max_length=4000, description="What was seen")
    metrics: ObservationMetrics = Field(default_factory=ObservationMetrics)
    attachmentIds: List[str] = Field(
        default_factory=list,
        description="Attachment service ids for photos",
    )

    isNovelTrait: bool = Field(
        False,
        description="Marks this as a candidate for promotion into its own line",
    )
    traitName: Optional[str] = Field(
        None,
        max_length=120,
        description="Short name for the observed trait, e.g. 'fast rhizomorphic sector'",
    )

    vesselNo: Optional[int] = Field(
        None, ge=1,
        description="Which physical vessel of the batch this observation is about, e.g. plate #13.",
    )


class ObservationCreate(ObservationBase):
    """Payload for recording an observation."""
    pass


class ObservationUpdate(BaseModel):
    """Partial update — every field optional."""
    type: Optional[ObservationType] = None
    observedAt: Optional[datetime] = None
    text: Optional[str] = Field(None, max_length=4000)
    metrics: Optional[ObservationMetrics] = None
    attachmentIds: Optional[List[str]] = None
    isNovelTrait: Optional[bool] = None
    traitName: Optional[str] = Field(None, max_length=120)


class Observation(ObservationBase):
    """Complete observation document stored in ``genetic_observations``."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    observedAt: datetime = Field(default_factory=datetime.utcnow)

    # Denormalised so the line timeline can be built without joining accessions
    lineId: Optional[str] = None

    promotedToLineId: Optional[str] = Field(
        None,
        description="Set once this observation has been promoted into a new line",
    )

    observedBy: Optional[str] = None
    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class PromoteTraitRequest(BaseModel):
    """Promote a flagged observation into a brand-new genetic line.

    The new line is parented to the observed accession's line, and a founding
    accession is minted from the observed material so the physical chain is
    unbroken.
    """

    code: str = Field(..., min_length=1, max_length=32, description="Code for the new line, e.g. 'PO-BLU-S1'")
    commonName: str = Field(..., min_length=1, max_length=200)
    derivation: DerivationType = Field(DerivationType.SECTOR)
    description: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    createFoundingAccession: bool = Field(
        True,
        description="Mint a G0 accession on the new line, carried over from the observed material",
    )
