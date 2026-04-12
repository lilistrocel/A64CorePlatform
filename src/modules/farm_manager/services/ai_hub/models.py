"""
AI Hub Service - Pydantic Request/Response Models

Defines models for the unified AI Hub chat interface. The Hub exposes
4 specialized sections (Control, Monitor, Report, Advise) all operating
at platform-wide scope and restricted to super admins.

Re-exports shared conversation models from farm_ai to avoid duplication.
"""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

# Re-export shared models so callers can import from one place
from ..farm_ai.models import (  # noqa: F401
    ChatMessage,
    ConfirmActionRequest,
    ConfirmActionResponse,
    PendingAction,
)

# The four specialized assistant personalities in the AI Hub
AIHubSection = Literal["control", "monitor", "report", "advise"]


class AIHubChatRequest(BaseModel):
    """Request body for the AI Hub chat endpoint."""

    section: AIHubSection = Field(
        ...,
        description=(
            "The Hub section driving this chat. Controls which system prompt "
            "and tool set are active. One of: control, monitor, report, advise."
        ),
    )
    message: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="User message text",
    )
    conversation_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Previous messages for context (max 20)",
    )


class AIHubChatResponse(BaseModel):
    """Response from the AI Hub chat endpoint."""

    message: str = Field(..., description="AI assistant response text")
    section: AIHubSection = Field(
        ..., description="The section that produced this response"
    )
    pending_action: Optional[PendingAction] = Field(
        None,
        description=(
            "Write action requiring user confirmation. "
            "Only populated for the Control section."
        ),
    )
    tools_used: List[str] = Field(
        default_factory=list,
        description="Names of tools invoked during this response",
    )
    report_data: Optional[dict] = Field(
        None,
        description=(
            "Report section only: structured metadata for the generated report. "
            "Includes title, generation timestamp, and export capability flag. "
            "Reserved for future PDF/Excel export support."
        ),
    )
