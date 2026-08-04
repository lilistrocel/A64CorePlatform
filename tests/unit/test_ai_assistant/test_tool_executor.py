"""
Unit tests for ai_assistant.services.tool_executor.

Tests:
  - Calling a disallowed (write) tool raises ValueError.
  - query_mongodb routes to the QueryEngine.
  - get_equipment_list routes to SenseHubClient.get_equipment().
  - get_alerts routes to SenseHubClient.get_alerts().
  - SenseHub network errors trigger cache fallback.
  - Missing block_id for SenseHub tools returns an error dict.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_disallowed_write_tool_raises():
    """Calling a write tool name raises ValueError immediately."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    with pytest.raises(ValueError, match="not available"):
        await execute_tool(
            tool_name="control_relay",
            tool_input={"equipment_id": 1, "channel": 1, "state": True},
            user_id="u1",
            user_role="user",
        )


@pytest.mark.asyncio
async def test_disallowed_trigger_automation_raises():
    """trigger_automation is a write tool — must be blocked."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    with pytest.raises(ValueError, match="not available"):
        await execute_tool(
            tool_name="trigger_automation",
            tool_input={"automation_id": 5},
            user_id="u1",
            user_role="user",
        )


@pytest.mark.asyncio
async def test_query_mongodb_routes_to_engine():
    """query_mongodb should delegate to QueryEngine.execute_ai_query."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    mock_result = {"records": [], "records_count": 0}
    mock_engine = AsyncMock()
    mock_engine.execute_ai_query = AsyncMock(return_value=mock_result)

    # `get_query_engine` is never a module attribute of `tool_executor` — it
    # is imported LOCALLY inside `_execute_query_mongodb` at call time:
    #   from src.modules.ai_analytics.services.query_engine import get_query_engine
    # Patching "tool_executor.get_query_engine" is a silent no-op (the name
    # doesn't exist there, so the patch has nothing to replace and the real
    # function runs instead). Patch the definition site instead. This exact
    # mistake — patching a lazily-imported symbol on the wrong module — has
    # now bitten this codebase twice, including the Cloudflare Access test
    # work; when a symbol is imported inside a function body rather than at
    # module scope, always patch where it's defined, not where it's used.
    with patch(
        "src.modules.ai_analytics.services.query_engine.get_query_engine",
        return_value=mock_engine,
    ):
        result = await execute_tool(
            tool_name="query_mongodb",
            tool_input={"question": "How many harvests last month?"},
            user_id="u1",
            user_role="user",
        )

    mock_engine.execute_ai_query.assert_awaited_once()
    assert result == mock_result


@pytest.mark.asyncio
async def test_get_equipment_list_missing_block_id():
    """get_equipment_list without block_id should return an error dict."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    # The _get_sensehub_client helper raises ValueError for missing block_id
    result = await execute_tool(
        tool_name="get_equipment_list",
        tool_input={},  # No block_id
        user_id="u1",
        user_role="user",
    )

    assert "error" in result


@pytest.mark.asyncio
async def test_get_alerts_missing_block_id():
    """get_alerts without block_id should return an error dict."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    result = await execute_tool(
        tool_name="get_alerts",
        tool_input={},  # No block_id
        user_id="u1",
        user_role="user",
    )

    assert "error" in result


@pytest.mark.asyncio
async def test_get_equipment_list_sensehub_unavailable_returns_cache():
    """get_equipment_list falls back to cached data on network errors."""
    import httpx
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    mock_client = AsyncMock()
    mock_client.get_equipment = AsyncMock(
        side_effect=httpx.ConnectError("Connection refused")
    )

    cached_equipment = [{"id": 1, "name": "TempSensor", "type": "sensor"}]

    with patch(
        "src.modules.ai_assistant.services.tool_executor._get_sensehub_client",
        new=AsyncMock(return_value=mock_client),
    ):
        with patch(
            "src.modules.ai_assistant.services.tool_executor.SenseHubCacheQueryService"
            ".get_equipment_as_list",
            new=AsyncMock(return_value=cached_equipment),
        ):
            result = await execute_tool(
                tool_name="get_equipment_list",
                tool_input={"block_id": "block-uuid-1"},
                user_id="u1",
                user_role="user",
            )

    assert result.get("_cached") is True
    assert result.get("count") == 1


@pytest.mark.asyncio
async def test_get_automations_success():
    """get_automations should return the automations list from SenseHub."""
    from src.modules.ai_assistant.services.tool_executor import execute_tool

    automations = [{"id": 1, "name": "Morning irrigation", "enabled": True}]
    mock_client = AsyncMock()
    mock_client.get_automations = AsyncMock(return_value=automations)

    with patch(
        "src.modules.ai_assistant.services.tool_executor._get_sensehub_client",
        new=AsyncMock(return_value=mock_client),
    ):
        result = await execute_tool(
            tool_name="get_automations",
            tool_input={"block_id": "block-uuid-1"},
            user_id="u1",
            user_role="user",
        )

    assert result["count"] == 1
    assert result["automations"] == automations
