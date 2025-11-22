"""
Farm Task Model

Represents tasks in the farm operations workflow.
Tasks are generated automatically during block state transitions and
can be completed by farmers to record farming activities.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Literal, Dict, Any
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class TaskType(str, Enum):
    """Task type categories"""
    PLANTING = "planting"
    GROWTH_CHECK = "growth_check"  # Check if plants are growing properly (PLANTED → GROWING)
    FRUITING_CHECK = "fruiting_check"
    HARVEST_READINESS = "harvest_readiness"
    DAILY_HARVEST = "daily_harvest"
    HARVEST_COMPLETION = "harvest_completion"
    CLEANING = "cleaning"
    CUSTOM = "custom"


class TaskStatus(str, Enum):
    """Task status lifecycle"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class HarvestGrade(str, Enum):
    """Harvest quality grades"""
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    WASTE = "Waste"


class HarvestEntry(BaseModel):
    """Individual harvest recording entry"""
    entryId: UUID = Field(default_factory=uuid4, description="Unique entry ID")
    taskId: UUID = Field(..., description="Associated task ID")
    blockId: UUID = Field(..., description="Block being harvested")
    quantityKg: float = Field(..., ge=0, description="Quantity harvested in kg")
    grade: HarvestGrade = Field(..., description="Quality grade of harvest")
    notes: Optional[str] = Field(None, description="Optional notes about harvest")
    recordedBy: UUID = Field(..., description="User who recorded harvest")
    recordedByName: str = Field(..., description="Name of user who recorded harvest")
    recordedByEmail: str = Field(..., description="Email of user who recorded harvest")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="When harvest was recorded")
    createdAt: datetime = Field(default_factory=datetime.utcnow, description="Record creation time")


class FarmTask(BaseModel):
    """
    Farm Task - Represents a farming activity to be completed

    Tasks are automatically generated during block state transitions
    to guide farmers through the workflow and provide accountability.
    """
    taskId: UUID = Field(default_factory=uuid4, description="Unique task ID")
    farmId: UUID = Field(..., description="Farm this task belongs to")
    blockId: UUID = Field(..., description="Block this task is for")

    # Task Classification
    taskType: TaskType = Field(..., description="Type of task")
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Detailed task description")

    # Task Status
    status: TaskStatus = Field(default=TaskStatus.PENDING, description="Current task status")
    priority: int = Field(default=5, ge=1, le=10, description="Priority (1=lowest, 10=highest)")

    # Assignment
    assignedTo: Optional[UUID] = Field(None, description="User assigned to task")
    assignedToName: Optional[str] = Field(None, description="Name of assigned user")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")

    # Scheduling
    dueDate: Optional[datetime] = Field(None, description="Task due date")
    scheduledDate: Optional[datetime] = Field(None, description="When task should be performed")

    # Completion
    completedAt: Optional[datetime] = Field(None, description="When task was completed")
    completedBy: Optional[UUID] = Field(None, description="User who completed task")
    completedByName: Optional[str] = Field(None, description="Name of user who completed task")
    completedByEmail: Optional[str] = Field(None, description="Email of user who completed task")
    completionNotes: Optional[str] = Field(None, description="Notes added upon completion")
    photoUrls: List[str] = Field(default_factory=list, description="Photos attached to task")

    # Task Metadata
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional task metadata")

    # Phase 2: Task-Driven Transitions
    triggerStateChange: Optional[str] = Field(
        None,
        description="Block status to transition to when task is completed (Phase 2)"
    )

    # Harvest-specific fields (for daily_harvest tasks)
    harvestEntries: List[HarvestEntry] = Field(
        default_factory=list,
        description="Harvest entries for daily_harvest tasks"
    )

    # Audit
    createdAt: datetime = Field(default_factory=datetime.utcnow, description="Task creation time")
    updatedAt: datetime = Field(default_factory=datetime.utcnow, description="Last update time")
    createdBy: UUID = Field(..., description="User who created task")
    createdByEmail: str = Field(..., description="Email of user who created task")

    # Soft Delete
    deleted: bool = Field(default=False, description="Soft delete flag")
    deletedAt: Optional[datetime] = Field(None, description="When task was deleted")

    @property
    def is_overdue(self) -> bool:
        """Check if task is overdue based on scheduledDate"""
        if self.status in [TaskStatus.COMPLETED, TaskStatus.CANCELLED]:
            return False

        if self.scheduledDate:
            return datetime.utcnow() > self.scheduledDate

        if self.dueDate:
            return datetime.utcnow() > self.dueDate

        return False


class FarmTaskCreate(BaseModel):
    """Schema for creating a new farm task"""
    farmId: UUID = Field(..., description="Farm this task belongs to")
    blockId: UUID = Field(..., description="Block this task is for")
    taskType: TaskType = Field(..., description="Type of task")
    title: str = Field(..., min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Detailed task description")
    priority: int = Field(default=5, ge=1, le=10, description="Priority (1=lowest, 10=highest)")
    assignedTo: Optional[UUID] = Field(None, description="User assigned to task")
    assignedToName: Optional[str] = Field(None, description="Name of assigned user")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")
    dueDate: Optional[datetime] = Field(None, description="Task due date")
    scheduledDate: Optional[datetime] = Field(None, description="When task should be performed")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional task metadata")
    triggerStateChange: Optional[str] = Field(None, description="Block status to transition to when completed (Phase 2)")


class FarmTaskUpdate(BaseModel):
    """Schema for updating a farm task"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="Task title")
    description: Optional[str] = Field(None, description="Detailed task description")
    priority: Optional[int] = Field(None, ge=1, le=10, description="Priority (1=lowest, 10=highest)")
    assignedTo: Optional[UUID] = Field(None, description="User assigned to task")
    assignedToName: Optional[str] = Field(None, description="Name of assigned user")
    assignedToEmail: Optional[str] = Field(None, description="Email of assigned user")
    dueDate: Optional[datetime] = Field(None, description="Task due date")
    scheduledDate: Optional[datetime] = Field(None, description="When task should be performed")
    status: Optional[TaskStatus] = Field(None, description="Current task status")


class CompleteTaskRequest(BaseModel):
    """Schema for completing a task"""
    notes: Optional[str] = Field(None, description="Completion notes")
    photoUrls: List[str] = Field(default_factory=list, description="Photos of completed work")


class CancelTaskRequest(BaseModel):
    """Schema for cancelling a task"""
    reason: Optional[str] = Field(None, description="Reason for cancellation")


class AddHarvestEntryRequest(BaseModel):
    """Schema for adding a harvest entry to a daily_harvest task"""
    quantityKg: float = Field(..., ge=0, description="Quantity harvested in kg")
    grade: HarvestGrade = Field(..., description="Quality grade of harvest")
    notes: Optional[str] = Field(None, description="Optional notes about harvest")
