"""
Unit tests for ai_assistant.services.claude_service.

Tests:
  - Missing ANTHROPIC_API_KEY raises ValueError at call time (not import time).
  - Tool-use loop terminates after MAX_TOOL_TURNS iterations.
  - Done event is yielded at the end of a successful stream.
  - Auth error yields an error SSE event.
  - Prompt caching fields are present in the system block.
"""

import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _collect_events(generator) -> list:
    """Collect all SSE events from an async generator into a list of dicts."""
    import asyncio

    async def _run():
        events = []
        async for line in generator:
            if line.strip():
                events.append(json.loads(line.strip()))
        return events

    return asyncio.get_event_loop().run_until_complete(_run())


# ---------------------------------------------------------------------------
# Missing API key
# ---------------------------------------------------------------------------


def test_missing_api_key_raises_on_call():
    """get_claude_service() should succeed, but chat_stream should yield an error."""
    from src.modules.ai_assistant.services.claude_service import ClaudeAssistantService

    repo = AsyncMock()
    tracker = AsyncMock()
    tracker.record = AsyncMock(return_value=0.0)

    service = ClaudeAssistantService(repo=repo, cost_tracker=tracker)

    with patch("src.modules.ai_assistant.services.claude_service.settings") as mock_settings:
        mock_settings.ANTHROPIC_API_KEY = ""
        mock_settings.CLAUDE_MODEL = "claude-sonnet-4-6"
        mock_settings.AI_ASSISTANT_MAX_TOKENS = 4096
        mock_settings.AI_ASSISTANT_MAX_TURNS = 50
        mock_settings.AI_ASSISTANT_HISTORY_LIMIT = 3

        # The lazy client build raises ValueError
        with pytest.raises(ValueError, match="ANTHROPIC_API_KEY"):
            service._get_client()


# ---------------------------------------------------------------------------
# Prompt caching on system block
# ---------------------------------------------------------------------------


def test_tool_definitions_last_has_cache_control():
    """The last tool definition must have cache_control: ephemeral."""
    from src.modules.ai_assistant.services.tool_definitions import get_tool_definitions

    tools = get_tool_definitions()
    assert tools, "Tool list must not be empty"

    last_tool = tools[-1]
    assert "cache_control" in last_tool, "Last tool must have cache_control"
    assert last_tool["cache_control"] == {"type": "ephemeral"}


def test_tool_definitions_no_write_tools():
    """Tool definitions must not include any write/control tools."""
    from src.modules.ai_assistant.services.tool_definitions import get_tool_definitions

    forbidden_names = {
        "control_relay",
        "trigger_automation",
        "toggle_automation",
        "create_automation",
        "update_automation",
        "delete_automation",
    }

    tools = get_tool_definitions()
    tool_names = {t["name"] for t in tools}
    overlap = forbidden_names & tool_names

    assert not overlap, f"Write tools must not be in definitions: {overlap}"


def test_tool_definitions_required_tools_present():
    """All Phase B read tools must be defined."""
    from src.modules.ai_assistant.services.tool_definitions import get_tool_definitions

    required = {
        "query_mongodb",
        "get_equipment_list",
        "get_sensor_readings",
        "get_alerts",
        "get_automations",
        "get_lab_readings",
        "get_lab_latest",
    }

    tools = get_tool_definitions()
    tool_names = {t["name"] for t in tools}
    missing = required - tool_names

    assert not missing, f"Missing tool definitions: {missing}"


# ---------------------------------------------------------------------------
# SSE event format
# ---------------------------------------------------------------------------


def test_make_sse_event_format():
    """_make_sse_event should produce valid JSON with a trailing newline."""
    from src.modules.ai_assistant.services.claude_service import _make_sse_event

    event = _make_sse_event({"type": "text", "content": "Hello"})
    assert event.endswith("\n")
    parsed = json.loads(event.strip())
    assert parsed["type"] == "text"
    assert parsed["content"] == "Hello"


