"""
Purchasing Module — Vendor Pydantic Models

Defines the vendor master document shape for the MongoDB `vendors` collection.
All monetary amounts use Decimal for exactness.
"""

from datetime import datetime
from decimal import Decimal
from typing import Any, Dict, Literal, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, field_validator


class BankDetails(BaseModel):
    """
    Embedded bank details for a vendor.

    All fields optional so callers can store partial information.
    """

    bankName: Optional[str] = None
    accountNumber: Optional[str] = None
    iban: Optional[str] = None
    swift: Optional[str] = None


class ContactInfo(BaseModel):
    """Embedded contact information."""

    contactName: Optional[str] = None
    contactEmail: Optional[str] = None
    contactPhone: Optional[str] = None


# ---------------------------------------------------------------------------
# Input models
# ---------------------------------------------------------------------------


class VendorCreate(BaseModel):
    """
    Request model for creating a vendor.

    Args:
        organizationId: Owning organisation UUID.
        vendorCode: Optional — auto-generated if omitted (sequential VND-XXXXXX).
        name: Vendor display name.
        trn: UAE Tax Registration Number (exactly 15 digits if supplied).
        ...other optional fields.

    Raises:
        ValueError: If currencyCode is not 'AED', or TRN format is invalid,
                    or creditLimit < 0.
    """

    organizationId: UUID
    vendorCode: Optional[str] = Field(None, max_length=20)
    name: str = Field(..., min_length=1, max_length=200)
    trn: Optional[str] = Field(
        None, description="UAE TRN — exactly 15 digits if supplied"
    )
    addressLine1: Optional[str] = Field(None, max_length=200)
    addressLine2: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    country: str = Field(default="United Arab Emirates", max_length=100)
    contactName: Optional[str] = Field(None, max_length=200)
    contactEmail: Optional[str] = Field(None, max_length=200)
    contactPhone: Optional[str] = Field(None, max_length=50)
    paymentTermsCode: Optional[str] = Field(None, max_length=20)
    currencyCode: str = Field(default="AED", max_length=3)
    creditLimit: Optional[Decimal] = Field(None, ge=0)
    bankDetails: Optional[BankDetails] = None
    notes: Optional[str] = None

    @field_validator("trn")
    @classmethod
    def validate_trn(cls, v: Optional[str]) -> Optional[str]:
        """
        Validate UAE TRN format.

        Args:
            v: TRN string to validate.

        Returns:
            Validated TRN or None.

        Raises:
            ValueError: If TRN is not exactly 15 digits.
        """
        if v is not None and v.strip():
            cleaned = v.strip()
            if not cleaned.isdigit() or len(cleaned) != 15:
                raise ValueError("TRN must be exactly 15 digits")
            return cleaned
        return v

    @field_validator("currencyCode")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        """
        Enforce AED-only currency for v1.

        Args:
            v: Currency code to validate.

        Returns:
            'AED' if valid.

        Raises:
            ValueError: If currency is not AED.
        """
        # Reason: v1 is AED-only — multi-currency support is a future phase
        if v.upper() != "AED":
            raise ValueError("Only AED currency is supported in v1")
        return v.upper()


class VendorUpdate(BaseModel):
    """
    Request model for partial vendor update.

    All fields optional — only supplied fields are updated.
    """

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    trn: Optional[str] = None
    addressLine1: Optional[str] = Field(None, max_length=200)
    addressLine2: Optional[str] = Field(None, max_length=200)
    city: Optional[str] = Field(None, max_length=100)
    country: Optional[str] = Field(None, max_length=100)
    contactName: Optional[str] = Field(None, max_length=200)
    contactEmail: Optional[str] = Field(None, max_length=200)
    contactPhone: Optional[str] = Field(None, max_length=50)
    paymentTermsCode: Optional[str] = Field(None, max_length=20)
    creditLimit: Optional[Decimal] = Field(None, ge=0)
    bankDetails: Optional[BankDetails] = None
    notes: Optional[str] = None
    isActive: Optional[bool] = None
    isBlocked: Optional[bool] = None

    @field_validator("trn")
    @classmethod
    def validate_trn(cls, v: Optional[str]) -> Optional[str]:
        """Validate UAE TRN format if supplied."""
        if v is not None and v.strip():
            cleaned = v.strip()
            if not cleaned.isdigit() or len(cleaned) != 15:
                raise ValueError("TRN must be exactly 15 digits")
            return cleaned
        return v


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class VendorResponse(BaseModel):
    """
    Vendor response model.

    Serialised from MongoDB document. Never exposes raw _id.
    """

    vendorId: str
    organizationId: str
    vendorCode: str
    name: str
    trn: Optional[str] = None
    addressLine1: Optional[str] = None
    addressLine2: Optional[str] = None
    city: Optional[str] = None
    country: str
    contactName: Optional[str] = None
    contactEmail: Optional[str] = None
    contactPhone: Optional[str] = None
    paymentTermsCode: Optional[str] = None
    currencyCode: str
    creditLimit: Optional[Decimal] = None
    bankDetails: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    isActive: bool
    isBlocked: bool
    createdAt: datetime
    updatedAt: datetime
    deletedAt: Optional[datetime] = None

    class Config:
        """Pydantic config."""

        from_attributes = True
