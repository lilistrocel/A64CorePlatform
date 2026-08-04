"""
Genetics Repo Module - Accession Model

An accession is the *physical* material: this petri dish, this LC jar, this
animal. It is what gets labelled, scanned and moved around the lab.

Two independent generation counters are carried:

* ``cloneGeneration`` (G) — asexual transfers. Only ever climbs within a clone
  chain, and is the senescence signal: G7 off one plate lineage is a vigour
  warning.
* ``filialGeneration`` (F) — sexual generations. Tracks trait segregation, not
  vigour; an F2 predicts variation, not decline.

They are orthogonal. A cross that is then cloned four times reads F1 · G4.
Both are auto-derived from the propagation method but remain overridable,
because lab convention beats our defaults.

Label / QR (T-804): the accession also carries ``publicToken`` (the opaque
key an unauthenticated scan resolves through) and ``labelledVesselCount``, a
high-water mark of printed vessel ordinals. The latter exists because
``AccessionService.split()`` decrements ``quantity`` — deriving a vessel
ordinal from ``quantity`` would retroactively orphan whichever printed label
corresponds to the vessel that just split off. See
``Docs/2-Working-Progress/genetics-label-qr-spec.md`` §3 for the full
reasoning; the field-level docstrings below repeat the essentials.

Vessel-level parentage (T-805): ``ParentRef.vesselNo`` records which physical
vessel of the parent *batch* material was taken from — an accession is a
batch, so "parent accessionId X" alone cannot say whether a propagation came
off plate 1 or plate 6 of a 6-plate batch. It rides on ``ParentRef`` rather
than the propagation event because a cross has two parents, each potentially
citing its own vessel. It only means anything because T-804's vessel
ordinals are stable and never renumbered (spec §3) — otherwise a vessel
number recorded today could point at the wrong physical plate tomorrow.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, computed_field

from ..services.common import generate_public_token
from .enums import AccessionStatus, ParentRole, VesselForm
from .line import Provenance


class ParentRef(BaseModel):
    """One parent of an accession.

    ``accessionId`` is optional so half-known ancestry survives: recording a
    known dam alongside an unknown sire keeps the half you do have, rather
    than forcing the whole cross to be anonymous.
    """

    accessionId: Optional[str] = Field(
        None, description="Parent accession; null when the parent is unidentified"
    )
    role: ParentRole = Field(ParentRole.CLONE_SOURCE)
    lineId: Optional[str] = Field(
        None, description="Denormalised parent line for fast lineage queries"
    )
    note: Optional[str] = Field(
        None, max_length=500, description="e.g. 'sire unrecorded, purchased litter'"
    )
    vesselNo: Optional[int] = Field(
        None,
        ge=1,
        description=(
            "Which physical vessel of the parent batch this material was taken "
            "from, e.g. plate #4 of a 6-plate batch. Optional: plenty of real "
            "transfers are genuinely 'from that batch' with nobody noting the "
            "plate, and forcing a number would only produce fiction."
        ),
    )


class StorageLocation(BaseModel):
    """Where the material physically sits.

    ``facilityId`` / ``roomId`` are real references into the mushroom module's
    facilities and rooms, which is what makes "what is in my lab right now" a
    query rather than a text search. They are deliberately plain strings and
    not enforced foreign keys: the genetics repo is shared across every
    division, and a plant or animal line may sit somewhere the mushroom module
    knows nothing about.

    ``facility`` / ``room`` remain as free text for exactly that case, and for
    material recorded before rooms were modelled.
    """

    facilityId: Optional[str] = Field(
        None, description="mushroom_facilities facilityId"
    )
    roomId: Optional[str] = Field(None, description="growing_rooms roomId")
    facility: Optional[str] = Field(
        None, max_length=120, description="Free-text fallback"
    )
    room: Optional[str] = Field(None, max_length=120, description="Free-text fallback")
    unit: Optional[str] = Field(
        None, max_length=120, description="Incubator, fridge, shelf, pen"
    )
    position: Optional[str] = Field(None, max_length=120, description="Rack/row/slot")
    temperatureC: Optional[float] = Field(None, description="Holding temperature")


class AccessionBase(BaseModel):
    """Fields shared by create, update and document models."""

    lineId: str = Field(..., description="Genetic line this material belongs to")

    # Physical form
    form: VesselForm = Field(..., description="Vessel / physical form")
    quantity: int = Field(
        1, ge=0, description="Vessel or head count held under this record"
    )
    unit: str = Field("vessels", max_length=32, description="plates, jars, seeds, head")

    # What it is growing on
    mediumBatchId: Optional[str] = Field(
        None, description="Medium batch this material sits on"
    )

    location: StorageLocation = Field(default_factory=StorageLocation)

    # Dates
    acquiredAt: Optional[datetime] = Field(
        None, description="Inoculation / sowing / birth date"
    )
    colonizedAt: Optional[datetime] = Field(
        None, description="Fully colonised / established date"
    )

    label: Optional[str] = Field(
        None, max_length=200, description="Human label written on the vessel"
    )
    notes: Optional[str] = Field(None, max_length=2000)
    tags: List[str] = Field(default_factory=list)


class AccessionCreate(AccessionBase):
    """Payload for registering material by hand (a G0, or an outside acquisition).

    Accessions produced by a propagation are created through the propagation
    endpoint instead, which derives generations and parentage automatically.
    """

    cloneGeneration: int = Field(
        0, ge=0, description="G — defaults to 0 for founding material"
    )
    filialGeneration: int = Field(0, ge=0, description="F — defaults to 0")
    parents: List[ParentRef] = Field(
        default_factory=list,
        description="Usually empty for founding material",
    )
    provenance: Optional[Provenance] = Field(
        None,
        description="Required in spirit for parentless material — where it came from",
    )
    accessionCode: Optional[str] = Field(
        None,
        max_length=64,
        description="Override the generated code; auto-built from line code + generation when omitted",
    )


class AccessionUpdate(BaseModel):
    """Partial update — every field optional."""

    form: Optional[VesselForm] = None
    quantity: Optional[int] = Field(None, ge=0)
    unit: Optional[str] = Field(None, max_length=32)
    mediumBatchId: Optional[str] = None
    location: Optional[StorageLocation] = None
    acquiredAt: Optional[datetime] = None
    colonizedAt: Optional[datetime] = None
    label: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)
    tags: Optional[List[str]] = None
    status: Optional[AccessionStatus] = None
    cloneGeneration: Optional[int] = Field(None, ge=0)
    filialGeneration: Optional[int] = Field(None, ge=0)
    provenance: Optional[Provenance] = None


class AccessionSplit(BaseModel):
    """Split N vessels out of a batch record into their own accession.

    Used when one plate in a batch of eight diverges — it sectors, or it blows
    up with contamination — and needs to be tracked on its own from then on.
    The split child keeps the same generations and parents; it is the *same*
    material, just separately tracked.
    """

    quantity: int = Field(..., ge=1, description="How many vessels to move out")
    reason: Optional[str] = Field(None, max_length=500)
    status: Optional[AccessionStatus] = Field(
        None,
        description="Status for the split-off record, e.g. 'contaminated'",
    )
    label: Optional[str] = Field(None, max_length=200)
    vesselNumbers: List[int] = Field(
        default_factory=list,
        description=(
            "Which printed vessel ordinals of the parent batch this split holds, "
            "e.g. [7]. Optional; when given, must be within the parent's "
            "labelledVesselCount and not already claimed by a sibling split. "
            "This is what lets the public resolver route a scan of the "
            "physical label numbered 7 to the correct record after it splits "
            "off — see genetics-label-qr-spec.md §3. Validation of these rules "
            "is implemented in a later step (T-804 step 2), not here."
        ),
    )


class Accession(AccessionBase):
    """Complete accession document stored in ``genetic_accessions``."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    accessionCode: str = Field(..., max_length=64, description="e.g. 'PO-BLU-G2-014'")

    # Generation counters — see module docstring
    cloneGeneration: int = Field(0, ge=0, description="G — asexual transfers")
    filialGeneration: int = Field(0, ge=0, description="F — sexual generations")

    parents: List[ParentRef] = Field(default_factory=list)
    provenance: Optional[Provenance] = Field(
        None, description="Set for parentless founding material"
    )

    status: AccessionStatus = Field(AccessionStatus.ACTIVE)

    # Link back to the propagation that produced this record
    sourceEventId: Optional[str] = Field(None, description="propagation_events id")
    splitFromAccessionId: Optional[str] = Field(
        None, description="Set when created via a batch split"
    )

    # Label / QR (T-804) — see module docstring below and
    # Docs/2-Working-Progress/genetics-label-qr-spec.md §3-4 for the reasoning.
    publicToken: str = Field(
        default_factory=generate_public_token,
        max_length=16,
        description=(
            "Opaque key for the unauthenticated public info page a scanned "
            "label resolves to. Not derived from any readable field — "
            "accessionCode is enumerable (PO-BLU-G3-004, -005, -006 ...) and "
            "the public page is unauthenticated, so the QR must encode "
            "something that carries zero information about the rest of the "
            "library. Minted once at accession creation, never regenerated."
        ),
    )
    labelledVesselCount: int = Field(
        0,
        ge=0,
        description=(
            "High-water mark of printed vessel ordinals — set (raised) on "
            "first label print, NEVER decremented. AccessionService.split() "
            "decrements quantity via `$inc`, so quantity cannot be used to "
            "derive vessel ordinals: a split would retroactively orphan the "
            "physical label for the vessel that moved out. Ordinals are "
            "always 1..labelledVesselCount, independent of the batch's "
            "current quantity. A vessel that has since split off is still "
            "counted here — the sticker on the shelf keeps its number."
        ),
    )
    sourceVesselNumbers: List[int] = Field(
        default_factory=list,
        description=(
            "Which physical vessel ordinals of the parent batch this record "
            "holds, e.g. [7]. Only set when created via a split that named "
            "them (AccessionSplit.vesselNumbers). Lets the public resolver "
            "walk forward from a stale label: given (token, n), it finds the "
            "child accession where splitFromAccessionId points at this batch "
            "and n is in sourceVesselNumbers, and resolves there instead. "
            "Empty for founding material and for splits that didn't name "
            "vessel numbers — the resolver then correctly reports the vessel "
            "as still part of the parent batch."
        ),
    )

    discardedAt: Optional[datetime] = None

    # Scope / audit
    createdBy: Optional[str] = None
    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def generationLabel(self) -> str:
        """Render the generation pair the way it appears on a label.

        Pure clone chains stay short ('G2'); once a cross is in the ancestry
        the filial counter is shown too ('F1-G2').

        Computed rather than stored — the service layer strips it before the
        document reaches MongoDB so the counters remain the only source of truth.
        """
        if self.filialGeneration > 0:
            return f"F{self.filialGeneration}-G{self.cloneGeneration}"
        return f"G{self.cloneGeneration}"
