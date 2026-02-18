"""
Farm AI Chat - Service Orchestration

Core service that orchestrates Vertex AI Gemini API calls with tool execution,
context building, and the confirmation flow for write actions.
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
from ..sensehub import SenseHubConnectionService
from .context_builder import build_system_prompt
from .tool_definitions import get_gemini_tools, WRITE_TOOL_NAMES
from .tool_executor import execute_read_tool, execute_write_tool, describe_write_action
from .pending_actions import store_pending_action, load_pending_action, delete_pending_action
from .models import (
    FarmAIChatResponse,
    PendingAction,
    GrowthStageInfo,
    ConfirmActionResponse,
)
from ..database import farm_db

logger = logging.getLogger(__name__)

# Max tool-use loop iterations to prevent runaway
MAX_TOOL_ROUNDS = 5


def _init_vertexai() -> None:
    """
    Initialise the Vertex AI SDK once per process.

    The GOOGLE_APPLICATION_CREDENTIALS env var is already set by Docker
    (pointing to the service-account JSON), so no explicit credential
    argument is needed here.

    Args:
        None

    Returns:
        None
    """
    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.VERTEX_AI_LOCATION,
    )


class FarmAIChatService:
    """Orchestrates Vertex AI Gemini API calls with SenseHub tool execution."""

    @staticmethod
    async def chat(
        message: str,
        conversation_history: list[dict],
        farm_id: UUID,
        block_id: UUID,
        user_id: str,
    ) -> FarmAIChatResponse:
        """
        Process a user chat message through Gemini with farm context and tools.

        Flow:
          1. Build system prompt with block/crop context.
          2. Convert conversation history to Gemini ``Content`` objects.
          3. Start a Gemini chat session.
          4. Send the user message; enter a tool-execution loop.
          5. For read tools: execute immediately and feed results back.
          6. For write tools: store a pending action and feed a placeholder back.
          7. Return the final text response.

        Args:
            message: User's chat message.
            conversation_history: Previous messages as ``[{role, content}, ...]``.
            farm_id: Farm UUID.
            block_id: Block UUID.
            user_id: Current user ID (used for logging only).

        Returns:
            FarmAIChatResponse with message, optional pending_action, metadata.
        """
        if not settings.GOOGLE_CLOUD_PROJECT:
            return FarmAIChatResponse(
                message=(
                    "AI chat is not configured. "
                    "Please set the GOOGLE_CLOUD_PROJECT environment variable."
                ),
                tools_used=[],
            )

        # Initialise SDK (idempotent after first call inside the same process)
        _init_vertexai()

        # Build block/crop context for the system prompt
        system_prompt, growth_stage_data = await build_system_prompt(farm_id, block_id)

        growth_stage = None
        if growth_stage_data:
            growth_stage = GrowthStageInfo(**growth_stage_data)

        # Determine whether SenseHub tools are available for this session.
        # Prefer MCP client (dynamic tool descriptions); fall back to HTTP client.
        sensehub_connected = False
        client = None
        try:
            client = await SenseHubConnectionService.get_mcp_client(farm_id, block_id)
            sensehub_connected = True
        except Exception:
            try:
                client = await SenseHubConnectionService.get_client(farm_id, block_id)
                sensehub_connected = True
            except Exception:
                pass  # Chat continues without SenseHub tools

        gemini_tools = get_gemini_tools() if sensehub_connected else None

        # Convert stored conversation history to Gemini Content objects.
        # Gemini uses role="model" (not "assistant") for AI turns.
        history: list[Content] = []
        for msg in conversation_history:
            role = "user" if msg.get("role") == "user" else "model"
            content_text = msg.get("content", "")
            if content_text:
                history.append(Content(role=role, parts=[Part.from_text(content_text)]))

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
            for round_num in range(MAX_TOOL_ROUNDS):
                # Collect any function calls from this response
                function_calls = [
                    part
                    for part in response.candidates[0].content.parts
                    if part.function_call
                ]

                if not function_calls:
                    # No more tool calls - extract final text and exit
                    break

                # Process each function call in this round
                function_responses: list[Part] = []

                for fc_part in function_calls:
                    tool_name: str = fc_part.function_call.name
                    # Reason: Gemini returns a MapComposite; cast to plain dict
                    # so downstream tool executor code can .get() / iterate it.
                    tool_input: dict = dict(fc_part.function_call.args)
                    tools_used.append(tool_name)

                    if tool_name in WRITE_TOOL_NAMES:
                        # Write tool: store pending action, feed placeholder back.
                        # The user must explicitly confirm before execution.
                        desc, risk = describe_write_action(tool_name, tool_input)
                        action_data = await store_pending_action(
                            tool_name=tool_name,
                            tool_input=tool_input,
                            description=desc,
                            risk_level=risk,
                            farm_id=str(farm_id),
                            block_id=str(block_id),
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
                        # Read tool: execute immediately and return result.
                        # web_search doesn't need SenseHub; other tools do.
                        if tool_name == "web_search":
                            result = await execute_read_tool(client, tool_name, tool_input)
                        elif client:
                            result = await execute_read_tool(client, tool_name, tool_input)
                            # Refresh cached auth token after SenseHub call
                            await SenseHubConnectionService._update_token_cache(
                                farm_id, block_id, client
                            )
                        else:
                            result = {"error": "SenseHub not connected"}

                        function_responses.append(
                            Part.from_function_response(
                                name=tool_name,
                                # Reason: response must be a plain dict, not a
                                # JSON string.  tool_executor already returns dicts.
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
            logger.error(f"Vertex AI API error: {e}")
            return FarmAIChatResponse(
                message=f"AI service error. Please try again.",
                tools_used=tools_used,
                growth_stage=growth_stage,
            )
        except Exception as e:
            logger.error(f"Unexpected error in Farm AI chat: {e}", exc_info=True)
            return FarmAIChatResponse(
                message="An unexpected error occurred. Please try again.",
                tools_used=tools_used,
                growth_stage=growth_stage,
            )

        # Log the interaction to MongoDB (non-blocking; failures are warnings)
        try:
            db = farm_db.get_database()
            await db.farm_ai_chat_log.insert_one({
                "farmId": str(farm_id),
                "blockId": str(block_id),
                "userId": user_id,
                "userMessage": message,
                "assistantMessage": final_text,
                "toolsUsed": tools_used,
                "hasPendingAction": pending_action is not None,
                "timestamp": datetime.utcnow(),
            })
        except Exception as e:
            logger.warning(f"Failed to log AI chat: {e}")

        return FarmAIChatResponse(
            message=final_text,
            pending_action=pending_action,
            growth_stage=growth_stage,
            tools_used=tools_used,
        )

    @staticmethod
    async def confirm_action(
        action_id: str,
        approved: bool,
        farm_id: UUID,
        block_id: UUID,
    ) -> ConfirmActionResponse:
        """
        Confirm or deny a pending write action.

        If approved, executes the tool via SenseHubClient.
        If denied, deletes the record from Redis.

        Args:
            action_id: Redis key for the stored pending action.
            approved: True to execute, False to cancel.
            farm_id: Farm UUID (used to verify action ownership).
            block_id: Block UUID (used to verify action ownership).

        Returns:
            ConfirmActionResponse with status and optional result payload.
        """
        action_data = await load_pending_action(action_id)

        if not action_data:
            return ConfirmActionResponse(
                status="not_found",
                message="Action not found or has expired (5-minute window).",
            )

        # Verify farm/block match to prevent cross-block action execution
        if (
            action_data.get("farm_id") != str(farm_id)
            or action_data.get("block_id") != str(block_id)
        ):
            return ConfirmActionResponse(
                status="not_found",
                message="Action does not belong to this block.",
            )

        # Always delete the pending action regardless of approval outcome
        await delete_pending_action(action_id)

        if not approved:
            return ConfirmActionResponse(
                status="cancelled",
                message="Action cancelled by user.",
            )

        # Execute the write tool via SenseHub (prefer MCP, fall back to HTTP)
        try:
            try:
                client = await SenseHubConnectionService.get_mcp_client(farm_id, block_id)
            except Exception:
                client = await SenseHubConnectionService.get_client(farm_id, block_id)
            result = await execute_write_tool(
                client,
                action_data["tool_name"],
                action_data["tool_input"],
            )
            await SenseHubConnectionService._update_token_cache(farm_id, block_id, client)

            return ConfirmActionResponse(
                status="executed",
                message=result.get("message", "Action executed successfully."),
                result=result,
            )

        except Exception as e:
            logger.error(f"Failed to execute confirmed action {action_id}: {e}")
            return ConfirmActionResponse(
                status="executed",
                message=f"Action execution failed: {str(e)}",
                result={"success": False, "error": str(e)},
            )
