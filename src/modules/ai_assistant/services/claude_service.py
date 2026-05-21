"""
AI Assistant — Claude Service (Phase A)

Wraps the Anthropic Python SDK's AsyncAnthropic client to provide:
  - Streaming responses via async generator
  - Prompt caching on system prompt + tool definitions
  - Bounded tool-use loop (max MAX_TOOL_TURNS per user message)
  - SSE event emission for text chunks, tool events, and completion
  - Cost tracking via CostTracker

This module intentionally does NOT handle conversation persistence or
context building — those concerns live in conversation_repository.py and
context_composer.py respectively.

Streaming event format (newline-delimited JSON, SSE compatible):
  {"type": "text",        "content": "<chunk>"}
  {"type": "tool_use",    "name": "<tool>", "input": {...}}
  {"type": "tool_result", "name": "<tool>", "output": {...}}
  {"type": "done",        "conversation_id": "...", "cost_usd": 0.000123}
  {"type": "error",       "message": "<safe message>"}
"""

import json
import logging
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

import anthropic

from src.config.settings import settings

from ..models.chat_request import ChatContext
from .context_composer import build_system_prompt
from .conversation_repository import ConversationRepository, get_conversation_repository
from .cost_tracker import CostTracker, get_cost_tracker
from .tool_definitions import get_tool_definitions
from .tool_executor import execute_tool

logger = logging.getLogger(__name__)

# Maximum tool-use turns per user message to prevent runaway loops.
MAX_TOOL_TURNS = 8


def _make_sse_event(data: Dict[str, Any]) -> str:
    """
    Serialize a dict to a newline-terminated JSON string for SSE.

    Args:
        data: Event payload dict.

    Returns:
        JSON string with trailing newline (not the SSE `data:` prefix —
        that is added by the FastAPI StreamingResponse).
    """
    return json.dumps(data, ensure_ascii=False) + "\n"


