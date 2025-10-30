"""
Farm Assignment Model

User assignment to farms - controls access permissions.
"""

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class FarmAssignmentCreate(BaseModel):
    """Schema for creating a farm assignment"""
    userId: UUID = Field(..., description="User ID to assign")
    userEmail: str = Field(..., description="User email")
    farmId: UUID = Field(..., description="Farm ID")
    role: str = Field(..., description="Role on this farm (manager, farmer)")


class FarmAssignment(FarmAssignmentCreate):
    """Complete farm assignment model with all fields"""
    assignmentId: UUID = Field(default_factory=uuid4, description="Unique assignment identifier")

    # Assignment details
    assignedBy: UUID = Field(..., description="User who made assignment")
    assignedByEmail: str = Field(..., description="Email of assigner")

    # Status
    isActive: bool = Field(True, description="Is assignment active")

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "assignmentId": "a1234567-89ab-cdef-0123-456789abcdef",
                "userId": "u1234567-89ab-cdef-0123-456789abcdef",
                "userEmail": "farmer@example.com",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "assignedBy": "manager-uuid",
                "assignedByEmail": "manager@example.com",
                "role": "farmer",
                "isActive": True,
                "createdAt": "2025-01-10T10:00:00Z",
                "updatedAt": "2025-01-10T10:00:00Z"
            }
        }
