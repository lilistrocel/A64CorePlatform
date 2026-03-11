"""
Global AI Chat - Pydantic Request/Response Models

Reuses ChatMessage from farm_ai.models to avoid duplication.
GlobalAIChatResponse has no pending_action field because this service
is strictly read-only — no write tools are exposed.
"""

from typing import List
from pydantic import BaseModel, Field

# Reason: Reuse the shared ChatMessage model rather than redefine it.
from ..farm_ai.models import ChatMessage


class GlobalAIChatRequest(BaseModel):
    """Request body for the global AI chat endpoint."""

    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    conversation_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Previous messages for context (max 20)",
    )


class GlobalAIChatResponse(BaseModel):
    """
    Response from the global AI chat endpoint.

    No pending_action field — this service is read-only and never
    produces write actions that require user confirmation.
    """

    message: str = Field(..., description="AI assistant response text")
    tools_used: List[str] = Field(
        default_factory=list,
        description="Tools invoked during this response",
    )
