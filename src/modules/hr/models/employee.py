"""
Employee Model

Represents an employee in the HR system.
Supports both English and Arabic names for UAE compliance.
"""

from datetime import datetime, date
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, EmailStr
from enum import Enum


class EmployeeStatus(str, Enum):
    """Employee status enumeration"""
    ACTIVE = "active"
    ON_LEAVE = "on_leave"
    TERMINATED = "terminated"


class Gender(str, Enum):
    """Gender enumeration"""
    MALE = "male"
    FEMALE = "female"


class MaritalStatus(str, Enum):
    """Marital status enumeration"""
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"


class EmergencyContact(BaseModel):
    """Emergency contact information"""
    name: str = Field(..., min_length=1, max_length=200, description="Emergency contact name")
    phone: str = Field(..., max_length=50, description="Emergency contact phone")
    relationship: str = Field(..., max_length=100, description="Relationship to employee")


class EmployeeBase(BaseModel):
    """Base employee fields"""
    # English name (required)
    firstName: str = Field(..., min_length=1, max_length=100, description="Employee first name (English)")
    lastName: str = Field(..., min_length=1, max_length=100, description="Employee last name (English)")

    # Arabic name (optional - for UAE official documents)
    arabicFirstName: Optional[str] = Field(None, max_length=100, description="Employee first name (Arabic)")
    arabicMiddleName: Optional[str] = Field(None, max_length=100, description="Employee middle name (Arabic)")
    arabicLastName: Optional[str] = Field(None, max_length=100, description="Employee last name (Arabic)")

    # Contact information
    email: EmailStr = Field(..., description="Employee email address")
    phone: Optional[str] = Field(None, max_length=50, description="Employee phone number")

    # Employment details
    department: str = Field(..., min_length=1, max_length=100, description="Department")
    position: str = Field(..., min_length=1, max_length=100, description="Job position")
    hireDate: date = Field(..., description="Date of hire")
    status: EmployeeStatus = Field(EmployeeStatus.ACTIVE, description="Employee status")

    # Personal details
    gender: Optional[Gender] = Field(None, description="Employee gender")
    nationality: Optional[str] = Field(None, max_length=100, description="Employee nationality")
    maritalStatus: Optional[MaritalStatus] = Field(None, description="Marital status")

    # UAE-specific identification
    emiratesId: Optional[str] = Field(None, max_length=20, description="Emirates ID number (15 digits)")
    visaIssuancePlace: Optional[str] = Field(None, max_length=100, description="Place of visa issuance")

    # Emergency contact
    emergencyContact: Optional[EmergencyContact] = Field(None, description="Emergency contact information")


class EmployeeCreate(EmployeeBase):
    """Schema for creating a new employee"""
    pass


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee"""
    # English name
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)

    # Arabic name
    arabicFirstName: Optional[str] = Field(None, max_length=100)
    arabicMiddleName: Optional[str] = Field(None, max_length=100)
    arabicLastName: Optional[str] = Field(None, max_length=100)

    # Contact
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)

    # Employment
    department: Optional[str] = Field(None, min_length=1, max_length=100)
    position: Optional[str] = Field(None, min_length=1, max_length=100)
    hireDate: Optional[date] = None
    status: Optional[EmployeeStatus] = None

    # Personal
    gender: Optional[Gender] = None
    nationality: Optional[str] = Field(None, max_length=100)
    maritalStatus: Optional[MaritalStatus] = None

    # UAE identification
    emiratesId: Optional[str] = Field(None, max_length=20)
    visaIssuancePlace: Optional[str] = Field(None, max_length=100)

    # Emergency
    emergencyContact: Optional[EmergencyContact] = None


class Employee(EmployeeBase):
    """Complete employee model with all fields"""
    employeeId: UUID = Field(default_factory=uuid4, description="Unique employee identifier")
    employeeCode: Optional[str] = Field(None, description="Human-readable employee code (e.g., E001)")

    # Tracking information
    createdBy: UUID = Field(..., description="User ID who created this employee")
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "employeeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "employeeCode": "AST-0202",
                "firstName": "Mohammed",
                "lastName": "Shahed",
                "arabicFirstName": "محمد",
                "arabicMiddleName": "شاهد",
                "arabicLastName": "عالم شفيع",
                "email": "ast-0202@a64farms.ae",
                "phone": "+971-50-123-4567",
                "department": "Farm Operations",
                "position": "Farm Worker",
                "hireDate": "2024-01-15",
                "status": "active",
                "gender": "male",
                "nationality": "Bangladeshi",
                "maritalStatus": "single",
                "emiratesId": "784199198369235",
                "visaIssuancePlace": "ABU DHABI",
                "emergencyContact": {
                    "name": "Ahmed Khan",
                    "phone": "+971-50-987-6543",
                    "relationship": "Brother"
                },
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