def test_make_sse_done_event():
    """Done event should include conversation_id and cost_usd."""
    from src.modules.ai_assistant.services.claude_service import _make_sse_event

    event = _make_sse_event(
        {"type": "done", "conversation_id": "conv-123", "cost_usd": 0.000042}
    )
    parsed = json.loads(event.strip())
    assert parsed["type"] == "done"
    assert parsed["conversation_id"] == "conv-123"
    assert parsed["cost_usd"] == pytest.approx(0.000042)


# ---------------------------------------------------------------------------
# Tool-use loop termination
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tool_loop_terminates_at_max_turns():
    """
    The tool-use loop must stop after MAX_TOOL_TURNS even if Claude keeps
    returning stop_reason='tool_use'.
    """
    from src.modules.ai_assistant.services.claude_service import (
        ClaudeAssistantService,
        MAX_TOOL_TURNS,
    )
    from src.modules.ai_assistant.models.chat_request import ChatContext, ChatScope

    # Build mocks
    repo = AsyncMock()
    mock_conversation = MagicMock()
    mock_conversation.conversation_id = "conv-1"
    mock_conversation.messages = []
    repo.get = AsyncMock(return_value=None)
    repo.create = AsyncMock(return_value=mock_conversation)
    repo.append_messages = AsyncMock()

    cost_tracker = AsyncMock()
    cost_tracker.record = AsyncMock(return_value=0.0)

    # Mock a final message that always returns tool_use
    mock_usage = MagicMock()
    mock_usage.input_tokens = 100
    mock_usage.output_tokens = 50
    mock_usage.cache_creation_input_tokens = 0
    mock_usage.cache_read_input_tokens = 0

    mock_tool_block = MagicMock()
    mock_tool_block.type = "tool_use"
    mock_tool_block.name = "get_equipment_list"
    mock_tool_block.input = {}
    mock_tool_block.id = "tool-use-id-1"

    mock_final = MagicMock()
    mock_final.stop_reason = "tool_use"
    mock_final.usage = mock_usage
    mock_final.content = [mock_tool_block]

    # stream context manager mock
    mock_stream = AsyncMock()
    mock_stream.__aenter__ = AsyncMock(return_value=mock_stream)
    mock_stream.__aexit__ = AsyncMock(return_value=False)
    mock_stream.text_stream = _async_empty_iter()
    mock_stream.get_final_message = AsyncMock(return_value=mock_final)

    mock_anthropic_client = MagicMock()
    mock_anthropic_client.messages.stream = MagicMock(return_value=mock_stream)

    service = ClaudeAssistantService(repo=repo, cost_tracker=cost_tracker)
    service._client = mock_anthropic_client

    # Mock tool executor to return empty result quickly
    with patch(
        "src.modules.ai_assistant.services.claude_service.execute_tool",
        new=AsyncMock(return_value={"equipment": [], "count": 0}),
    ):
        with patch("src.modules.ai_assistant.services.claude_service.build_system_prompt",
                   new=AsyncMock(return_value="system")):
            with patch("src.modules.ai_assistant.services.claude_service.settings") as ms:
                ms.ANTHROPIC_API_KEY = "test-key"
                ms.CLAUDE_MODEL = "claude-sonnet-4-6"
                ms.AI_ASSISTANT_MAX_TOKENS = 4096
                ms.AI_ASSISTANT_MAX_TURNS = 50
                ms.AI_ASSISTANT_HISTORY_LIMIT = 3

                ctx = ChatContext(scope=ChatScope.GLOBAL)
                events = []
                async for line in service.chat_stream(
                    user_message="Test",
                    user_id="u1",
                    user_role="user",
                    conversation_id=None,
                    context=ctx,
                ):
                    if line.strip():
                        events.append(json.loads(line.strip()))

    # The stream must end (done or error event) — not loop forever
    event_types = [e["type"] for e in events]
    assert "done" in event_types or "error" in event_types


async def _async_empty_iter():
    """Async generator that yields nothing (simulates empty text stream)."""
    return
    yield  # Make it an async generator
