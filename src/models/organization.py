"""
Organization Model

Represents a top-level organization that can have multiple divisions
across different industries.
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
from pydantic import BaseModel, Field


class PublicInfoPageConfig(BaseModel):
    """
    What a scanned genetics label is allowed to reveal to the public
    internet (T-804 §4.4).

    The public label-info page (``GET /api/v1/public/genetics/i/{token}``)
    is the first unauthenticated route in the platform — anyone with a
    printed label can reach it, with no login. Every ``show*`` flag below
    therefore defaults to **False**. This is a deliberate privacy / trade
    secret decision, not an oversight:

    - ``showOperatorName`` — a technician's full name on a permanently
      public, crawlable page is a personal-data disclosure they never
      consented to. Initials are shown regardless; the full name is an
      explicit tenant opt-in.
    - ``showMediumIngredients`` — additive ratios are plausibly the most
      commercially sensitive data in the genetics repo. The recipe *name*
      alone is shown regardless and is enough to make the page useful.
    - ``showProtocolSteps`` — the SOP's code/title/version are shown
      regardless; the step-by-step procedure itself is opt-in.
    - ``showFacilityName`` — room, unit and position are NEVER shown on
      this page, opt-in or not; this flag only controls the facility name.

    ``enabled`` defaults True (opposite of the flags above) so the page
    works out of the box for a new tenant; a tenant that wants the page
    off entirely flips this one switch rather than disabling every field.
    """

    enabled: bool = Field(
        True,
        description="Master switch for the public label-info page for this tenant.",
    )
    showOperatorName: bool = Field(
        False,
        description="Show the technician's full name instead of initials.",
    )
    showMediumIngredients: bool = Field(
        False,
        description="Show the medium's ingredient list instead of just the recipe name.",
    )
    showProtocolSteps: bool = Field(
        False,
        description="Show the SOP's step text instead of just code/title/version.",
    )
    showFacilityName: bool = Field(
        False,
        description="Show the facility name. Room, unit and position are never shown.",
    )


class PublicInfoPageConfigUpdate(BaseModel):
    """
    Partial-update schema for `PublicInfoPageConfig`.

    Every field is optional and defaults to `None`, meaning "leave
    unchanged." This exists because `PublicInfoPageConfig` itself carries
    real (non-`None`) defaults for every field — parsing a caller's
    `{"enabled": false}` directly into a `PublicInfoPageConfig` would
    silently coerce `showOperatorName`, `showMediumIngredients`, etc. back
    to their model defaults, discarding whatever the tenant had previously
    opted into. `OrganizationService.update_modules` merges only the
    fields explicitly set here on top of the currently stored config, so a
    single-flag PATCH can never reset a sibling privacy flag.
    """

    enabled: Optional[bool] = Field(
        None,
        description="Master switch for the public label-info page for this tenant.",
    )
    showOperatorName: Optional[bool] = Field(
        None,
        description="Show the technician's full name instead of initials.",
    )
    showMediumIngredients: Optional[bool] = Field(
        None,
        description="Show the medium's ingredient list instead of just the recipe name.",
    )
    showProtocolSteps: Optional[bool] = Field(
        None,
        description="Show the SOP's step text instead of just code/title/version.",
    )
    showFacilityName: Optional[bool] = Field(
        None,
        description="Show the facility name. Room, unit and position are never shown.",
    )


class OrganizationModules(BaseModel):
    """
    Per-tenant module toggles (Wave 0 — T-059).

    Controls which optional modules render in the user portal for this
    tenant. `financeEnabled=false` hides the finance UI and gates the
    outbox writer so events stop queuing for tenants that don't pay
    for / run the finance service.
    """

    financeEnabled: bool = Field(
        True,
        description=(
            "When false, finance routes/sidebar entries are hidden and "
            "finance domain events skip the outbox."
        ),
    )
    publicInfoPage: PublicInfoPageConfig = Field(
        default_factory=PublicInfoPageConfig,
        description="T-804 — what a scanned genetics label may reveal publicly.",
    )


class OrganizationBase(BaseModel):
    """Base organization fields"""

    name: str = Field(
        ..., min_length=1, max_length=200, description="Organization name"
    )
    slug: str = Field(
        ..., min_length=1, max_length=100, description="URL-friendly slug (unique)"
    )
    industries: List[str] = Field(
        default_factory=list,
        description="Industry types this organization operates in (e.g., vegetable_fruits, mushroom)",
    )
    logoUrl: Optional[str] = Field(
        None, max_length=500, description="Organization logo URL"
    )
    modules: OrganizationModules = Field(
        default_factory=OrganizationModules,
        description="Per-tenant module toggles (Wave 0 — finance opt-in)",
    )


class OrganizationCreate(OrganizationBase):
    """Schema for creating a new organization"""

    pass


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization"""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    slug: Optional[str] = Field(None, min_length=1, max_length=100)
    industries: Optional[List[str]] = None
    logoUrl: Optional[str] = Field(None, max_length=500)
    isActive: Optional[bool] = None


class OrganizationModulesUpdate(BaseModel):
    """
    Schema for PATCH /api/v1/organizations/{org_id}/modules (Wave 0;
    `publicInfoPage` added as the T-804 follow-up that makes the public
    label-info page's `enabled` switch actually operable).

    All fields optional so callers can patch a single toggle without
    sending the whole modules object. `publicInfoPage`, in turn, is itself
    a partial-update object (`PublicInfoPageConfigUpdate`) — see that
    model's docstring for why a nested partial is required rather than
    accepting a full `PublicInfoPageConfig` here.
    """

    financeEnabled: Optional[bool] = Field(
        None,
        description="Enable / disable the finance module for this tenant",
    )
    publicInfoPage: Optional[PublicInfoPageConfigUpdate] = Field(
        None,
        description=(
            "Partial update to the public label-info page config. Only "
            "the fields explicitly set are changed; omitted fields keep "
            "their current stored value."
        ),
    )


class Organization(OrganizationBase):
    """Complete organization model with all fields"""

    organizationId: str = Field(
        default_factory=lambda: str(uuid4()),
        description="Unique organization identifier",
    )
    isActive: bool = Field(True, description="Is organization active")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "organizationId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "A64 Group",
                "slug": "a64-group",
                "industries": ["vegetable_fruits", "mushroom"],
                "logoUrl": None,
                "isActive": True,
                "createdAt": "2026-01-01T00:00:00Z",
                "updatedAt": "2026-01-01T00:00:00Z",
            }
        }


class OrganizationResponse(OrganizationBase):
    """Organization response model (public-facing)"""

    organizationId: str
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True
