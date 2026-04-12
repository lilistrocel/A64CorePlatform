"""
AI Hub Service - Orchestration

Orchestrates Vertex AI Gemini API calls for the unified AI Hub interface.
Supports 4 sections (Control, Monitor, Report, Advise) each with different
system prompts and tool sets. Platform-wide scope — no farm_id scoping.

Tool routing:
- Global read tools (GLOBAL_TOOL_NAMES) -> global_ai.tool_executor.execute_tool
- Farm-level read tools (non-global) -> farm_level_ai.tool_executor.execute_read_tool
  These need a farm_id. Since the hub AI always passes farm_name, we resolve
  it via global_ai.tool_executor.resolve_farm_by_name first.
- Write tools (WRITE_TOOL_NAMES, Control section only) -> confirmation flow via
  farm_ai.pending_actions; execution via farm_level_ai.tool_executor.execute_write_tool.
"""

import logging
import re
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
from ..farm_level_ai.tool_executor import (
    execute_write_tool,
    describe_write_action,
    get_sensehub_client,
)
from ..global_ai.tool_executor import (
    execute_tool as global_execute_tool,
    resolve_farm_by_name,
    resolve_block as global_resolve_block,
)
from ..farm_level_ai.tool_executor import execute_read_tool as farm_level_execute_read_tool
from .context_builder import build_hub_system_prompt
from .tool_definitions import get_gemini_tools, WRITE_TOOL_NAMES, GLOBAL_TOOL_NAMES
from .models import AIHubChatResponse, AIHubSection
from ..farm_ai.models import PendingAction

logger = logging.getLogger(__name__)

# Maximum tool-use loop iterations to prevent runaway Gemini loops
MAX_TOOL_ROUNDS = 5


def _init_vertexai() -> None:
    """
    Initialise the Vertex AI SDK (idempotent; safe to call on every request).

    GOOGLE_APPLICATION_CREDENTIALS must already be set in the environment
    (Docker bind-mounts the service-account JSON file).

    Returns:
        None
    """
    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.VERTEX_AI_LOCATION,
    )


def _describe_hub_write_action(tool_name: str, tool_input: dict) -> tuple[str, str]:
    """
    Generate a human-readable description for a Hub write action.

    Includes both farm_name and block_code in the description so users
    know precisely which asset will be affected across all farms.

    Args:
        tool_name: The hub write tool name (e.g. 'control_block_relay').
        tool_input: Tool input parameters including farm_name and block_code.

    Returns:
        A tuple of (description, risk_level).
    """
    farm_name = tool_input.get("farm_name", "?")
    block_code = tool_input.get("block_code", "?")
    prefix = f"[{farm_name} / Block {block_code}]"

    if tool_name == "control_block_relay":
        state_str = "ON" if tool_input.get("state") else "OFF"
        desc = (
            f"{prefix} Turn {state_str} relay channel "
            f"{tool_input.get('channel', '?')} on equipment "
            f"#{tool_input.get('equipment_id', '?')}"
        )
        return desc, "medium"

    elif tool_name == "trigger_block_automation":
        desc = (
            f"{prefix} Trigger automation "
            f"#{tool_input.get('automation_id', '?')} to run once"
        )
        return desc, "medium"

    elif tool_name == "toggle_block_automation":
        desc = (
            f"{prefix} Toggle automation "
            f"#{tool_input.get('automation_id', '?')} enabled/disabled"
        )
        return desc, "medium"

    elif tool_name == "create_block_automation":
        desc = (
            f"{prefix} Create new automation "
            f"'{tool_input.get('name', '?')}' on equipment "
            f"#{tool_input.get('equipment_id', '?')} channel "
            f"{tool_input.get('channel', '?')}"
        )
        return desc, "high"

    elif tool_name == "update_block_automation":
        desc = (
            f"{prefix} Update automation "
            f"#{tool_input.get('automation_id', '?')} "
            f"with: {list(tool_input.get('updates', {}).keys())}"
        )
        return desc, "high"

    elif tool_name == "delete_block_automation":
        desc = (
            f"{prefix} PERMANENTLY DELETE automation "
            f"#{tool_input.get('automation_id', '?')}"
        )
        return desc, "high"

    return f"{prefix} Execute {tool_name}", "high"


