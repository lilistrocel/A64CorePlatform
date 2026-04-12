"""
Farm-Level AI Chat - Service Orchestration

Orchestrates Vertex AI Gemini API calls with farm-scoped tool execution,
context building for all blocks on a farm, and the confirmation flow for
write actions targeting specific blocks.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

import vertexai
from google.api_core.exceptions import GoogleAPICallError
from vertexai.generative_models import (
    Content,
    GenerationConfig,
    GenerativeModel,
    Part,
)

from src.config.settings import settings
from ..database import farm_db
from ..sensehub import SenseHubConnectionService
from ..farm_ai.pending_actions import (
    store_pending_action,
    load_pending_action,
    delete_pending_action,
)
from ..farm_ai.models import ConfirmActionResponse
from .context_builder import build_farm_system_prompt
from .tool_definitions import get_gemini_tools, WRITE_TOOL_NAMES
from .tool_executor import (
    execute_read_tool,
    execute_write_tool,
    describe_write_action,
    resolve_block,
    get_sensehub_client,
)
from .models import (
    FarmLevelAIChatResponse,
    FarmSummaryInfo,
    PendingAction,
)

logger = logging.getLogger(__name__)

# Maximum tool-use loop iterations to prevent runaway Gemini loops
MAX_TOOL_ROUNDS = 5


def _init_vertexai() -> None:
    """
    Initialise the Vertex AI SDK (idempotent; safe to call on every request).

    GOOGLE_APPLICATION_CREDENTIALS must already be set in the environment
    (Docker bind-mounts the service-account JSON file).

    Args:
        None

    Returns:
        None
    """
    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.VERTEX_AI_LOCATION,
    )


class FarmLevelAIChatService:
    """Orchestrates Vertex AI Gemini API calls with farm-scoped SenseHub tool execution."""

    @staticmethod
    async def chat(
        message: str,
        conversation_history: list[dict],
        farm_id: UUID,
        user_id: str,
    ) -> FarmLevelAIChatResponse:
        """
        Process a user chat message at the farm level through Gemini with full
        farm context and multi-block tools.

        Flow:
          1. Verify GOOGLE_CLOUD_PROJECT is set.
          2. Initialise Vertex AI SDK.
          3. Build farm system prompt with all-block overview.
          4. Determine whether any block has SenseHub connected; enable
             write/block tools only when at least one is connected.
          5. Convert conversation history to Gemini Content objects.
          6. Create GenerativeModel with system instruction and start chat.
          7. Enter tool-use loop (MAX_TOOL_ROUNDS):
             - Write tools: resolve block_code to block_id, store pending action,
               feed placeholder back to Gemini.
             - Read tools: execute immediately via execute_read_tool.
          8. Log interaction to farm_ai_chat_log (scope: "farm").
          9. Return FarmLevelAIChatResponse.

        Args:
            message: User's chat message.
            conversation_history: Previous messages as [{role, content}, ...].
            farm_id: Farm UUID.
            user_id: Current user ID (used for logging only).

        Returns:
            FarmLevelAIChatResponse with message, optional pending_action,
            farm_summary metadata, and list of tools used.
        """
        if not settings.GOOGLE_CLOUD_PROJECT:
            return FarmLevelAIChatResponse(
                message=(
                    "AI chat is not configured. "
                    "Please set the GOOGLE_CLOUD_PROJECT environment variable."
                ),
                tools_used=[],
            )

        # Initialise SDK (idempotent after first call inside the same process)
        _init_vertexai()

        # Build farm context and obtain summary metadata
        system_prompt, farm_summary_dict = await build_farm_system_prompt(farm_id)

        farm_summary: Optional[FarmSummaryInfo] = None
        if farm_summary_dict:
            farm_summary = FarmSummaryInfo(**farm_summary_dict)

        # Check whether ANY block on the farm has SenseHub connected.
        # If at least one is connected, enable the full tool set including writes.
        # If none are connected, restrict to non-SenseHub tools only.
        db = farm_db.get_database()
        any_connected = await db.blocks.find_one(
            {
                "farmId": str(farm_id),
                "isActive": True,
                "iotController.connectionStatus": "connected",
            }
        )
        has_sensehub = any_connected is not None

        # Include write tools only when SenseHub is reachable
        gemini_tools = get_gemini_tools(include_write=has_sensehub)

        # Convert stored conversation history to Gemini Content objects.
        # Gemini uses role="model" (not "assistant") for AI turns.
        history: list[Content] = []
        for msg in conversation_history:
            role = "user" if msg.get("role") == "user" else "model"
            content_text = msg.get("content", "")
            if content_text:
                history.append(
                    Content(role=role, parts=[Part.from_text(content_text)])
                )

        # Create model with system instruction baked in
        model = GenerativeModel(
            settings.VERTEX_AI_MODEL,
            system_instruction=system_prompt,
        )

        # Start chat with prior history so Gemini has full context
        chat = model.start_chat(history=history)

        generation_config = GenerationConfig(
            max_output_tokens=settings.FARM_AI_MAX_TOKENS,
            temperature=settings.VERTEX_AI_TEMPERATURE,
        )

        tools_used: list[str] = []
        pending_action: Optional[PendingAction] = None
        final_text = ""

        try:
            # Send the user message to Gemini
            response = await chat.send_message_async(
                message,
                generation_config=generation_config,
                tools=gemini_tools,
            )

            # Tool-use loop: Gemini may request multiple rounds of tool calls
            for _round in range(MAX_TOOL_ROUNDS):
                # Collect any function calls from this response
                function_calls = [
                    part
                    for part in response.candidates[0].content.parts
                    if part.function_call
                ]

                if not function_calls:
                    # No more tool calls — extract final text and exit loop
                    break

                function_responses: list[Part] = []

                for fc_part in function_calls:
                    tool_name: str = fc_part.function_call.name
                    # Reason: Gemini returns a MapComposite; cast to plain dict
                    # so downstream code can .get() / iterate it normally.
                    tool_input: dict = dict(fc_part.function_call.args)
                    tools_used.append(tool_name)

                    if tool_name in WRITE_TOOL_NAMES:
                        # Write tool: resolve block_code to block_id now so
                        # the confirm_action handler knows which block to target.
                        block_code = tool_input.get("block_code", "")
                        resolved_block_id = ""
                        try:
                            resolved_block_id, _ = await resolve_block(
                                farm_id, block_code
                            )
                        except ValueError as e:
                            logger.warning(
                                f"Could not resolve block '{block_code}' for "
                                f"write tool '{tool_name}': {e}"
                            )

                        desc, risk = describe_write_action(tool_name, tool_input)
                        action_data = await store_pending_action(
                            tool_name=tool_name,
                            tool_input=tool_input,
                            description=desc,
                            risk_level=risk,
                            farm_id=str(farm_id),
                            # Store the resolved block_id so confirm_action can
                            # obtain a SenseHub client without re-resolving block_code
                            block_id=resolved_block_id,
                        )
                        pending_action = PendingAction(**action_data)

                        function_responses.append(
                            Part.from_function_response(
                                name=tool_name,
                                response={
                                    "status": "pending_confirmation",
                                    "description": desc,
                                    "message": (
                                        "This action requires user confirmation "
                                        "before execution."
                                    ),
                                },
                            )
                        )

                    else:
                        # Read tool: execute immediately
                        result = await execute_read_tool(
                            farm_id=farm_id,
                            tool_name=tool_name,
                            tool_input=tool_input,
                        )

                        function_responses.append(
                            Part.from_function_response(
                                name=tool_name,
                                # Reason: response must be a plain dict, not a
                                # JSON string. execute_read_tool already returns dicts.
                                response=result,
                            )
                        )

                # Send all function responses back to Gemini in a single turn
                response = await chat.send_message_async(
                    function_responses,
                    generation_config=generation_config,
                    tools=gemini_tools,
                )

            # Extract the final text answer from the last response
            for part in response.candidates[0].content.parts:
                if part.text:
                    final_text += part.text

        except GoogleAPICallError as e:
            logger.error(f"Vertex AI API error (farm-level chat): {e}")
            if '429' in str(e) or 'Resource exhausted' in str(e):
                detail = "Vertex AI rate limit exceeded (429). Please wait a moment and try again."
            elif '403' in str(e) or 'Permission' in str(e):
                detail = "Vertex AI permission denied (403). Check service account credentials."
            elif '404' in str(e):
                detail = "Vertex AI model not found (404). Check VERTEX_AI_MODEL setting."
            else:
                detail = f"Vertex AI error: {str(e)[:200]}"
            return FarmLevelAIChatResponse(
                message=detail,
                farm_summary=farm_summary,
                tools_used=tools_used,
            )
        except Exception as e:
            logger.error(
                f"Unexpected error in Farm-Level AI chat: {e}", exc_info=True
            )
            return FarmLevelAIChatResponse(
                message=f"Unexpected error: {type(e).__name__}: {str(e)[:200]}",
                farm_summary=farm_summary,
                tools_used=tools_used,
            )

        # Log the interaction to MongoDB (non-blocking; failures are warnings only)
        try:
            await db.farm_ai_chat_log.insert_one(
                {
                    "farmId": str(farm_id),
                    "blockId": None,
                    "scope": "farm",
                    "userId": user_id,
                    "userMessage": message,
                    "assistantMessage": final_text,
                    "toolsUsed": tools_used,
                    "hasPendingAction": pending_action is not None,
                    "timestamp": datetime.utcnow(),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to log farm-level AI chat: {e}")

        return FarmLevelAIChatResponse(
            message=final_text,
            pending_action=pending_action,
            farm_summary=farm_summary,
            tools_used=tools_used,
        )

    @staticmethod
    async def confirm_action(
        action_id: str,
        approved: bool,
        farm_id: UUID,
    ) -> ConfirmActionResponse:
        """
        Confirm or deny a pending farm-level write action.

        If approved, resolves the stored block_id, obtains a SenseHub client
        for that block, and executes the write tool.
        If denied, removes the pending action from Redis.

        Args:
            action_id: Redis key for the stored pending action.
            approved: True to execute, False to cancel.
            farm_id: Farm UUID (used to verify the action belongs to this farm).

        Returns:
            ConfirmActionResponse with status and optional execution result.
        """
        action_data = await load_pending_action(action_id)

        if not action_data:
            return ConfirmActionResponse(
                status="not_found",
                message="Action not found or has expired (5-minute window).",
            )

        # Verify farm_id matches to prevent cross-farm action execution
        if action_data.get("farm_id") != str(farm_id):
            return ConfirmActionResponse(
                status="not_found",
                message="Action does not belong to this farm.",
            )

        # Always delete the pending action regardless of approval outcome
        await delete_pending_action(action_id)

        if not approved:
            return ConfirmActionResponse(
                status="cancelled",
                message="Action cancelled by user.",
            )

        # Execute the write tool via the block's SenseHub client
        try:
            block_id_str = action_data.get("block_id", "")
            if not block_id_str:
                return ConfirmActionResponse(
                    status="executed",
                    message="Cannot execute: target block ID was not recorded for this action.",
                    result={"success": False, "error": "Missing block_id"},
                )

            from uuid import UUID as _UUID

            block_uuid = _UUID(block_id_str)
            client = await get_sensehub_client(farm_id, block_uuid)

            result = await execute_write_tool(
                client=client,
                tool_name=action_data["tool_name"],
                tool_input=action_data["tool_input"],
            )

            # Refresh cached token if using HTTP client (MCP clients skip this)
            try:
                await SenseHubConnectionService._update_token_cache(
                    farm_id, block_uuid, client
                )
            except Exception:
                pass  # Token refresh failure is non-critical

            return ConfirmActionResponse(
                status="executed",
                message=result.get("message", "Action executed successfully."),
                result=result,
            )

        except Exception as e:
            logger.error(
                f"Failed to execute confirmed farm-level action {action_id}: {e}"
            )
            return ConfirmActionResponse(
                status="executed",
                message=f"Action execution failed: {str(e)}",
                result={"success": False, "error": str(e)},
            )
