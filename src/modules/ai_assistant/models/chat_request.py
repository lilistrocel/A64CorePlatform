"""
AI Assistant — Chat request and context models.

ChatRequest is validated by FastAPI on POST /api/v1/ai/chat.
ChatContext carries optional farm/block scoping so context_composer
can select the correct system prompt tier.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class ChatScope(str, Enum):
    """
    Determines which context tier the assistant uses.

    BLOCK   — block-level assistant (farm_id + block_id required)
    FARM    — farm-level assistant (farm_id required, no block_id)
    GLOBAL  — platform-wide monitoring assistant (no IDs required)
    """

    BLOCK = "block"
    FARM = "farm"
    GLOBAL = "global"


class ChatContext(BaseModel):
    """
    Optional scoping context sent by the frontend with each request.

    The frontend passes the currently-selected farm/block IDs so that
    the assistant receives relevant agricultural context automatically.
    All fields are optional — when omitted, the GLOBAL scope is used.
    """

    farm_id: Optional[str] = Field(
        default=None,
        description="UUID of the currently-selected farm",
    )
    block_id: Optional[str] = Field(
        default=None,
        description="UUID of the currently-selected block",
    )
    scope: ChatScope = Field(
        default=ChatScope.GLOBAL,
        description="Context tier to use for this request",
    )


class ChatRequest(BaseModel):
    """
    Request body for POST /api/v1/ai/chat.

    Fields:
        message:         The user's message text (required).
        conversation_id: Resume an existing conversation (optional).
                         If omitted a new conversation is created.
        context:         Farm/block scoping for context building (optional).
    """

    message: str = Field(
        ...,
        min_length=1,
        max_length=8000,
        description="User message text",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Existing conversation ID to continue (null = new conversation)",
    )
    context: ChatContext = Field(default_factory=ChatContext)
