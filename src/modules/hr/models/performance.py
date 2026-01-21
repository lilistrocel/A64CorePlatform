"""
Performance Review Model

Represents an employee performance review in the HR system.
"""

from datetime import datetime, date
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class PerformanceReviewBase(BaseModel):
    """Base performance review fields"""
    employeeId: UUID = Field(..., description="Employee ID being reviewed")
    reviewDate: date = Field(..., description="Date of the performance review")
    reviewerId: UUID = Field(..., description="User ID who conducted the review")
    rating: int = Field(..., ge=1, le=5, description="Performance rating (1-5)")
    happinessScore: int = Field(..., ge=1, le=10, description="Employee happiness score (1-10)")
    strengths: List[str] = Field(default_factory=list, description="List of employee strengths")
    areasForImprovement: List[str] = Field(default_factory=list, description="Areas for improvement")
    goals: List[str] = Field(default_factory=list, description="Goals for next review period")
    notes: Optional[str] = Field(None, description="Additional notes from the review")


class PerformanceReviewCreate(PerformanceReviewBase):
    """Schema for creating a new performance review"""
    pass


class PerformanceReviewUpdate(BaseModel):
    """Schema for updating a performance review"""
    reviewDate: Optional[date] = None
    reviewerId: Optional[UUID] = None
    rating: Optional[int] = Field(None, ge=1, le=5)
    happinessScore: Optional[int] = Field(None, ge=1, le=10)
    strengths: Optional[List[str]] = None
    areasForImprovement: Optional[List[str]] = None
    goals: Optional[List[str]] = None
    notes: Optional[str] = None


class PerformanceReview(PerformanceReviewBase):
    """Complete performance review model with all fields"""
    reviewId: UUID = Field(default_factory=uuid4, description="Unique review identifier")

    # Tracking information
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "reviewId": "r47ac10b-58cc-4372-a567-0e02b2c3d479",
                "employeeId": "e47ac10b-58cc-4372-a567-0e02b2c3d479",
                "reviewDate": "2025-01-15",
                "reviewerId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "rating": 4,
                "happinessScore": 8,
                "strengths": ["Strong technical skills", "Good team player", "Proactive"],
                "areasForImprovement": ["Time management", "Documentation"],
                "goals": ["Lead a major project", "Mentor junior developers"],
                "notes": "Excellent performance this quarter. Ready for increased responsibilities.",
                "createdAt": "2025-01-15T10:00:00Z",
                "updatedAt": "2025-01-15T10:00:00Z"
            }
        }
