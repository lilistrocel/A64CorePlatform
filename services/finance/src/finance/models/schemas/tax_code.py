"""Pydantic schemas for tax codes."""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field


class TaxCodeCreate(BaseModel):
    """Request body for creating a tax code."""

    organizationId: str = Field(..., min_length=1)
    taxCode: str = Field(..., min_length=1, max_length=10)
    description: str = Field(..., min_length=1, max_length=200)
    rate: Decimal = Field(..., ge=0, le=100)
    inputTaxAccountId: Optional[str] = None
    outputTaxAccountId: Optional[str] = None
    # Reason: UAE VAT — reverse-charge tax codes (e.g. SR) require the buyer
    # to self-account VAT. Defaults to False for all standard codes.
    isReverseCharge: bool = False
    isActive: bool = True


class TaxCodeUpdate(BaseModel):
    """Request body for patching a tax code."""

    description: Optional[str] = Field(None, min_length=1, max_length=200)
    rate: Optional[Decimal] = Field(None, ge=0, le=100)
    inputTaxAccountId: Optional[str] = None
    outputTaxAccountId: Optional[str] = None
    isReverseCharge: Optional[bool] = None
    isActive: Optional[bool] = None


class TaxCodeResponse(BaseModel):
    """Response representation of a tax code."""

    organizationId: str
    taxCode: str
    description: str
    rate: Decimal
    inputTaxAccountId: Optional[str]
    outputTaxAccountId: Optional[str]
    # Reason: UAE VAT reverse-charge flag — exposed so the frontend and
    # callers can identify codes that require self-accounting treatment.
    isReverseCharge: bool
    isActive: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
