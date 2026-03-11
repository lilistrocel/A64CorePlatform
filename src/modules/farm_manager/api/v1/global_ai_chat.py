"""
Farm Management Module - Global AI Chat Endpoint

Exposes a single POST /ai-monitor/chat endpoint for the read-only global
farm monitoring assistant. Requires a valid user JWT. No confirmation
flow because the assistant has no write tools.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.global_ai import GlobalAIChatService
from ...services.global_ai.models import GlobalAIChatRequest, GlobalAIChatResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-monitor", tags=["global-ai-chat"])


@router.post("/chat", response_model=GlobalAIChatResponse)
async def chat(
    body: GlobalAIChatRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> GlobalAIChatResponse:
    """
    Send a message to the global farm monitoring AI assistant.

    The assistant has read-only access to all farms and blocks. It can
    retrieve live sensor readings and alerts from any SenseHub-connected
    block but cannot perform any write operations.

    Args:
        body: Chat request containing the user message and conversation history.
        current_user: Authenticated user from JWT dependency.

    Returns:
        GlobalAIChatResponse with the assistant's reply and tools_used list.

    Raises:
        HTTPException 500: If the AI service encounters an unhandled error.
    """
    try:
        response = await GlobalAIChatService.chat(
            message=body.message,
            conversation_history=[m.model_dump() for m in body.conversation_history],
            user_id=current_user.userId,
        )
        return response
    except Exception as e:
        logger.error(f"Global AI chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI chat error: {str(e)}")
