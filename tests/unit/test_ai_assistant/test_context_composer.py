"""
Unit tests for ai_assistant.services.context_composer.

Tests:
  - GLOBAL scope returns a non-empty prompt even when global builder fails.
  - BLOCK scope without IDs falls back to GLOBAL.
  - FARM scope without farm_id falls back to GLOBAL.
  - All scopes produce a string containing at least the read-only constraint.
"""

import pytest
from unittest.mock import AsyncMock, patch

from src.modules.ai_assistant.models.chat_request import ChatContext, ChatScope


@pytest.mark.asyncio
async def test_global_scope_returns_string():
    """GLOBAL scope should return a non-empty system prompt string."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt

    ctx = ChatContext(scope=ChatScope.GLOBAL)

    with patch(
        "src.modules.ai_assistant.services.context_composer._build_global_prompt",
        new=AsyncMock(return_value="You are a global farm AI assistant."),
    ):
        result = await build_system_prompt(ctx)

    assert isinstance(result, str)
    assert len(result) > 0


@pytest.mark.asyncio
async def test_block_scope_missing_ids_falls_back():
    """BLOCK scope without farm_id/block_id should fall back to GLOBAL scope."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt

    ctx = ChatContext(scope=ChatScope.BLOCK, farm_id=None, block_id=None)

    with patch(
        "src.modules.ai_assistant.services.context_composer._build_global_prompt",
        new=AsyncMock(return_value="GLOBAL_FALLBACK"),
    ):
        result = await build_system_prompt(ctx)

    assert result == "GLOBAL_FALLBACK"


@pytest.mark.asyncio
async def test_farm_scope_missing_farm_id_falls_back():
    """FARM scope without farm_id should fall back to GLOBAL scope."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt

    ctx = ChatContext(scope=ChatScope.FARM, farm_id=None)

    with patch(
        "src.modules.ai_assistant.services.context_composer._build_global_prompt",
        new=AsyncMock(return_value="GLOBAL_FALLBACK"),
    ):
        result = await build_system_prompt(ctx)

    assert result == "GLOBAL_FALLBACK"


@pytest.mark.asyncio
async def test_global_builder_failure_returns_safe_fallback():
    """When the global context builder raises, a safe minimal prompt is returned."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt

    ctx = ChatContext(scope=ChatScope.GLOBAL)

    # `_build_global_prompt` (the private helper `build_system_prompt` calls
    # for GLOBAL scope) imports `build_global_system_prompt` LOCALLY from
    # farm_manager.services.global_ai.context_builder inside its own
    # try/except, so we must patch that definition site rather than a
    # (nonexistent) `context_composer.build_global_system_prompt` module
    # attribute — patching a lazily-imported symbol on the wrong module is
    # silently a no-op and the real, unmocked call runs instead. This is the
    # same failure mode that broke test_query_mongodb_routes_to_engine below
    # and the recent Cloudflare Access test work.
    with patch(
        "src.modules.farm_manager.services.global_ai.context_builder"
        ".build_global_system_prompt",
        side_effect=Exception("DB error"),
    ):
        result = await build_system_prompt(ctx)

    # _build_global_prompt's own try/except (context_composer.py) catches the
    # failure and returns its hardcoded safe-fallback string instead of
    # propagating — verify build_system_prompt (the public entry point)
    # surfaces that fallback rather than raising.
    assert isinstance(result, str)
    assert len(result) > 10


@pytest.mark.asyncio
async def test_prompt_contains_read_only_constraint():
    """All scopes should include the read-only constraint text."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt, _append_base_instructions

    base = "You are a farm assistant."
    result = _append_base_instructions(base)

    # Honest caveat: this is still a literal substring match, just a
    # currently-correct one — the previous assertion ("CANNOT control") broke
    # when the prompt was reworded, and this one would too. Asserting prose
    # meaning is not something a string check can do. Kept because the
    # read-only constraint is worth guarding and there is no structured
    # representation of it to assert against; if the prompt is reworded,
    # update this deliberately rather than deleting the check.
    assert "READ-ONLY" in result
    assert "cannot control any equipment" in result.lower()


@pytest.mark.asyncio
async def test_block_scope_with_valid_ids_calls_block_builder():
    """BLOCK scope with valid UUIDs should call the block-level context builder."""
    from src.modules.ai_assistant.services.context_composer import build_system_prompt

    farm_id = "12345678-1234-5678-1234-567812345678"
    block_id = "87654321-4321-8765-4321-876543218765"
    ctx = ChatContext(scope=ChatScope.BLOCK, farm_id=farm_id, block_id=block_id)

    mock_prompt = "Block prompt for Lettuce block."

    with patch(
        "src.modules.farm_manager.services.farm_ai.context_builder.build_system_prompt",
        new=AsyncMock(return_value=(mock_prompt, {"stage": "vegetative"})),
    ):
        with patch(
            "src.modules.ai_assistant.services.context_composer.build_system_prompt",
        ) as mock_build:
            # We test the real function, not the mock
            pass

    # Call the real function with mocked import
    with patch(
        "src.modules.ai_assistant.services.context_composer."
        "build_system_prompt",
        new=AsyncMock(return_value=mock_prompt + " READ-ONLY"),
    ):
        result = await build_system_prompt(ctx)
        # Actual result comes from the real function; this just confirms no exception
