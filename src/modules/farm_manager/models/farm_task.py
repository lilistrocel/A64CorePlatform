"""
Farm Task Model

Task management for farmer operations - auto-generated and custom tasks.
"""

from datetime import datetime
from typing import Optional, List
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, field_validator
from enum import Enum


class TaskType(str, Enum):
    """Task type enumeration"""
    PLANTING = "planting"
    FRUITING_CHECK = "fruiting_check"
    HARVEST_READINESS = "harvest_readiness"
    DAILY_HARVEST = "daily_harvest"
    HARVEST_COMPLETION = "harvest_completion"
    CLEANING = "cleaning"
    CUSTOM = "custom"


class TaskStatus(str, Enum):
    """Task status enumeration"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class HarvestGrade(str, Enum):
    """Harvest quality grade"""
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    WASTE = "Waste"


class HarvestEntry(BaseModel):
    """Single harvest entry (for daily_harvest tasks with multiple entries)"""
    entryId: UUID = Field(default_factory=uuid4, description="Unique entry ID")
    userId: UUID = Field(..., description="User who recorded harvest")
    userEmail: str = Field(..., description="Email of user")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When harvest was recorded")
    quantity: float = Field(..., description="Quantity harvested (kg)", gt=0)
    grade: HarvestGrade = Field(..., description="Quality grade")
    notes: Optional[str] = Field(None, description="Optional notes")

    class Config:
        json_schema_extra = {
            "example": {
                "entryId": "e1234567-89ab-cdef-0123-456789abcdef",
                "userId": "u1234567-89ab-cdef-0123-456789abcdef",
                "userEmail": "farmer@example.com",
                "timestamp": "2025-01-15T09:30:00Z",
                "quantity": 25.5,
                "grade": "A",
                "notes": "Morning harvest, excellent quality"
            }
        }


class HarvestTotal(BaseModel):
    """Aggregated harvest totals for a daily_harvest task"""
    totalQuantity: float = Field(0, description="Total quantity harvested (kg)")
    gradeBreakdown: dict[HarvestGrade, float] = Field(
        default_factory=dict,
        description="Quantity per grade"
    )
    contributors: List[UUID] = Field(
        default_factory=list,
        description="User IDs who contributed"
    )
    entryCount: int = Field(0, description="Number of harvest entries")

    class Config:
        json_schema_extra = {
            "example": {
                "totalQuantity": 150.5,
                "gradeBreakdown": {
                    "A": 100.0,
                    "B": 35.5,
                    "C": 10.0,
                    "D": 3.0,
                    "Waste": 2.0
                },
                "contributors": [
                    "u1234567-89ab-cdef-0123-456789abcdef",
                    "u7654321-ba98-fedc-3210-fedcba987654"
                ],
                "entryCount": 8
            }
        }


class TaskData(BaseModel):
    """Task-specific data (varies by task type)"""
    # For harvest tasks
    harvestEntries: List[HarvestEntry] = Field(
        default_factory=list,
        description="Individual harvest entries (for daily_harvest)"
    )
    totalHarvest: Optional[HarvestTotal] = Field(
        None,
        description="Aggregated harvest totals"
    )

    # For all tasks
    notes: Optional[str] = Field(None, description="Task completion notes")
    photoUrls: List[str] = Field(default_factory=list, description="Optional task photos")

    # Validators to handle None values from existing database records
    @field_validator('harvestEntries', mode='before')
    @classmethod
    def validate_harvest_entries(cls, v):
        """Convert None to empty list for backward compatibility"""
        return v if v is not None else []

    @field_validator('photoUrls', mode='before')
    @classmethod
    def validate_photo_urls(cls, v):
        """Convert None to empty list for backward compatibility"""
        return v if v is not None else []

    class Config:
        json_schema_extra = {
            "example": {
                "harvestEntries": [
                    {
                        "entryId": "e1234567-89ab-cdef-0123-456789abcdef",
                        "userId": "u1234567-89ab-cdef-0123-456789abcdef",
                        "userEmail": "farmer@example.com",
                        "timestamp": "2025-01-15T09:30:00Z",
                        "quantity": 25.5,
                        "grade": "A"
                    }
                ],
                "totalHarvest": {
                    "totalQuantity": 25.5,
                    "gradeBreakdown": {"A": 25.5},
                    "contributors": ["u1234567-89ab-cdef-0123-456789abcdef"],
                    "entryCount": 1
                },
                "notes": "Task completed successfully",
                "photoUrls": ["https://storage.example.com/task-photo-1.jpg"]
            }
        }


class FarmTaskCreate(BaseModel):
    """Schema for creating a farm task"""
    farmId: UUID = Field(..., description="Farm ID")
    blockId: UUID = Field(..., description="Block ID")
    taskType: TaskType = Field(..., description="Type of task")
    title: Optional[str] = Field(None, description="Task title (auto-generated or custom)")
    scheduledDate: datetime = Field(..., description="When task should be done")
    dueDate: Optional[datetime] = Field(None, description="Task deadline (optional)")
    assignedTo: Optional[UUID] = Field(
        None,
        description="User ID for custom tasks (null for auto-tasks)"
    )
    description: Optional[str] = Field(None, description="Task description")
    triggerStateChange: Optional[str] = Field(
        None,
        description="Block status to transition to when task is completed (Phase 2)"
    )


class FarmTask(FarmTaskCreate):
    """Complete farm task model with all fields"""
    taskId: UUID = Field(default_factory=uuid4, description="Unique task identifier")

    # Status
    status: TaskStatus = Field(TaskStatus.PENDING, description="Task status")

    # Task data (completion info)
    taskData: TaskData = Field(default_factory=TaskData, description="Task-specific data")

    # Completion tracking
    completedBy: Optional[UUID] = Field(None, description="User who completed task")
    completedByEmail: Optional[str] = Field(None, description="Email of completer")
    completedAt: Optional[datetime] = Field(None, description="When task was completed")

    # Auto-generation tracking
    isAutoGenerated: bool = Field(False, description="Was task auto-generated")
    generatedFromCycleId: Optional[UUID] = Field(
        None,
        description="Block cycle that generated this task"
    )

    # Timestamps
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "taskId": "t1234567-89ab-cdef-0123-456789abcdef",
                "farmId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
                "blockId": "b1234567-89ab-cdef-0123-456789abcdef",
                "taskType": "daily_harvest",
                "status": "in_progress",
                "scheduledDate": "2025-01-15T00:00:00Z",
                "dueDate": "2025-01-15T23:59:59Z",
                "assignedTo": None,
                "description": "Daily harvest for Lettuce Block A",
                "taskData": {
                    "harvestEntries": [],
                    "totalHarvest": {
                        "totalQuantity": 0,
                        "gradeBreakdown": {},
                        "contributors": [],
                        "entryCount": 0
                    }
                },
                "completedBy": None,
                "completedByEmail": None,
                "completedAt": None,
                "isAutoGenerated": True,
                "generatedFromCycleId": "c1234567-89ab-cdef-0123-456789abcdef",
                "createdAt": "2025-01-15T00:00:00Z",
                "updatedAt": "2025-01-15T09:30:00Z"
            }
        }


class HarvestEntryCreate(BaseModel):
    """Schema for adding a harvest entry to a daily_harvest task"""
    quantity: float = Field(..., description="Quantity harvested (kg)", gt=0)
    grade: HarvestGrade = Field(..., description="Quality grade")
    notes: Optional[str] = Field(None, description="Optional notes")


class TaskCompletionData(BaseModel):
    """Schema for completing a non-harvest task"""
    notes: Optional[str] = Field(None, description="Completion notes")
    photoUrls: Optional[List[str]] = Field(None, description="Optional task photos")
    triggerTransition: Optional[bool] = Field(False, description="Phase 2: Trigger block state transition on completion")


class FarmTaskUpdate(BaseModel):
    """Schema for updating a task (used for rescheduling)"""
    scheduledDate: Optional[datetime] = Field(None, description="New scheduled date")
    dueDate: Optional[datetime] = Field(None, description="New due date")
    status: Optional[TaskStatus] = Field(None, description="New status")
    description: Optional[str] = Field(None, description="Updated description")


class FarmTaskListResponse(BaseModel):
    """Response for listing tasks"""
    tasks: List[FarmTask]
    total: int
    page: int
    perPage: int
