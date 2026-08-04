"""
Genetics Repo Module - Genetic Line Model

A genetic line is the *named identity* — "Blue Oyster", "Cherry Roma F1",
"Nubian bloodline A". It is stable and abstract; the physical material that
carries it lives in the accession collection.

Lines form their own shallow tree via ``parentLineId``: when a novel trait is
promoted out of an observation, the new isolate becomes a line whose parent is
the line it sectored from.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import DerivationType, OrganismKind, ProvenanceType


class Provenance(BaseModel):
    """Where material came from when no parent accession is on file.

    Unknown ancestry is a recorded state, not an empty field — ``UNKNOWN`` with
    a free-text ``sourceNote`` preserves whatever partial knowledge exists.
    """

    type: ProvenanceType = Field(
        ProvenanceType.UNKNOWN, description="How the material was obtained"
    )
    sourceNote: Optional[str] = Field(
        None, max_length=1000, description="Vendor, collector, location, donor"
    )
    acquiredAt: Optional[datetime] = Field(None, description="When it entered the lab")


class Trait(BaseModel):
    """A declared characteristic of the line.

    Free-form on purpose: traits differ wildly across plants, fungi and animals,
    and the lab decides its own vocabulary.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="e.g. 'Cap colour', 'Growth rate'",
    )
    value: Optional[str] = Field(
        None, max_length=200, description="e.g. 'Deep blue', '6 mm/day'"
    )
    notes: Optional[str] = Field(None, max_length=500)


class LineBase(BaseModel):
    """Fields shared by create, update and document models."""

    # Identity
    code: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="Short unique code used to build accession codes, e.g. 'PO-BLU'",
    )
    commonName: str = Field(
        ..., min_length=1, max_length=200, description="e.g. 'Blue Oyster'"
    )
    kind: OrganismKind = Field(
        ..., description="Biological domain — plant, fungus or animal"
    )
    scientificName: Optional[str] = Field(
        None, max_length=200, description="e.g. 'Pleurotus ostreatus'"
    )
    species: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)

    # Ancestry between lines (mutation / sector / selection lineage)
    parentLineId: Optional[str] = Field(
        None, description="Line this one was derived from"
    )
    derivation: DerivationType = Field(
        DerivationType.ORIGINAL,
        description="How this line relates to its parent line",
    )

    # Origin of the founding material
    provenance: Provenance = Field(default_factory=Provenance)

    # Characteristics
    traits: List[Trait] = Field(default_factory=list)
    tags: List[str] = Field(
        default_factory=list, description="Free-form labels for filtering"
    )

    # Optional links into the cultivation modules so growing targets carry over
    linkedStrainId: Optional[str] = Field(None, description="mushroom_strains.strainId")
    linkedPlantDataId: Optional[str] = Field(None, description="plant_data plantId")


class LineCreate(LineBase):
    """Payload for creating a genetic line."""

    pass


class LineUpdate(BaseModel):
    """Partial update — every field optional."""

    code: Optional[str] = Field(None, min_length=1, max_length=32)
    commonName: Optional[str] = Field(None, min_length=1, max_length=200)
    kind: Optional[OrganismKind] = None
    scientificName: Optional[str] = Field(None, max_length=200)
    species: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)
    parentLineId: Optional[str] = None
    derivation: Optional[DerivationType] = None
    provenance: Optional[Provenance] = None
    traits: Optional[List[Trait]] = None
    tags: Optional[List[str]] = None
    linkedStrainId: Optional[str] = None
    linkedPlantDataId: Optional[str] = None
    isActive: Optional[bool] = None


class Line(LineBase):
    """Complete genetic line document stored in ``genetic_lines``.

    The model field is ``id``; the service layer renames it to ``lineId`` on
    the way into MongoDB, matching the convention used by the other modules.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))

    isActive: bool = Field(True)

    # Scope / audit
    createdBy: Optional[str] = Field(None, description="userId of the creator")
    divisionId: Optional[str] = Field(None, description="Division scope")
    organizationId: Optional[str] = Field(None, description="Organization scope")

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class LineStats(BaseModel):
    """Rollup counters shown on the repo home cards."""

    totalAccessions: int = 0
    activeAccessions: int = 0
    contaminatedAccessions: int = 0
    maxCloneGeneration: int = 0
    maxFilialGeneration: int = 0
    childLineCount: int = 0
    lastActivityAt: Optional[datetime] = None


class LineWithStats(Line):
    """Line document enriched with accession rollups."""

    stats: LineStats = Field(default_factory=LineStats)
