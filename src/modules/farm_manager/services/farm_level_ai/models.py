"""
Farm-Level AI Chat - Pydantic Request/Response Models

Re-exports shared models from farm_ai and defines farm-level specific models.
"""

from typing import List, Optional

from pydantic import BaseModel, Field

# Re-export shared models - do not redefine
from ..farm_ai.models import (  # noqa: F401
    ChatMessage,
    ConfirmActionRequest,
    ConfirmActionResponse,
    PendingAction,
)


class FarmLevelAIChatRequest(BaseModel):
    """Request body for the farm-level AI chat endpoint."""

    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    conversation_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Previous messages for context (max 20)",
    )


class FarmSummaryInfo(BaseModel):
    """Summary of farm state returned with each AI response."""

    farm_name: str = Field(..., description="Name of the farm")
    block_count: int = Field(..., description="Total number of active blocks on the farm")
    connected_blocks: int = Field(
        ..., description="Number of blocks with SenseHub connected"
    )


class FarmLevelAIChatResponse(BaseModel):
    """Response from the farm-level AI chat endpoint."""

    message: str = Field(..., description="AI assistant response text")
    pending_action: Optional[PendingAction] = Field(
        None, description="Write action requiring user confirmation"
    )
    farm_summary: Optional[FarmSummaryInfo] = Field(
        None, description="Farm overview metadata"
    )
    tools_used: List[str] = Field(
        default_factory=list, description="Tools invoked during this response"
    )