class ClaudeAssistantService:
    """
    Core service for the Claude AI assistant.

    Manages the Anthropic client, tool-use loop, streaming, and cost tracking.
    A single shared instance is safe for concurrent requests — the AsyncAnthropic
    client is thread/async-safe and stateless between calls.
    """

    def __init__(
        self,
        repo: ConversationRepository,
        cost_tracker: CostTracker,
    ) -> None:
        """
        Initialise the service.

        Args:
            repo:         ConversationRepository for loading/saving history.
            cost_tracker: CostTracker for recording usage and cost.
        """
        self._repo = repo
        self._cost_tracker = cost_tracker
        # Reason: Build the client lazily so that missing ANTHROPIC_API_KEY
        # only causes an error at call time, not at import time.
        self._client: Optional[anthropic.AsyncAnthropic] = None

    def _get_client(self) -> anthropic.AsyncAnthropic:
        """
        Return (or lazily create) the AsyncAnthropic client.

        Returns:
            AsyncAnthropic client instance.

        Raises:
            ValueError: If ANTHROPIC_API_KEY is not set.
        """
        if self._client is None:
            api_key = settings.ANTHROPIC_API_KEY
            if not api_key:
                raise ValueError(
                    "ANTHROPIC_API_KEY is not configured. "
                    "Set it in the environment to enable the AI assistant."
                )
            self._client = anthropic.AsyncAnthropic(api_key=api_key)
        return self._client

    async def chat_stream(
        self,
        user_message: str,
        user_id: str,
        user_role: str,
        conversation_id: Optional[str],
        context: ChatContext,
    ) -> AsyncGenerator[str, None]:
        """
        Stream a Claude response for a user message.

        Yields newline-delimited JSON SSE event strings. Handles:
          - Context building (system prompt)
          - Conversation history loading / creation
          - Bounded tool-use loop (max MAX_TOOL_TURNS)
          - Cost tracking and conversation persistence

        Args:
            user_message:     The user's chat input.
            user_id:          Authenticated user ID.
            user_role:        User role string for QueryValidator permission checks.
            conversation_id:  Existing conversation to continue (None = new).
            context:          Farm/block scoping for context building.

        Yields:
            Newline-terminated JSON strings (SSE event bodies).
        """
        start_time = time.monotonic()
        client = self._get_client()

        # ------------------------------------------------------------------
        # 1. Build or resume conversation
        # ------------------------------------------------------------------
        history_limit: int = settings.AI_ASSISTANT_HISTORY_LIMIT
        conversation = None

        if conversation_id:
            conversation = await self._repo.get(conversation_id, user_id)
            if conversation is None:
                # Conversation not found or belongs to another user — start fresh.
                logger.warning(
                    "Conversation %s not found for user %s — creating new",
                    conversation_id,
                    user_id,
                )

        if conversation is None:
            conversation = await self._repo.create(
                user_id=user_id,
                opening_message=user_message,
                context=context.model_dump(),
                history_limit=history_limit,
            )

        active_conv_id = conversation.conversation_id

        # ------------------------------------------------------------------
        # 2. Build system prompt with prompt caching
        # ------------------------------------------------------------------
        system_prompt_text = await build_system_prompt(context)
        system_block = [
            {
                "type": "text",
                "text": system_prompt_text,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        # ------------------------------------------------------------------
        # 3. Reconstruct message history for the API call
        #    Convert stored Message objects to Anthropic format.
        # ------------------------------------------------------------------
        messages: List[Dict[str, Any]] = []
        for msg in conversation.messages:
            messages.append(
                {"role": msg.role.value, "content": msg.content}
            )

        # Append the new user message
        messages.append({"role": "user", "content": user_message})

        # Enforce MAX_TURNS: keep only the last AI_ASSISTANT_MAX_TURNS turns.
        # Reason: Prevents unbounded memory growth and runaway token costs.
        max_turns = settings.AI_ASSISTANT_MAX_TURNS * 2  # each turn = user + assistant
        if len(messages) > max_turns:
            messages = messages[-max_turns:]

        # ------------------------------------------------------------------
        # 4. Tool-use loop — bounded at MAX_TOOL_TURNS
        # ------------------------------------------------------------------
        tool_defs = get_tool_definitions()
        total_input_tokens = 0
        total_output_tokens = 0
        total_cache_creation = 0
        total_cache_read = 0
        total_tool_calls = 0
        full_assistant_text = ""
        tool_turn = 0

        while tool_turn <= MAX_TOOL_TURNS:
            try:
                async with client.messages.stream(
                    model=settings.CLAUDE_MODEL,
                    max_tokens=settings.AI_ASSISTANT_MAX_TOKENS,
                    system=system_block,
                    tools=tool_defs,
                    messages=messages,
                ) as stream:
                    # Stream text chunks to the client
                    async for text_chunk in stream.text_stream:
                        full_assistant_text += text_chunk
                        yield _make_sse_event({"type": "text", "content": text_chunk})

                    final = await stream.get_final_message()

            except anthropic.AuthenticationError:
                logger.error("Anthropic authentication failed — check ANTHROPIC_API_KEY")
                yield _make_sse_event(
                    {"type": "error", "message": "AI assistant is not configured. Contact your administrator."}
                )
                return
            except anthropic.RateLimitError:
                logger.warning("Anthropic rate limit hit for user %s", user_id)
                yield _make_sse_event(
                    {"type": "error", "message": "The AI assistant is temporarily busy. Please try again in a moment."}
                )
                return
            except Exception as exc:
                logger.error(
                    "Claude API error for user %s: %s", user_id, exc, exc_info=True
                )
                yield _make_sse_event(
                    {"type": "error", "message": "An unexpected error occurred. Please try again."}
                )
                return

            # Accumulate token counts across all turns in this message
            usage = final.usage
            total_input_tokens += getattr(usage, "input_tokens", 0)
            total_output_tokens += getattr(usage, "output_tokens", 0)
            total_cache_creation += getattr(usage, "cache_creation_input_tokens", 0)
            total_cache_read += getattr(usage, "cache_read_input_tokens", 0)

            stop_reason = final.stop_reason

            # ------------------------------------------------------------------
            # 5. Handle tool-use if Claude wants to call tools
            # ------------------------------------------------------------------
            if stop_reason == "tool_use":
                tool_turn += 1

                # Collect all tool_use blocks from this response
                tool_use_blocks = [
                    block for block in final.content if block.type == "tool_use"
                ]

                # Append Claude's response (including tool_use blocks) to messages
                messages.append({"role": "assistant", "content": final.content})

                # Execute each tool and collect results
                tool_result_content = []
                for tool_block in tool_use_blocks:
                    tool_name = tool_block.name
                    tool_input = tool_block.input
                    tool_use_id = tool_block.id

                    # Emit tool_use event so frontend can show "checking…" indicator
                    yield _make_sse_event(
                        {"type": "tool_use", "name": tool_name, "input": tool_input}
                    )

                    # Execute the tool
                    total_tool_calls += 1
                    try:
                        result = await execute_tool(
                            tool_name=tool_name,
                            tool_input=tool_input,
                            user_id=user_id,
                            user_role=user_role,
                            conversation_history=messages,
                        )
                    except Exception as exc:
                        logger.error(
                            "Tool %s failed for user %s: %s",
                            tool_name, user_id, exc, exc_info=True,
                        )
                        result = {"error": f"Tool execution failed: {str(exc)}"}

                    # Emit tool_result event
                    yield _make_sse_event(
                        {"type": "tool_result", "name": tool_name, "output": result}
                    )

                    tool_result_content.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": json.dumps(result, default=str),
                        }
                    )

                # Append tool results and continue the loop
                messages.append({"role": "user", "content": tool_result_content})

                # Guard: if we have hit the tool turn limit, break to avoid a loop
                if tool_turn >= MAX_TOOL_TURNS:
                    logger.warning(
                        "Tool turn limit (%d) reached for user %s conversation %s",
                        MAX_TOOL_TURNS, user_id, active_conv_id,
                    )
                    break

                continue  # Send next request to Claude with tool results

            # stop_reason is "end_turn" (or something else) — streaming complete
            break

        # ------------------------------------------------------------------
        # 6. Persist conversation and record cost
        # ------------------------------------------------------------------
        duration = time.monotonic() - start_time

        await self._repo.append_messages(
            conversation_id=active_conv_id,
            user_id=user_id,
            user_message=user_message,
            assistant_message=full_assistant_text,
        )

        cost_usd = await self._cost_tracker.record(
            user_id=user_id,
            conversation_id=active_conv_id,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            cache_creation_tokens=total_cache_creation,
            cache_read_tokens=total_cache_read,
            tool_calls=total_tool_calls,
            model=settings.CLAUDE_MODEL,
            scope=context.scope.value,
            duration_seconds=round(duration, 2),
        )

        # ------------------------------------------------------------------
        # 7. Emit done event
        # ------------------------------------------------------------------
        yield _make_sse_event(
            {
                "type": "done",
                "conversation_id": active_conv_id,
                "cost_usd": cost_usd,
            }
        )


# ---------------------------------------------------------------------------
# Singleton factory
# ---------------------------------------------------------------------------

_service: Optional[ClaudeAssistantService] = None


def get_claude_service() -> ClaudeAssistantService:
    """
    Return the shared ClaudeAssistantService singleton.

    Returns:
        ClaudeAssistantService instance.
    """
    global _service
    if _service is None:
        _service = ClaudeAssistantService(
            repo=get_conversation_repository(),
            cost_tracker=get_cost_tracker(),
        )
    return _service
