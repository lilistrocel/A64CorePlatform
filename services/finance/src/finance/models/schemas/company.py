"""Pydantic schemas for company codes."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CompanyCodeCreate(BaseModel):
    """Request body for creating a company code."""

    companyCode: str = Field(..., min_length=1, max_length=10)
    organizationId: str = Field(..., min_length=1)
    legalName: str = Field(..., min_length=1, max_length=200)
    trn: Optional[str] = Field(None, max_length=50)
    fiscalYearStartMonth: int = Field(1, ge=1, le=12)
    fiscalYearStartDay: int = Field(1, ge=1, le=31)
    defaultCurrency: str = Field("AED", min_length=3, max_length=3)


class CompanyCodeUpdate(BaseModel):
    """Request body for patching a company code."""

    legalName: Optional[str] = Field(None, min_length=1, max_length=200)
    trn: Optional[str] = Field(None, max_length=50)
    fiscalYearStartMonth: Optional[int] = Field(None, ge=1, le=12)
    fiscalYearStartDay: Optional[int] = Field(None, ge=1, le=31)
    defaultCurrency: Optional[str] = Field(None, min_length=3, max_length=3)
    isLocked: Optional[bool] = None


class CompanyCodeResponse(BaseModel):
    """Response representation of a company code."""

    companyCode: str
    organizationId: str
    legalName: str
    trn: Optional[str]
    fiscalYearStartMonth: int
    fiscalYearStartDay: int
    defaultCurrency: str
    isLocked: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
