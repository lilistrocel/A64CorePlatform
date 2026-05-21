"""
AI Assistant — Conversation and Message models.

Stored in MongoDB collection `ai_assistant_conversations`.
Each document holds the full message history for one conversation.
A user may have at most HISTORY_LIMIT conversations; oldest is evicted on overflow.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class MessageRole(str, Enum):
    """Valid roles for a conversation message."""

    USER = "user"
    ASSISTANT = "assistant"


class Message(BaseModel):
    """
    A single turn in the conversation.

    Matches the format expected by the Anthropic messages API so history
    can be passed directly to `client.messages.stream(messages=...)`.
    """

    role: MessageRole
    content: str = Field(..., min_length=1)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    # Optional metadata (tool names used, etc.)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Conversation(BaseModel):
    """
    Full conversation document stored in MongoDB.

    Fields:
        conversation_id: UUID string — primary identifier.
        user_id:         Owner — enforced at all query points.
        title:           First 80 chars of the opening user message.
        messages:        Ordered list of user + assistant turns.
        context:         ChatContext snapshot saved at creation time.
        created_at:      Creation timestamp.
        updated_at:      Last message timestamp (updated on each turn).
    """

    conversation_id: str
    user_id: str
    title: str = Field(default="New conversation", max_length=120)
    messages: List[Message] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class ConversationSummary(BaseModel):
    """
    Lightweight projection returned by GET /api/v1/ai/conversations.
    Does not include the full message list to keep response size small.
    """

    conversation_id: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime
