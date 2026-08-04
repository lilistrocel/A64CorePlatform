"""
Protocols Module - SOP Model

A protocol is a written standard operating procedure: how a job is done in this
lab or on this farm.

Two things make it more than a document store:

* **Versioning.** An SOP that silently changes is worse than no SOP — work
  recorded last month was done under the old text. Editing the content bumps
  the version, and anything that referenced a version keeps pointing at it.
* **``appliesTo``.** Scope tags bind a protocol to the place the work actually
  happens, so the cloning SOP appears inside the Propagate modal rather than
  waiting to be looked up. Without this a protocol library becomes a graveyard.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import ProtocolCategory, ProtocolStatus


class ProtocolImage(BaseModel):
    """A visual reference for a step or for the procedure as a whole.

    Two sources, in order of preference:

    * ``attachmentId`` — a photo taken in THIS lab, uploaded through the
      attachments module. Always better than a stock image: it shows your
      substrate, your lighting, your strain, and it is unambiguously yours to
      use.
    * ``externalUrl`` — a cited published figure, for cases the lab has not
      photographed yet. ``attribution`` is required in spirit here; embedding
      someone else's photograph without crediting it is not acceptable, and an
      uncredited image cannot be checked by whoever reads it later.

    ``showsWhat`` is deliberately separate from ``caption``: a visual guide is
    only useful if it states what the reader is supposed to be looking at, not
    merely what the picture is of.
    """

    attachmentId: Optional[str] = Field(
        None, description="Attachment id — a photo taken in this lab (preferred)"
    )
    externalUrl: Optional[str] = Field(
        None,
        max_length=1000,
        description="Cited published figure, when no local photo exists",
    )
    caption: str = Field(..., min_length=1, max_length=300)
    attribution: Optional[str] = Field(
        None,
        max_length=300,
        description="Source and licence — required for externalUrl",
    )
    showsWhat: Optional[str] = Field(
        None,
        max_length=500,
        description="What the reader should be looking at, e.g. 'rhizomorphic strands, not tomentose fluff'",
    )


class ProtocolStep(BaseModel):
    """One numbered step in a procedure."""

    order: int = Field(..., ge=1, description="1-based position")
    text: str = Field(..., min_length=1, max_length=2000)
    durationMinutes: Optional[int] = Field(
        None, ge=0, description="Expected time for this step, where it matters"
    )
    isCritical: bool = Field(
        False,
        description=(
            "Steps that get skipped under time pressure and cause the failure "
            "later — flame the loop, let the agar set, cool before inoculating."
        ),
    )
    images: List[ProtocolImage] = Field(
        default_factory=list, description="Visual references for this step"
    )
    notes: Optional[str] = Field(None, max_length=1000)


class Consumable(BaseModel):
    """A material or piece of equipment the procedure needs to hand."""

    name: str = Field(..., min_length=1, max_length=200)
    quantity: Optional[str] = Field(
        None,
        max_length=100,
        description="Free text — '2 L', '1 per plate', 'as needed'",
    )
    notes: Optional[str] = Field(None, max_length=500)


class ProtocolBase(BaseModel):
    """Fields shared by create, update and document models."""

    code: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Short stable reference, e.g. SOP-LAB-004",
    )
    title: str = Field(..., min_length=1, max_length=250)
    category: ProtocolCategory = Field(ProtocolCategory.LAB)

    purpose: Optional[str] = Field(
        None,
        max_length=2000,
        description="What this procedure achieves and when to use it",
    )
    scope: Optional[str] = Field(
        None, max_length=2000, description="Where it applies, and where it does not"
    )

    ppe: List[str] = Field(
        default_factory=list, description="Required protective equipment"
    )
    safetyNotes: Optional[str] = Field(None, max_length=2000)

    equipment: List[Consumable] = Field(default_factory=list)
    materials: List[Consumable] = Field(default_factory=list)

    steps: List[ProtocolStep] = Field(default_factory=list)

    appliesTo: List[str] = Field(
        default_factory=list,
        description=(
            "Scope tags binding this protocol to where the work happens, so it "
            "surfaces in context. Namespaced strings — 'propagation:agar_to_agar', "
            "'media:pour', 'room:lab', 'harvest:record'."
        ),
    )

    references: List[str] = Field(
        default_factory=list, description="Related protocol codes or external sources"
    )
    referenceImages: List[ProtocolImage] = Field(
        default_factory=list,
        description=(
            "Visual references for the procedure as a whole — the identification "
            "gallery on a contamination protocol, for instance."
        ),
    )
    tags: List[str] = Field(default_factory=list)
    notes: Optional[str] = Field(None, max_length=2000)


class ProtocolCreate(ProtocolBase):
    """Payload for creating a protocol."""

    pass


class ProtocolUpdate(BaseModel):
    """Partial update.

    Changing any content field bumps ``version`` in the service layer; renaming
    or re-tagging does not, since neither changes what someone would do at the
    bench.
    """

    code: Optional[str] = Field(None, min_length=1, max_length=32)
    title: Optional[str] = Field(None, min_length=1, max_length=250)
    category: Optional[ProtocolCategory] = None
    purpose: Optional[str] = Field(None, max_length=2000)
    scope: Optional[str] = Field(None, max_length=2000)
    ppe: Optional[List[str]] = None
    safetyNotes: Optional[str] = Field(None, max_length=2000)
    equipment: Optional[List[Consumable]] = None
    materials: Optional[List[Consumable]] = None
    steps: Optional[List[ProtocolStep]] = None
    appliesTo: Optional[List[str]] = None
    references: Optional[List[str]] = None
    referenceImages: Optional[List[ProtocolImage]] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=2000)
    status: Optional[ProtocolStatus] = None


class Protocol(ProtocolBase):
    """Complete protocol document stored in ``protocols``."""

    id: str = Field(default_factory=lambda: str(uuid4()))

    version: int = Field(1, ge=1, description="Bumped whenever the procedure changes")
    status: ProtocolStatus = Field(ProtocolStatus.DRAFT)

    approvedBy: Optional[str] = Field(
        None, description="userId who approved this version"
    )
    approvedByName: Optional[str] = Field(None, max_length=200)
    approvedAt: Optional[datetime] = None

    createdBy: Optional[str] = None
    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class ProtocolRef(BaseModel):
    """A pinned reference to a protocol version, stored on the work record.

    Denormalised on purpose. Recording only an id would let the displayed
    procedure drift away from the one actually followed the moment someone
    edits the protocol — which is the failure the versioning exists to prevent.
    """

    protocolId: str
    code: Optional[str] = Field(None, max_length=32)
    title: Optional[str] = Field(None, max_length=250)
    version: int = Field(1, ge=1, description="The version followed at the time")
    followedAt: Optional[datetime] = None


class ApprovalRequest(BaseModel):
    """Approve the current version, moving a draft into active use."""

    approvedByName: Optional[str] = Field(
        None, max_length=200, description="Name to record; defaults to the caller"
    )
    notes: Optional[str] = Field(None, max_length=1000)
