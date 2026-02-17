"""
Farm AI Chat - Pydantic Request/Response Models
"""

from datetime import datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single message in the conversation history."""
    role: Literal["user", "assistant"] = Field(..., description="Message sender role")
    content: str = Field(..., min_length=1, max_length=4000, description="Message text")


class FarmAIChatRequest(BaseModel):
    """Request body for the chat endpoint."""
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    conversation_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Previous messages for context (max 20)"
    )


class PendingAction(BaseModel):
    """A write action awaiting user confirmation."""
    action_id: str = Field(..., description="Unique action identifier")
    tool_name: str = Field(..., description="Tool to execute")
    description: str = Field(..., description="Human-readable description of the action")
    risk_level: Literal["low", "medium", "high"] = Field(..., description="Risk assessment")
    expires_at: str = Field(..., description="ISO timestamp when action expires")


class GrowthStageInfo(BaseModel):
    """Current growth stage metadata."""
    stage: str = Field(..., description="Current growth stage name")
    day: int = Field(..., description="Days since planting")
    total_cycle_days: int = Field(..., description="Total expected cycle days")
    progress_percent: float = Field(..., description="Progress through growth cycle")


class FarmAIChatResponse(BaseModel):
    """Response from the chat endpoint."""
    message: str = Field(..., description="AI assistant response text")
    pending_action: Optional[PendingAction] = Field(
        None, description="Write action requiring user confirmation"
    )
    growth_stage: Optional[GrowthStageInfo] = Field(
        None, description="Current growth stage metadata"
    )
    tools_used: List[str] = Field(
        default_factory=list, description="Tools invoked during this response"
    )


class ConfirmActionRequest(BaseModel):
    """Request body for confirming or denying a pending action."""
    action_id: str = Field(..., description="Action ID to confirm or deny")
    approved: bool = Field(..., description="True to execute, False to cancel")


class ConfirmActionResponse(BaseModel):
    """Response from the confirm endpoint."""
    status: Literal["executed", "cancelled", "expired", "not_found"]
    message: str = Field(..., description="Result description")
    result: Optional[dict] = Field(None, description="Tool execution result if approved")
