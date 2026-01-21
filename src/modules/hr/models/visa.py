"""
Visa Model

Represents an employee visa/work permit in the HR system.
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class VisaStatus(str, Enum):
    """Visa status enumeration"""
    VALID = "valid"
    EXPIRED = "expired"
    PENDING_RENEWAL = "pending_renewal"


class VisaBase(BaseModel):
    """Base visa fields"""
    employeeId: UUID = Field(..., description="Employee ID this visa belongs to")
    visaType: str = Field(..., min_length=1, max_length=100, description="Type of visa (e.g., H1B, L1, etc.)")
    country: str = Field(..., min_length=1, max_length=100, description="Country the visa is for")
    issueDate: date = Field(..., description="Visa issue date")
    expiryDate: date = Field(..., description="Visa expiry date")
    status: VisaStatus = Field(VisaStatus.VALID, description="Visa status")
    documentUrl: Optional[str] = Field(None, max_length=500, description="URL to visa document")


class VisaCreate(VisaBase):
    """Schema for creating a new visa"""
    pass


class VisaUpdate(BaseModel):
    """Schema for updating a visa"""
    visaType: Optional[str] = Field(None, min_length=1, max_length=100)
    country: Optional[str] = Field(None, min_length=1, max_length=100)
    issueDate: Optional[date] = None
    expiryDate: Optional[date] = None
    status: Optional[VisaStatus] = None
    documentUrl: Optional[str] = Field(None, max_length=500)


class Visa(VisaBase):
    """Complete visa model with all fields"""
    visaId: UUID = Field(default_factory=uuid4, description="Unique visa identifier")

    # Tracking information
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "visaId": "v47ac10b-58cc-4372-a567-0e02b2c3d479",
                "employeeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "visaType": "H1B",
                "country": "United States",
                "issueDate": "2024-01-01",
                "expiryDate": "2027-01-01",
                "status": "valid",
                "documentUrl": "https://docs.company.com/visas/v47ac10b.pdf",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
