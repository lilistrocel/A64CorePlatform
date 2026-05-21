"""
AI Assistant — Context Composer (Phase C)

Merges the four existing context builders (farm_ai, farm_level_ai, global_ai,
ai_hub) into a single function keyed off the ChatContext scope enum.

Scope routing:
  BLOCK   → farm_ai.context_builder.build_system_prompt(farm_id, block_id)
  FARM    → farm_level_ai.context_builder.build_farm_system_prompt(farm_id)
  GLOBAL  → global_ai.context_builder.build_global_system_prompt()

The returned system prompt is later passed to the Claude API with
cache_control: {"type": "ephemeral"} to keep it cached across turns.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from ..models.chat_request import ChatContext, ChatScope

logger = logging.getLogger(__name__)

_BASE_INSTRUCTIONS = """
IMPORTANT CONSTRAINTS:
- You are a READ-ONLY assistant. You can query data and give advice but you
  CANNOT control any equipment, trigger automations, or modify any settings.
- If the user asks you to turn something on/off or change a setting, politely
  explain that control actions must be performed through the farm control panel.
- NEVER fabricate sensor readings or farm data. Always use the provided tools
  to fetch real data before answering questions about current conditions.
- When reporting sensor values, note whether they are within or outside the
  recommended range for the current crop.
- Today's date is {today}.
"""


def _append_base_instructions(prompt: str) -> str:
    """
    Append the shared read-only constraint block to any system prompt.

    Args:
        prompt: The scope-specific system prompt text.

    Returns:
        Combined prompt string.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")
    instructions = _BASE_INSTRUCTIONS.format(today=today)
    return prompt.rstrip() + "\n" + instructions


async def build_system_prompt(context: ChatContext) -> str:
    """
    Build the Claude system prompt for the given chat context.

    Selects the appropriate context builder based on the scope field,
    loads live data from MongoDB, and appends shared constraint instructions.

    Args:
        context: ChatContext carrying optional farm_id, block_id, and scope.

    Returns:
        Complete system prompt string ready to pass to the Claude messages API.
    """
    scope = context.scope

    # ------------------------------------------------------------------
    # BLOCK scope — full block + crop context from farm_ai context builder
    # ------------------------------------------------------------------
    if scope == ChatScope.BLOCK:
        if not context.farm_id or not context.block_id:
            logger.warning(
                "BLOCK scope requested but farm_id or block_id is missing — "
                "falling back to GLOBAL scope"
            )
            return await _build_global_prompt()

        try:
            from src.modules.farm_manager.services.farm_ai.context_builder import (
                build_system_prompt as build_block_prompt,
            )

            farm_uuid = UUID(context.farm_id)
            block_uuid = UUID(context.block_id)
            prompt, _ = await build_block_prompt(farm_uuid, block_uuid)
            return _append_base_instructions(prompt)

        except ValueError as exc:
            logger.error("Invalid UUID in BLOCK context: %s", exc)
            return await _build_global_prompt()
        except Exception as exc:
            logger.error("BLOCK context builder failed: %s", exc, exc_info=True)
            return await _build_global_prompt()

    # ------------------------------------------------------------------
    # FARM scope — all blocks overview from farm_level_ai context builder
    # ------------------------------------------------------------------
    if scope == ChatScope.FARM:
        if not context.farm_id:
            logger.warning(
                "FARM scope requested but farm_id is missing — "
                "falling back to GLOBAL scope"
            )
            return await _build_global_prompt()

        try:
            from src.modules.farm_manager.services.farm_level_ai.context_builder import (
                build_farm_system_prompt,
            )

            farm_uuid = UUID(context.farm_id)
            prompt, _ = await build_farm_system_prompt(farm_uuid)
            return _append_base_instructions(prompt)

        except ValueError as exc:
            logger.error("Invalid UUID in FARM context: %s", exc)
            return await _build_global_prompt()
        except Exception as exc:
            logger.error("FARM context builder failed: %s", exc, exc_info=True)
            return await _build_global_prompt()

    # ------------------------------------------------------------------
    # GLOBAL scope (default) — platform-wide monitoring
    # ------------------------------------------------------------------
    return await _build_global_prompt()


async def _build_global_prompt() -> str:
    """
    Build the global monitoring system prompt.

    Returns:
        Global system prompt string with base instructions appended.
    """
    try:
        from src.modules.farm_manager.services.global_ai.context_builder import (
            build_global_system_prompt,
        )

        prompt = await build_global_system_prompt()
        return _append_base_instructions(prompt)

    except Exception as exc:
        logger.error("Global context builder failed: %s", exc, exc_info=True)
        # Reason: Provide a minimal safe fallback rather than breaking chat.
        today = datetime.utcnow().strftime("%Y-%m-%d")
        return (
            "You are an agricultural AI assistant for A64 Core Platform. "
            "You have read-only access to farm data and SenseHub sensor readings. "
            "You cannot control any equipment or modify settings. "
            f"Today's date is {today}. "
            "Use the available tools to answer the user's questions about farm data."
        )
