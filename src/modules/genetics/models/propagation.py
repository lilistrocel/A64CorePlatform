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
    protocolId: Optional[str] = Field(
        None,
        description=(
            "The SOP followed. Must be an ACTIVE protocol; its code, title and "
            "version are pinned onto the event so the trail survives later revisions."
        ),
    )
    notes: Optional[str] = Field(None, max_length=2000)


class PropagationAmend(BaseModel):
    """Payload to correct a propagation event's recorded date (T-808).

    Deliberately carries exactly one field. Propagation events are otherwise
    immutable: ``method``, ``parents``, ``targets``/``resultAccessionIds``,
    the generation counters and ``reproductionMode`` describe what
    biologically happened and rewriting them would rewrite lineage under
    labels already stuck on vessels. Attribution (``operatorName``,
    ``performedBy``) is a claim about a person and is likewise not amendable
    here — per the product decision, a correction may fix *when* something
    happened, never *who* did it. A model with more fields than the route
    accepts is an invitation for someone to wire the rest up later, so this
    model does not grow beyond ``performedAt`` even though it would be easy
    to add more.
    """

    performedAt: datetime = Field(
        ...,
        description="Corrected date/time the propagation actually happened",
    )


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
    protocolRef: Optional[dict] = Field(
        None, description="Pinned {protocolId, code, title, version, followedAt}"
    )
    performedAt: datetime = Field(default_factory=datetime.utcnow)
    performedBy: Optional[str] = None
    operatorName: Optional[str] = None
    notes: Optional[str] = None

    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)

    # T-808: set only when performedAt has been corrected after the fact. The
    # event log stays honest by recording that a correction happened rather
    # than silently rewriting performedAt with no trace — see
    # PropagationService.amend_event's docstring for the full reasoning.
    amendedAt: Optional[datetime] = Field(
        None, description="When performedAt was last corrected, if ever"
    )
    amendedBy: Optional[str] = Field(
        None, description="userId of whoever made the correction"
    )


class PropagationResult(BaseModel):
    """What the propagation endpoint hands back: the event plus its children."""
    event: PropagationEvent
    accessions: List[dict] = Field(
        default_factory=list,
        description="Newly created accession documents",
    )


class PropagationAmendResult(BaseModel):
    """What amending a propagation event hands back.

    Surfaces the cascade outcome explicitly rather than leaving the caller to
    infer it — the whole point of the "only where still equal to the old
    date" guard is that some accessions may legitimately be skipped, and that
    needs to be visible, not silent.
    """

    event: PropagationEvent
    accessionsUpdated: int = Field(
        ..., description="Result accessions whose acquiredAt was cascaded"
    )
    accessionsSkipped: int = Field(
        ...,
        description=(
            "Result accessions left untouched because their acquiredAt had "
            "already diverged from the event's old performedAt"
        ),
    )
