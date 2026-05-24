"""
Organization Model

Represents a top-level organization that can have multiple divisions
across different industries.
"""

from datetime import datetime
from typing import Optional, List
from uuid import uuid4
from pydantic import BaseModel, Field


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


class OrganizationBase(BaseModel):
    """Base organization fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Organization name")
    slug: str = Field(..., min_length=1, max_length=100, description="URL-friendly slug (unique)")
    industries: List[str] = Field(
        default_factory=list,
        description="Industry types this organization operates in (e.g., vegetable_fruits, mushroom)"
    )
    logoUrl: Optional[str] = Field(None, max_length=500, description="Organization logo URL")
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
    Schema for PATCH /api/v1/organizations/{org_id}/modules (Wave 0).

    All fields optional so callers can patch a single toggle without
    sending the whole modules object.
    """
    financeEnabled: Optional[bool] = Field(
        None,
        description="Enable / disable the finance module for this tenant",
    )


class Organization(OrganizationBase):
    """Complete organization model with all fields"""
    organizationId: str = Field(default_factory=lambda: str(uuid4()), description="Unique organization identifier")
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
                "updatedAt": "2026-01-01T00:00:00Z"
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
