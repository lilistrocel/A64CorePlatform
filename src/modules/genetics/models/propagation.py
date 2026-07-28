"""
Genetics Repo Module - Propagation Event Model

The propagation event is the traceability edge: it records *how* material moved
from parent(s) to child(ren), not merely that it did. Lineage views are drawn
from these events, so the method, operator, date and medium used all survive
alongside the parent pointer.

One event may name one parent (a clone), two (a cross), or none of them
identified (unknown ancestry recorded after the fact).
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .accession import ParentRef, StorageLocation
from .enums import PropagationMethod, ReproductionMode, VesselForm


class PropagationTarget(BaseModel):
    """Describes the child accession(s) a propagation should produce.

    A single target creates one batch record carrying ``quantity`` vessels —
    the batch stays one row until something about one vessel diverges, at
    which point it is split out.
    """
    form: VesselForm = Field(..., description="Vessel form of the resulting material")
    quantity: int = Field(1, ge=1, description="Vessels/head produced")
    unit: str = Field("vessels", max_length=32)
    mediumBatchId: Optional[str] = Field(None, description="Medium the children were put onto")
    location: Optional[StorageLocation] = None
    label: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)

    # Generation overrides — omit to accept the derived values
    cloneGenerationOverride: Optional[int] = Field(
        None, ge=0, description="Force G instead of the derived value"
    )
    filialGenerationOverride: Optional[int] = Field(
        None, ge=0, description="Force F instead of the derived value"
    )

    # Set when a cross should found a new line (e.g. a named F1 hybrid)
    targetLineId: Optional[str] = Field(
        None,
        description="Line to assign the children to; defaults to the primary parent's line",
    )


class PropagationCreate(BaseModel):
    """Payload for performing a propagation.

    The service derives generations, mints accession codes, writes the child
    accessions and links everything back to the resulting event.
    """

    method: PropagationMethod = Field(..., description="Technique used")
    parents: List[ParentRef] = Field(
        default_factory=list,
        description="One parent for clones, two for crosses; entries may have a null accessionId",
    )
    targets: List[PropagationTarget] = Field(
        ...,
        min_length=1,
        description="Child accession batches to create",
    )

    performedAt: Optional[datetime] = Field(None, description="Defaults to now")
    performedBy: Optional[str] = Field(None, description="userId; defaults to the caller")
    operatorName: Optional[str] = Field(None, max_length=200, description="Free-text technician name")
    mediumBatchId: Optional[str] = Field(None, description="Default medium batch for all targets")
    notes: Optional[str] = Field(None, max_length=2000)


class PropagationEvent(BaseModel):
    """Complete propagation document stored in ``propagation_events``."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    eventCode: Optional[str] = Field(None, max_length=64)

    method: PropagationMethod
    reproductionMode: ReproductionMode = Field(
        ...,
        description="Derived from the method; recorded so historic events survive enum changes",
    )

    parents: List[ParentRef] = Field(default_factory=list)
    resultAccessionIds: List[str] = Field(default_factory=list)

    # Denormalised for lineage queries and display without extra lookups
    sourceLineIds: List[str] = Field(default_factory=list)
    resultLineIds: List[str] = Field(default_factory=list)
    vesselCount: int = Field(0, ge=0, description="Total vessels produced across all targets")

    mediumBatchId: Optional[str] = None
    performedAt: datetime = Field(default_factory=datetime.utcnow)
    performedBy: Optional[str] = None
    operatorName: Optional[str] = None
    notes: Optional[str] = None

    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)


class PropagationResult(BaseModel):
    """What the propagation endpoint hands back: the event plus its children."""
    event: PropagationEvent
    accessions: List[dict] = Field(
        default_factory=list,
        description="Newly created accession documents",
    )
