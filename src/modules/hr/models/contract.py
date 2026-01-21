"""
Contract Model

Represents an employment contract in the HR system.
"""

from datetime import datetime, date
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class ContractType(str, Enum):
    """Contract type enumeration"""
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACTOR = "contractor"
    INTERN = "intern"


class ContractStatus(str, Enum):
    """Contract status enumeration"""
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"


class ContractBase(BaseModel):
    """Base contract fields"""
    employeeId: UUID = Field(..., description="Employee ID this contract belongs to")
    type: ContractType = Field(..., description="Contract type")
    startDate: date = Field(..., description="Contract start date")
    endDate: Optional[date] = Field(None, description="Contract end date (null for indefinite)")
    salary: float = Field(..., gt=0, description="Salary amount")
    currency: str = Field("USD", max_length=3, description="Currency code (ISO 4217)")
    benefits: List[str] = Field(default_factory=list, description="List of benefits included in contract")
    status: ContractStatus = Field(ContractStatus.ACTIVE, description="Contract status")
    documentUrl: Optional[str] = Field(None, max_length=500, description="URL to contract document")


class ContractCreate(ContractBase):
    """Schema for creating a new contract"""
    pass


class ContractUpdate(BaseModel):
    """Schema for updating a contract"""
    type: Optional[ContractType] = None
    startDate: Optional[date] = None
    endDate: Optional[date] = None
    salary: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None, max_length=3)
    benefits: Optional[List[str]] = None
    status: Optional[ContractStatus] = None
    documentUrl: Optional[str] = Field(None, max_length=500)


class Contract(ContractBase):
    """Complete contract model with all fields"""
    contractId: UUID = Field(default_factory=uuid4, description="Unique contract identifier")

    # Tracking information
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "contractId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
                "employeeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "type": "full_time",
                "startDate": "2024-01-15",
                "endDate": null,
                "salary": 75000.00,
                "currency": "USD",
                "benefits": ["Health Insurance", "401k Matching", "PTO"],
                "status": "active",
                "documentUrl": "https://docs.company.com/contracts/c47ac10b.pdf",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
