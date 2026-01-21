"""
Marketing Budget Model

Represents a marketing budget in the Marketing system.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field
from enum import Enum


class BudgetStatus(str, Enum):
    """Budget status enumeration"""
    DRAFT = "draft"
    APPROVED = "approved"
    ACTIVE = "active"
    CLOSED = "closed"


class BudgetBase(BaseModel):
    """Base budget fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Budget name")
    year: int = Field(..., ge=2000, le=2100, description="Budget year")
    quarter: Optional[int] = Field(None, ge=1, le=4, description="Budget quarter (1-4)")
    totalAmount: float = Field(..., ge=0, description="Total budget amount")
    allocatedAmount: float = Field(0, ge=0, description="Amount allocated to campaigns")
    spentAmount: float = Field(0, ge=0, description="Amount already spent")
    currency: str = Field("USD", min_length=3, max_length=3, description="Currency code (ISO 4217)")
    status: BudgetStatus = Field(BudgetStatus.DRAFT, description="Budget status")


class BudgetCreate(BudgetBase):
    """Schema for creating a new budget"""
    pass


class BudgetUpdate(BaseModel):
    """Schema for updating a budget"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    year: Optional[int] = Field(None, ge=2000, le=2100)
    quarter: Optional[int] = Field(None, ge=1, le=4)
    totalAmount: Optional[float] = Field(None, ge=0)
    allocatedAmount: Optional[float] = Field(None, ge=0)
    spentAmount: Optional[float] = Field(None, ge=0)
    currency: Optional[str] = Field(None, min_length=3, max_length=3)
    status: Optional[BudgetStatus] = None


class Budget(BudgetBase):
    """Complete budget model with all fields"""
    budgetId: UUID = Field(default_factory=uuid4, description="Unique budget identifier")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this budget")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "budgetId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "name": "Q1 2025 Marketing Budget",
                "year": 2025,
                "quarter": 1,
                "totalAmount": 100000.00,
                "allocatedAmount": 50000.00,
                "spentAmount": 25000.00,
                "currency": "USD",
                "status": "active",
                "createdBy": "d4e5f6a7-b8c9-0123-def1-234567890123",
                "createdAt": "2025-01-20T10:00:00Z",
                "updatedAt": "2025-01-20T10:00:00Z"
            }
        }
