"""
Genetics Repo Module - Medium Recipe & Batch Models

Two layers, deliberately separate:

* **Recipe** — the formulation, versioned. Bumping the version on an existing
  recipe is what makes "we changed the agar and yields moved" answerable.
* **Batch** — one actual pour or cook, referencing a recipe *and* snapshotting
  the ingredient list at the time. Recipes drift; a batch record must stay
  truthful about what was in the dish years later.

``additives`` is the experiment hook: the elements being trialled are kept
apart from the base formulation so "show me everything grown on a medium
containing X" is a direct query rather than a text search.
"""

from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from .enums import IngredientUnit, MediumBatchStatus, MediumType, SterilizationMethod


class Ingredient(BaseModel):
    """One component of a medium formulation.

    ``unit`` is a controlled vocabulary, not free text — see IngredientUnit for
    why. Without it the same quantity ends up stored four ways and any later
    ratio or scaling calculation splits across the spellings.
    """

    name: str = Field(
        ..., min_length=1, max_length=120, description="e.g. 'Malt extract'"
    )
    amount: Optional[float] = Field(None, ge=0)
    unit: Optional[IngredientUnit] = Field(
        None,
        description="Controlled unit, e.g. g/L. Free text is deliberately not accepted.",
    )
    notes: Optional[str] = Field(None, max_length=500)


class Additive(Ingredient):
    """A trialled element layered on top of the base formulation."""

    purpose: Optional[str] = Field(
        None,
        max_length=300,
        description="Why it was added — 'testing growth rate response', 'antibacterial'",
    )
    isExperimental: bool = Field(
        True,
        description="Flags this as under test rather than standard practice",
    )


class Sterilization(BaseModel):
    """Sterilisation / pasteurisation parameters for the batch."""

    method: SterilizationMethod = Field(SterilizationMethod.AUTOCLAVE)
    temperatureC: Optional[float] = Field(None, description="e.g. 121")
    minutes: Optional[int] = Field(None, ge=0, description="e.g. 15")
    pressurePsi: Optional[float] = Field(None, ge=0, description="e.g. 15")


class RecipeBase(BaseModel):
    """Fields shared by recipe create, update and document models."""

    name: str = Field(
        ..., min_length=1, max_length=200, description="e.g. 'MEA + activated carbon'"
    )
    code: str = Field(
        ..., min_length=1, max_length=32, description="Short code, e.g. 'MEA-AC'"
    )
    type: MediumType = Field(MediumType.AGAR)
    description: Optional[str] = Field(None, max_length=2000)

    ingredients: List[Ingredient] = Field(default_factory=list)
    additives: List[Additive] = Field(default_factory=list)

    targetPh: Optional[float] = Field(None, ge=0, le=14)
    sterilization: Sterilization = Field(default_factory=Sterilization)
    yieldsVessels: Optional[int] = Field(
        None, ge=0, description="Typical vessels per prepared batch"
    )
    notes: Optional[str] = Field(None, max_length=2000)


class RecipeCreate(RecipeBase):
    """Payload for creating a medium recipe."""

    pass


class RecipeUpdate(BaseModel):
    """Partial update.

    Any change to the formulation bumps ``version`` in the service layer;
    existing batches keep their snapshot and are unaffected.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    code: Optional[str] = Field(None, min_length=1, max_length=32)
    type: Optional[MediumType] = None
    description: Optional[str] = Field(None, max_length=2000)
    ingredients: Optional[List[Ingredient]] = None
    additives: Optional[List[Additive]] = None
    targetPh: Optional[float] = Field(None, ge=0, le=14)
    sterilization: Optional[Sterilization] = None
    yieldsVessels: Optional[int] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)
    isActive: Optional[bool] = None


class Recipe(RecipeBase):
    """Complete recipe document stored in ``medium_recipes``."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    version: int = Field(1, ge=1, description="Bumped whenever the formulation changes")
    isActive: bool = Field(True)

    createdBy: Optional[str] = None
    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)


class BatchQC(BaseModel):
    """Quality outcome for a prepared batch."""

    contaminatedCount: int = Field(0, ge=0, description="Vessels lost to contamination")
    notes: Optional[str] = Field(None, max_length=1000)


class BatchCreate(BaseModel):
    """Payload for recording one prepared batch of medium."""

    recipeId: str = Field(..., description="Recipe this batch was made from")
    batchCode: Optional[str] = Field(
        None,
        max_length=64,
        description="Auto-generated from the recipe code and date when omitted",
    )
    preparedAt: Optional[datetime] = Field(None, description="Defaults to now")
    preparedBy: Optional[str] = Field(
        None, description="userId; defaults to the caller"
    )
    vesselCount: int = Field(1, ge=0, description="Plates/jars poured")
    vesselType: Optional[str] = Field(
        None, max_length=64, description="e.g. '90mm plates'"
    )
    sterilizerRun: Optional[str] = Field(
        None, max_length=64, description="Autoclave run reference"
    )
    sterilizationOverride: Optional[Sterilization] = Field(
        None,
        description="Actual parameters when they differed from the recipe",
    )
    protocolId: Optional[str] = Field(
        None, description="The SOP followed when preparing this batch (must be ACTIVE)"
    )
    notes: Optional[str] = Field(None, max_length=2000)


class BatchUpdate(BaseModel):
    """Partial update for a prepared batch."""

    batchCode: Optional[str] = Field(None, max_length=64)
    vesselCount: Optional[int] = Field(None, ge=0)
    vesselType: Optional[str] = Field(None, max_length=64)
    sterilizerRun: Optional[str] = Field(None, max_length=64)
    status: Optional[MediumBatchStatus] = None
    qc: Optional[BatchQC] = None
    notes: Optional[str] = Field(None, max_length=2000)


class Batch(BaseModel):
    """Complete batch document stored in ``medium_batches``.

    ``ingredientsSnapshot`` / ``additivesSnapshot`` freeze the formulation as it
    stood when the batch was made, so later recipe edits never rewrite history.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    batchCode: str = Field(..., max_length=64)

    recipeId: str
    recipeVersion: int = Field(1, ge=1)
    recipeName: Optional[str] = Field(
        None, max_length=200, description="Denormalised for display"
    )
    type: MediumType = Field(MediumType.AGAR)

    ingredientsSnapshot: List[Ingredient] = Field(default_factory=list)
    additivesSnapshot: List[Additive] = Field(default_factory=list)
    sterilization: Sterilization = Field(default_factory=Sterilization)

    preparedAt: datetime = Field(default_factory=datetime.utcnow)
    preparedBy: Optional[str] = None
    vesselCount: int = Field(0, ge=0)
    vesselType: Optional[str] = None
    sterilizerRun: Optional[str] = None

    status: MediumBatchStatus = Field(MediumBatchStatus.PREPARED)
    protocolRef: Optional[dict] = Field(
        None, description="Pinned {protocolId, code, title, version, followedAt}"
    )
    qc: BatchQC = Field(default_factory=BatchQC)
    notes: Optional[str] = None

    divisionId: Optional[str] = None
    organizationId: Optional[str] = None

    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
