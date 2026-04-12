"""
Global AI Chat - Service Orchestration

Orchestrates Vertex AI Gemini API calls for the global monitoring assistant.
This service is strictly read-only — no pending_action flow, no write tools.

All farms and all blocks are accessible through the tools defined in
tool_definitions.py and executed by tool_executor.py.
"""

import logging
from datetime import datetime

import vertexai
from google.api_core.exceptions import GoogleAPICallError
from vertexai.generative_models import (
    Content,
    GenerationConfig,
    GenerativeModel,
    Part,
)

from src.config.settings import settings
from .context_builder import build_global_system_prompt
from .tool_definitions import get_gemini_tools
from .tool_executor import execute_tool
from .models import GlobalAIChatResponse
from ..database import farm_db

logger = logging.getLogger(__name__)

# Max tool-use loop iterations to prevent runaway API calls
MAX_TOOL_ROUNDS = 5


def _init_vertexai() -> None:
    """
    Initialise the Vertex AI SDK (idempotent after the first call).

    The GOOGLE_APPLICATION_CREDENTIALS environment variable is set by
    Docker and points to the service-account JSON, so no explicit
    credential argument is needed here.

    Returns:
        None
    """
    vertexai.init(
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.VERTEX_AI_LOCATION,
    )


class GlobalAIChatService:
    """
    Orchestrates Vertex AI Gemini API calls for global farm monitoring.

    Stateless static methods only — all state lives in the conversation
    history passed in by the caller.
    """

    @staticmethod
    async def chat(
        message: str,
        conversation_history: list[dict],
        user_id: str,
    ) -> GlobalAIChatResponse:
        """
        Process a user chat message through Gemini with global farm context.

        Flow:
          1. Verify GOOGLE_CLOUD_PROJECT is configured.
          2. Initialise Vertex AI SDK.
          3. Build system prompt with live farm summary.
          4. Convert conversation history to Gemini Content objects.
          5. Create GenerativeModel with system instruction baked in.
          6. Enter tool-use loop (MAX_TOOL_ROUNDS):
             - All tools are read-only; execute immediately and feed back.
          7. Log interaction to MongoDB.
          8. Return GlobalAIChatResponse.

        Args:
            message: User's chat message.
            conversation_history: Previous messages as [{role, content}, ...].
            user_id: Current user ID (used for audit logging only).

        Returns:
            GlobalAIChatResponse with message text and tools_used list.
        """
        if not settings.GOOGLE_CLOUD_PROJECT:
            return GlobalAIChatResponse(
                message=(
                    "AI chat is not configured. "
                    "Please set the GOOGLE_CLOUD_PROJECT environment variable."
                ),
                tools_used=[],
            )

        # Initialise SDK (idempotent after first call inside the same process)
        _init_vertexai()

        # Build system prompt with live farm summary
        system_prompt = await build_global_system_prompt()

        # All tools are read-only — always include them regardless of connectivity.
        # Individual tools handle the case where a block has no SenseHub internally.
        gemini_tools = get_gemini_tools()

        # Convert stored conversation history to Gemini Content objects.
        # Reason: Gemini uses role="model" (not "assistant") for AI turns.
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

        # Start chat session with prior history so Gemini has full context
        chat = model.start_chat(history=history)

        generation_config = GenerationConfig(
            max_output_tokens=settings.FARM_AI_MAX_TOKENS,
            temperature=settings.VERTEX_AI_TEMPERATURE,
        )

        tools_used: list[str] = []
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
                    # No more tool calls — extract final text and exit
                    break

                # Process each function call in this round
                function_responses: list[Part] = []

                for fc_part in function_calls:
                    tool_name: str = fc_part.function_call.name
                    # Reason: Gemini returns a MapComposite; cast to plain dict
                    # so downstream executor code can .get() / iterate it.
                    tool_input: dict = dict(fc_part.function_call.args)
                    tools_used.append(tool_name)

                    # All tools are read-only — execute immediately
                    result = await execute_tool(tool_name, tool_input)

                    function_responses.append(
                        Part.from_function_response(
                            name=tool_name,
                            # Reason: response must be a plain dict, not a
                            # JSON string. execute_tool already returns dicts.
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
            logger.error(f"Vertex AI API error in global chat: {e}")
            if '429' in str(e) or 'Resource exhausted' in str(e):
                detail = "Vertex AI rate limit exceeded (429). Please wait a moment and try again."
            elif '403' in str(e) or 'Permission' in str(e):
                detail = "Vertex AI permission denied (403). Check service account credentials."
            elif '404' in str(e):
                detail = "Vertex AI model not found (404). Check VERTEX_AI_MODEL setting."
            else:
                detail = f"Vertex AI error: {str(e)[:200]}"
            return GlobalAIChatResponse(
                message=detail,
                tools_used=tools_used,
            )
        except Exception as e:
            logger.error(
                f"Unexpected error in Global AI chat: {e}", exc_info=True
            )
            return GlobalAIChatResponse(
                message=f"Unexpected error: {type(e).__name__}: {str(e)[:200]}",
                tools_used=tools_used,
            )

        # Log the interaction to MongoDB (non-blocking; failures are warnings)
        try:
            db = farm_db.get_database()
            await db.farm_ai_chat_log.insert_one(
                {
                    "scope": "global",
                    "userId": user_id,
                    "userMessage": message,
                    "assistantMessage": final_text,
                    "toolsUsed": tools_used,
                    "timestamp": datetime.utcnow(),
                }
            )
        except Exception as e:
            logger.warning(f"Failed to log global AI chat: {e}")

        return GlobalAIChatResponse(
            message=final_text,
            tools_used=tools_used,
        )
