"""
Farm AI Chat API Routes

Claude-powered AI assistant endpoints for farm block management.
Nested under /farms/{farm_id}/blocks/{block_id}/ai-chat.
"""

from fastapi import APIRouter, Depends, HTTPException
from uuid import UUID
import logging

from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.farm_ai import FarmAIChatService
from ...services.farm_ai.models import (
    FarmAIChatRequest,
    FarmAIChatResponse,
    ConfirmActionRequest,
    ConfirmActionResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/farms/{farm_id}/blocks/{block_id}/ai-chat",
    tags=["farm-ai-chat"],
)


@router.post(
    "/",
    response_model=FarmAIChatResponse,
    summary="Send a chat message to the Farm AI assistant",
)
async def chat(
    farm_id: UUID,
    block_id: UUID,
    body: FarmAIChatRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Send a natural language message to the AI assistant.

    The assistant has access to:
    - Block and crop context (growth stage, environmental requirements)
    - SenseHub equipment readings (sensors, relays)
    - Automation programs and alerts

    Read actions (sensor readings, equipment list) execute immediately.
    Write actions (relay control, trigger automation) return a pending_action
    that must be confirmed via the /confirm endpoint.
    """
    try:
        response = await FarmAIChatService.chat(
            message=body.message,
            conversation_history=[m.model_dump() for m in body.conversation_history],
            farm_id=farm_id,
            block_id=block_id,
            user_id=current_user.userId,
        )
        return response
    except Exception as e:
        logger.error(f"AI chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI chat error: {str(e)}")


@router.post(
    "/confirm",
    response_model=ConfirmActionResponse,
    summary="Confirm or deny a pending AI action",
)
async def confirm_action(
    farm_id: UUID,
    block_id: UUID,
    body: ConfirmActionRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    Confirm or deny a pending write action from the AI assistant.

    Pending actions expire after 5 minutes. If approved, the action
    is executed immediately. If denied, it is cancelled.
    """
    try:
        response = await FarmAIChatService.confirm_action(
            action_id=body.action_id,
            approved=body.approved,
            farm_id=farm_id,
            block_id=block_id,
        )
        return response
    except Exception as e:
        logger.error(f"Action confirm error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Confirm error: {str(e)}")
