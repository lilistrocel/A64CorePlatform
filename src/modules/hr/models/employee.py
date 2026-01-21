"""
Employee Model

Represents an employee in the HR system.
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


class EmergencyContact(BaseModel):
    """Emergency contact information"""
    name: str = Field(..., min_length=1, max_length=200, description="Emergency contact name")
    phone: str = Field(..., max_length=50, description="Emergency contact phone")
    relationship: str = Field(..., max_length=100, description="Relationship to employee")


class EmployeeBase(BaseModel):
    """Base employee fields"""
    firstName: str = Field(..., min_length=1, max_length=100, description="Employee first name")
    lastName: str = Field(..., min_length=1, max_length=100, description="Employee last name")
    email: EmailStr = Field(..., description="Employee email address")
    phone: Optional[str] = Field(None, max_length=50, description="Employee phone number")
    department: str = Field(..., min_length=1, max_length=100, description="Department")
    position: str = Field(..., min_length=1, max_length=100, description="Job position")
    hireDate: date = Field(..., description="Date of hire")
    status: EmployeeStatus = Field(EmployeeStatus.ACTIVE, description="Employee status")
    emergencyContact: Optional[EmergencyContact] = Field(None, description="Emergency contact information")


class EmployeeCreate(EmployeeBase):
    """Schema for creating a new employee"""
    pass


class EmployeeUpdate(BaseModel):
    """Schema for updating an employee"""
    firstName: Optional[str] = Field(None, min_length=1, max_length=100)
    lastName: Optional[str] = Field(None, min_length=1, max_length=100)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(None, max_length=50)
    department: Optional[str] = Field(None, min_length=1, max_length=100)
    position: Optional[str] = Field(None, min_length=1, max_length=100)
    hireDate: Optional[date] = None
    status: Optional[EmployeeStatus] = None
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
                "employeeCode": "E001",
                "firstName": "John",
                "lastName": "Doe",
                "email": "john.doe@company.com",
                "phone": "+1-555-0123",
                "department": "Engineering",
                "position": "Software Engineer",
                "hireDate": "2024-01-15",
                "status": "active",
                "emergencyContact": {
                    "name": "Jane Doe",
                    "phone": "+1-555-0124",
                    "relationship": "Spouse"
                },
                "createdBy": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
