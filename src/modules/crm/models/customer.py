"""
Customer Model

Represents a customer or prospect in the CRM system.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, EmailStr
from enum import Enum


class CustomerType(str, Enum):
    """Customer type enumeration"""
    INDIVIDUAL = "individual"
    BUSINESS = "business"


class CustomerStatus(str, Enum):
    """Customer status enumeration"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    LEAD = "lead"
    PROSPECT = "prospect"


class Address(BaseModel):
    """Customer address"""
    street: Optional[str] = Field(None, max_length=200, description="Street address")
    city: Optional[str] = Field(None, max_length=100, description="City")
    state: Optional[str] = Field(None, max_length=100, description="State/Province")
    country: Optional[str] = Field(None, max_length=100, description="Country")
    postalCode: Optional[str] = Field(None, max_length=20, description="Postal/ZIP code")


class CustomerBase(BaseModel):
    """Base customer fields"""
    name: str = Field(..., min_length=1, max_length=200, description="Customer name")
    email: Optional[EmailStr] = Field(None, description="Customer email address")
    phone: Optional[str] = Field(None, max_length=50, description="Customer phone number")
    company: Optional[str] = Field(None, max_length=200, description="Company name")
    address: Optional[Address] = Field(None, description="Customer address")
    type: CustomerType = Field(CustomerType.INDIVIDUAL, description="Customer type (individual or business)")
    status: CustomerStatus = Field(CustomerStatus.LEAD, description="Customer status")
    notes: Optional[str] = Field(None, description="Additional notes about customer")
    tags: List[str] = Field(default_factory=list, description="Tags for categorization")


class CustomerCreate(CustomerBase):
    """Schema for creating a new customer"""
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating a customer"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    company: Optional[str] = Field(None, max_length=200)
    address: Optional[Address] = None
    type: Optional[CustomerType] = None
    status: Optional[CustomerStatus] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None


class Customer(CustomerBase):
    """Complete customer model with all fields"""
    customerId: UUID = Field(default_factory=uuid4, description="Unique customer identifier")
    customerCode: Optional[str] = Field(None, description="Human-readable customer code (e.g., C001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this customer")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "customerId": "c47ac10b-58cc-4372-a567-0e02b2c3d479",
                "customerCode": "C001",
                "name": "John Smith",
                "email": "john.smith@example.com",
                "phone": "+1-555-0123",
                "company": "Acme Corporation",
                "address": {
                    "street": "123 Main Street",
                    "city": "New York",
                    "state": "NY",
                    "country": "United States",
                    "postalCode": "10001"
                },
                "type": "business",
                "status": "active",
                "notes": "Key account - handles all northeast region sales",
                "tags": ["enterprise", "priority", "northeast"],
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