class AIHubService:
    """
    Orchestrates Vertex AI Gemini API calls for the unified AI Hub interface.

    Each section exposes a different personality and tool set while sharing
    the same underlying Gemini infrastructure and pending-action confirmation
    flow used by the farm-level AI services.
    """

    @staticmethod
    async def chat(
        message: str,
        conversation_history: list[dict],
        section: AIHubSection,
        user_id: str,
    ) -> AIHubChatResponse:
        """
        Process a user chat message through the AI Hub for the given section.

        Flow:
          1. Verify GOOGLE_CLOUD_PROJECT is set.
          2. Initialise Vertex AI SDK.
          3. Build section-specific system prompt.
          4. Load tools for the section (Control gets write tools, others read-only).
          5. Convert conversation history to Gemini Content objects.
          6. Create GenerativeModel with system instruction and start chat.
          7. Tool-use loop (MAX_TOOL_ROUNDS):
             - Write tools (Control only): resolve farm+block, store pending action.
             - Global read tools: execute via global_ai tool executor.
             - Farm-level read tools: resolve farm_id first, then execute via
               farm_level_ai executor (only for tools that require a farm scope).
          8. Log to ai_hub_chat_log collection in MongoDB.
          9. Return AIHubChatResponse.

        Args:
            message: User's chat message.
            conversation_history: Previous messages as [{role, content}, ...].
            section: Hub section ("control", "monitor", "report", "advise").
            user_id: Authenticated user ID (used for logging only).

        Returns:
            AIHubChatResponse with message, section, optional pending_action,
            and list of tools used.
        """
        if not settings.GOOGLE_CLOUD_PROJECT:
            return AIHubChatResponse(
                message=(
                    "AI chat is not configured. "
                    "Please set the GOOGLE_CLOUD_PROJECT environment variable."
                ),
                section=section,
                tools_used=[],
            )

        # Initialise SDK (idempotent after the first call in the same process)
        _init_vertexai()

        # Build section-specific system prompt with live platform context
        system_prompt = await build_hub_system_prompt(section)

        # Get the Gemini tool set for this section
        gemini_tools = get_gemini_tools(section)

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
                        # Write tool: resolve farm + block, store pending action.
                        # The hub write tools always include farm_name.
                        farm_name_param = tool_input.get("farm_name", "")
                        block_code_param = tool_input.get("block_code", "")

                        resolved_farm_id_str = ""
                        resolved_block_id_str = ""

                        try:
                            resolved_farm_id_str, _ = await resolve_farm_by_name(
                                farm_name_param
                            )
                            resolved_block_id_str, _ = await global_resolve_block(
                                resolved_farm_id_str, block_code_param
                            )
                        except ValueError as e:
                            logger.warning(
                                f"Could not resolve farm/block for hub write tool "
                                f"'{tool_name}': {e}"
                            )

                        desc, risk = _describe_hub_write_action(tool_name, tool_input)
                        action_data = await store_pending_action(
                            tool_name=tool_name,
                            tool_input=tool_input,
                            description=desc,
                            risk_level=risk,
                            farm_id=resolved_farm_id_str,
                            block_id=resolved_block_id_str,
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

                    elif tool_name in GLOBAL_TOOL_NAMES:
                        # Global read tool: execute via global_ai executor which
                        # accepts (farm_name, block_code) parameter patterns.
                        result = await global_execute_tool(
                            tool_name=tool_name,
                            tool_input=tool_input,
                        )

                        function_responses.append(
                            Part.from_function_response(
                                name=tool_name,
                                response=result,
                            )
                        )

                    else:
                        # Farm-level read tool: these require a farm_id UUID.
                        # Resolve the farm from the farm_name parameter if present,
                        # otherwise fall back to the global executor which can handle
                        # tools like get_block_automations that exist only at farm level.
                        farm_name_param = tool_input.get("farm_name", "")

                        if farm_name_param:
                            try:
                                farm_id_str, _ = await resolve_farm_by_name(
                                    farm_name_param
                                )
                                farm_uuid = UUID(farm_id_str)
                                result = await farm_level_execute_read_tool(
                                    farm_id=farm_uuid,
                                    tool_name=tool_name,
                                    tool_input=tool_input,
                                )
                            except (ValueError, Exception) as e:
                                logger.warning(
                                    f"Farm-level read tool '{tool_name}' failed: {e}"
                                )
                                result = {"error": str(e)}
                        else:
                            # No farm_name in input — attempt global executor
                            # as a best-effort fallback
                            result = await global_execute_tool(
                                tool_name=tool_name,
                                tool_input=tool_input,
                            )

                        function_responses.append(
                            Part.from_function_response(
                                name=tool_name,
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
            logger.error(f"Vertex AI API error (AI Hub / {section}): {e}")
            error_code = getattr(e, 'code', None) or getattr(e, 'grpc_status_code', None)
            if '429' in str(e) or 'Resource exhausted' in str(e):
                detail = "Vertex AI rate limit exceeded (429). Please wait a moment and try again."
            elif '403' in str(e) or 'Permission' in str(e):
                detail = "Vertex AI permission denied (403). Check service account credentials."
            elif '404' in str(e):
                detail = "Vertex AI model not found (404). Check VERTEX_AI_MODEL setting."
            else:
                detail = f"Vertex AI error ({error_code or 'unknown'}): {str(e)[:200]}"
            return AIHubChatResponse(
                message=detail,
                section=section,
                tools_used=tools_used,
            )
        except Exception as e:
            logger.error(
                f"Unexpected error in AI Hub chat (section={section}): {e}",
                exc_info=True,
            )
            return AIHubChatResponse(
                message=f"Unexpected error: {type(e).__name__}: {str(e)[:200]}",
                section=section,
                tools_used=tools_used,
            )

        # Log the interaction to MongoDB (non-blocking; failures are warnings only)
        try:
            db = farm_db.get_database()
            await db.ai_hub_chat_log.insert_one(
                {
                    "section": section,
                    "userId": user_id,
                    "userMessage": message,
                    "assistantMessage": final_text,
                    "toolsUsed": tools_used,
                    "hasPendingAction": pending_action is not None,
                    "timestamp": datetime.utcnow(),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to log AI Hub chat (section={section}): {e}")

        # For the Report section, extract metadata from the generated text so the
        # frontend can eventually offer PDF/Excel export.  We detect a report
        # structure by looking for a markdown heading on the first line.
        report_data: Optional[dict] = None
        if section == "report" and final_text:
            title_match = re.search(r"^#\s+(.+)$", final_text, re.MULTILINE)
            report_title = title_match.group(1) if title_match else "AI Hub Report"
            report_data = {
                "title": report_title,
                "generated_at": datetime.utcnow().isoformat(),
                "section": section,
                "can_export": True,
            }

        return AIHubChatResponse(
            message=final_text,
            section=section,
            pending_action=pending_action,
            tools_used=tools_used,
            report_data=report_data,
        )

    @staticmethod
    async def confirm_action(
        action_id: str,
        approved: bool,
    ) -> ConfirmActionResponse:
        """
        Confirm or deny a pending AI Hub write action.

        The pending action stores the resolved farm_id and block_id so that
        execution does not require re-resolving the farm/block from the tool
        input.

        If approved, obtains a SenseHub client for the stored block and executes
        the write tool. If denied, removes the pending action from Redis.

        Args:
            action_id: Redis key for the stored pending action.
            approved: True to execute, False to cancel.

        Returns:
            ConfirmActionResponse with status and optional execution result.
        """
        action_data = await load_pending_action(action_id)

        if not action_data:
            return ConfirmActionResponse(
                status="not_found",
                message="Action not found or has expired (5-minute window).",
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
            farm_id_str = action_data.get("farm_id", "")
            block_id_str = action_data.get("block_id", "")

            if not farm_id_str or not block_id_str:
                return ConfirmActionResponse(
                    status="executed",
                    message=(
                        "Cannot execute: target farm/block IDs were not recorded "
                        "for this action."
                    ),
                    result={"success": False, "error": "Missing farm_id or block_id"},
                )

            farm_uuid = UUID(farm_id_str)
            block_uuid = UUID(block_id_str)

            client = await get_sensehub_client(farm_uuid, block_uuid)

            result = await execute_write_tool(
                client=client,
                tool_name=action_data["tool_name"],
                tool_input=action_data["tool_input"],
            )

            # Refresh cached token if using HTTP client (MCP clients skip this)
            try:
                await SenseHubConnectionService._update_token_cache(
                    farm_uuid, block_uuid, client
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
                f"Failed to execute confirmed AI Hub action {action_id}: {e}"
            )
            return ConfirmActionResponse(
                status="executed",
                message=f"Action execution failed: {str(e)}",
                result={"success": False, "error": str(e)},
            )

    @staticmethod
    async def get_history(
        section: AIHubSection,
        user_id: str,
        skip: int = 0,
        limit: int = 20,
    ) -> list[dict]:
        """
        Retrieve AI Hub chat history for a specific section and user.

        Args:
            section: Hub section to filter by ("control", "monitor", etc.).
            user_id: User ID to filter by.
            skip: Number of records to skip (for pagination).
            limit: Maximum number of records to return.

        Returns:
            List of chat log documents (without MongoDB _id field).
        """
        try:
            db = farm_db.get_database()
            cursor = (
                db.ai_hub_chat_log.find(
                    {"section": section, "userId": user_id},
                    # Reason: Exclude internal MongoDB _id to keep response clean.
                    {"_id": 0},
                )
                .sort("timestamp", -1)
                .skip(skip)
                .limit(limit)
            )
            docs = await cursor.to_list(length=limit)
            return docs
        except Exception as e:
            logger.error(
                f"Failed to retrieve AI Hub history (section={section}): {e}"
            )
            return []
