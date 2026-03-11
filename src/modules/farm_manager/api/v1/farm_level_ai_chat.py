"""
Farm-Level AI Chat API Routes

Gemini-powered AI assistant endpoints for monitoring all blocks on a farm
and controlling SenseHub-connected equipment.

Nested under /farms/{farm_id}/ai-chat (no block_id in path — this is the
farm-scoped AI, not the per-block AI).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from ...middleware.auth import get_current_active_user, CurrentUser
from ...services.farm_level_ai import FarmLevelAIChatService
from ...services.farm_level_ai.models import (
    ConfirmActionRequest,
    FarmLevelAIChatRequest,
    FarmLevelAIChatResponse,
)
from ...services.farm_ai.models import ConfirmActionResponse

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/farms/{farm_id}/ai-chat",
    tags=["farm-level-ai-chat"],
)


@router.post(
    "/",
    response_model=FarmLevelAIChatResponse,
    summary="Send a chat message to the Farm-Level AI assistant",
)
async def chat(
    farm_id: UUID,
    body: FarmLevelAIChatRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> FarmLevelAIChatResponse:
    """
    Send a natural language message to the farm-level AI assistant.

    The assistant has visibility of ALL active blocks on the farm and can:
    - Answer questions about any block's state, crop, or equipment.
    - Fetch real-time sensor data from any SenseHub-connected block.
    - Aggregate alerts or status across all connected blocks.
    - Control equipment on specific blocks (relay, automations) after confirmation.

    Read actions execute immediately.
    Write actions (relay control, trigger automation) return a pending_action
    that must be confirmed via the /confirm endpoint.
    """
    try:
        response = await FarmLevelAIChatService.chat(
            message=body.message,
            conversation_history=[m.model_dump() for m in body.conversation_history],
            farm_id=farm_id,
            user_id=current_user.userId,
        )
        return response
    except Exception as e:
        logger.error(f"Farm-level AI chat error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Farm-level AI chat error: {str(e)}"
        )


@router.post(
    "/confirm",
    response_model=ConfirmActionResponse,
    summary="Confirm or deny a pending farm-level AI action",
)
async def confirm_action(
    farm_id: UUID,
    body: ConfirmActionRequest,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> ConfirmActionResponse:
    """
    Confirm or deny a pending write action from the farm-level AI assistant.

    Pending actions expire after 5 minutes. If approved, the action is
    executed on the target block immediately. If denied, it is cancelled.
    """
    try:
        response = await FarmLevelAIChatService.confirm_action(
            action_id=body.action_id,
            approved=body.approved,
            farm_id=farm_id,
        )
        return response
    except Exception as e:
        logger.error(f"Farm-level action confirm error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Farm-level confirm error: {str(e)}"
        )
