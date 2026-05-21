"""
AI Assistant — API Endpoints (Phase C)

Three endpoints, all requiring Bearer authentication:

  POST   /api/v1/ai/assistant/chat          — Streaming SSE chat
  GET    /api/v1/ai/assistant/conversations  — List user's conversations
  DELETE /api/v1/ai/assistant/conversations/{conversation_id}
                                             — Delete a conversation

The chat endpoint returns a StreamingResponse with media_type text/event-stream.
Each line is a newline-terminated JSON object (SSE-compatible without the
`data:` prefix — the frontend EventSource parser handles the framing).
"""

import logging
from typing import AsyncGenerator, List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from src.middleware.auth import get_current_user
from src.models.user import UserResponse

from ...models.chat_request import ChatRequest
from ...models.conversation import ConversationSummary
from ...services.claude_service import ClaudeAssistantService, get_claude_service
from ...services.conversation_repository import (
    ConversationRepository,
    get_conversation_repository,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/assistant", tags=["AI Assistant"])


# ---------------------------------------------------------------------------
# POST /assistant/chat — Streaming SSE chat
# ---------------------------------------------------------------------------


@router.post(
    "/chat",
    summary="Chat with the AI assistant (streaming)",
    description=(
        "Send a message and receive a Server-Sent Events stream of JSON chunks. "
        "Each line is a JSON object with a `type` field: "
        "`text` (content chunk), `tool_use`, `tool_result`, `done`, or `error`."
    ),
    status_code=status.HTTP_200_OK,
)
async def chat(
    request_body: ChatRequest,
    current_user: UserResponse = Depends(get_current_user),
    service: ClaudeAssistantService = Depends(get_claude_service),
) -> StreamingResponse:
    """
    Stream a Claude AI response for the user's message.

    Args:
        request_body: Validated ChatRequest with message, optional conversation_id,
                      and optional context (farm_id, block_id, scope).
        current_user: Authenticated user from JWT.
        service:      ClaudeAssistantService singleton.

    Returns:
        StreamingResponse with text/event-stream content type.
    """
    logger.info(
        "AI chat request: user=%s scope=%s conversation=%s",
        current_user.userId,
        request_body.context.scope.value,
        request_body.conversation_id or "new",
    )

    async def event_stream() -> AsyncGenerator[str, None]:
        """Yield SSE event strings from the Claude service generator."""
        try:
            async for event in service.chat_stream(
                user_message=request_body.message,
                user_id=current_user.userId,
                user_role=current_user.role,
                conversation_id=request_body.conversation_id,
                context=request_body.context,
            ):
                yield event
        except Exception as exc:
            # Reason: Never let an unhandled exception break the SSE stream
            # without sending a client-visible error event.
            logger.error("Unhandled error in chat stream: %s", exc, exc_info=True)
            import json
            yield json.dumps({"type": "error", "message": "An unexpected error occurred."}) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx response buffering for streaming
        },
    )


# ---------------------------------------------------------------------------
# GET /assistant/conversations — List user's conversations
# ---------------------------------------------------------------------------


@router.get(
    "/conversations",
    summary="List AI assistant conversations",
    description="Return the authenticated user's saved conversations (newest first).",
    response_model=List[ConversationSummary],
    status_code=status.HTTP_200_OK,
)
async def list_conversations(
    current_user: UserResponse = Depends(get_current_user),
    repo: ConversationRepository = Depends(get_conversation_repository),
) -> List[ConversationSummary]:
    """
    Return all saved conversations for the authenticated user.

    Args:
        current_user: Authenticated user from JWT.
        repo:         ConversationRepository singleton.

    Returns:
        List of ConversationSummary objects, newest first.
    """
    summaries = await repo.list_summaries(user_id=current_user.userId)
    return summaries


# ---------------------------------------------------------------------------
# DELETE /assistant/conversations/{conversation_id} — Delete a conversation
# ---------------------------------------------------------------------------


@router.delete(
    "/conversations/{conversation_id}",
    summary="Delete an AI assistant conversation",
    description=(
        "Permanently delete a conversation by ID. "
        "Users can only delete their own conversations."
    ),
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_conversation(
    conversation_id: str,
    current_user: UserResponse = Depends(get_current_user),
    repo: ConversationRepository = Depends(get_conversation_repository),
) -> None:
    """
    Delete a conversation owned by the authenticated user.

    Args:
        conversation_id: UUID string of the conversation to delete.
        current_user:    Authenticated user from JWT.
        repo:            ConversationRepository singleton.

    Raises:
        HTTPException 404: If conversation is not found or belongs to another user.
    """
    deleted = await repo.delete(
        conversation_id=conversation_id,
        user_id=current_user.userId,
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
