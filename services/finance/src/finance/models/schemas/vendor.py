"""Pydantic schemas for vendors."""

from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, EmailStr, Field


class VendorCreate(BaseModel):
    """Request body for creating a vendor."""

    organizationId: str = Field(..., min_length=1)
    vendorCode: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    trn: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    contactEmail: Optional[EmailStr] = None
    contactPhone: Optional[str] = Field(None, max_length=50)
    paymentTerms: Optional[str] = Field(None, max_length=50)
    reconciliationAccountId: Optional[str] = None
    defaultExpenseAccountId: Optional[str] = None
    bankDetails: Optional[Dict[str, Any]] = None
    currency: str = Field("AED", min_length=3, max_length=3)


class VendorUpdate(BaseModel):
    """Request body for patching a vendor."""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    trn: Optional[str] = Field(None, max_length=50)
    address: Optional[str] = None
    contactEmail: Optional[EmailStr] = None
    contactPhone: Optional[str] = Field(None, max_length=50)
    paymentTerms: Optional[str] = Field(None, max_length=50)
    reconciliationAccountId: Optional[str] = None
    defaultExpenseAccountId: Optional[str] = None
    bankDetails: Optional[Dict[str, Any]] = None
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    isActive: Optional[bool] = None
    isBlocked: Optional[bool] = None


class VendorResponse(BaseModel):
    """Response representation of a vendor."""

    vendorId: str
    organizationId: str
    vendorCode: str
    name: str
    trn: Optional[str]
    address: Optional[str]
    contactEmail: Optional[str]
    contactPhone: Optional[str]
    paymentTerms: Optional[str]
    reconciliationAccountId: Optional[str]
    defaultExpenseAccountId: Optional[str]
    bankDetails: Optional[Dict[str, Any]]
    currency: str
    isActive: bool
    isBlocked: bool
    createdAt: datetime
    updatedAt: datetime

    model_config = {"from_attributes": True}
