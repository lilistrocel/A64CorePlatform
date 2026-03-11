"""
Farm-Level AI Chat - Tool Executor

Maps Gemini tool_use calls to SenseHubClient methods.  All block-specific
tools resolve the ``block_code`` parameter to a block document and its
SenseHub connection before delegating to the client.

Read tools execute immediately; write tools delegate to the block-level
execute_write_tool (same SenseHub operations, just reached through a
different routing layer).
"""

import asyncio
import logging
from typing import Optional
from uuid import UUID

from ..database import farm_db
from ..sensehub import SenseHubClient, SenseHubConnectionService
from ..farm_ai.tool_executor import (
    execute_web_search,
    execute_write_tool as _block_execute_write_tool,
)

logger = logging.getLogger(__name__)


async def resolve_block(
    farm_id: UUID,
    block_code: str,
) -> tuple[str, dict]:
    """
    Resolve a block_code string to its MongoDB document.

    Args:
        farm_id: Farm UUID used to scope the query.
        block_code: The block code string (e.g. 'BLK-001').

    Returns:
        A tuple of (block_id_str, block_doc).

    Raises:
        ValueError: If no matching active block is found.
    """
    db = farm_db.get_database()
    block = await db.blocks.find_one(
        {
            "farmId": str(farm_id),
            "blockCode": block_code,
            "isActive": True,
        }
    )
    if not block:
        raise ValueError(
            f"Block with code '{block_code}' not found on farm {farm_id}. "
            "Check the block code and try again."
        )
    block_id_str = str(block.get("blockId", ""))
    return block_id_str, block


async def get_sensehub_client(
    farm_id: UUID,
    block_id: UUID,
) -> SenseHubClient:
    """
    Obtain an authenticated SenseHub client for a block.

    Tries MCP client first (faster, streaming), falls back to HTTP client.

    Args:
        farm_id: Farm UUID.
        block_id: Block UUID.

    Returns:
        An authenticated SenseHubClient (or SenseHubMCPClient).

    Raises:
        Exception: If neither MCP nor HTTP connection can be established.
    """
    try:
        return await SenseHubConnectionService.get_mcp_client(farm_id, block_id)
    except Exception:
        return await SenseHubConnectionService.get_client(farm_id, block_id)


async def _get_farm_overview(farm_id: UUID) -> dict:
    """
    Load all active blocks for the farm from MongoDB and return a summary.

    Does not require SenseHub connectivity.

    Args:
        farm_id: Farm UUID.

    Returns:
        Dict with farm_id, block_count, and a list of block summaries.
    """
    db = farm_db.get_database()
    cursor = db.blocks.find({"farmId": str(farm_id), "isActive": True}).sort(
        "blockCode", 1
    )
    blocks = await cursor.to_list(length=500)

    summaries = []
    for b in blocks:
        iot = b.get("iotController") or {}
        summaries.append(
            {
                "block_code": b.get("blockCode", ""),
                "name": b.get("name", ""),
                "state": b.get("state", "unknown"),
                "block_type": b.get("blockType", "unknown"),
                "crop": b.get("targetCropName", ""),
                "plant_count": b.get("actualPlantCount", 0) or 0,
                "sensehub_connected": iot.get("connectionStatus") == "connected",
            }
        )

    return {
        "farm_id": str(farm_id),
        "block_count": len(summaries),
        "blocks": summaries,
    }


async def execute_read_tool(
    farm_id: UUID,
    tool_name: str,
    tool_input: dict,
) -> dict:
    """
    Execute a read-only farm-level tool and return the result.

    The ``get_farm_overview`` and ``web_search`` tools do not need SenseHub.
    All other tools resolve the block_code, obtain a SenseHub client, and
    delegate to the appropriate client method.

    Args:
        farm_id: Farm UUID (used for block resolution and DB queries).
        tool_name: Name of the tool to execute.
        tool_input: Tool input parameters from Gemini.

    Returns:
        Tool execution result as a plain dict.
    """
    try:
        # --- Tools that do not need SenseHub ---

        if tool_name == "get_farm_overview":
            return await _get_farm_overview(farm_id)

        if tool_name == "web_search":
            query = tool_input.get("query", "")
            return await execute_web_search(query)

        if tool_name == "get_all_blocks_alerts":
            return await _get_all_blocks_alerts(
                farm_id, severity=tool_input.get("severity")
            )

        # --- Block-specific tools: resolve block_code first ---

        block_code = tool_input.get("block_code", "")
        if not block_code:
            return {"error": "block_code parameter is required for this tool."}

        try:
            block_id_str, block_doc = await resolve_block(farm_id, block_code)
        except ValueError as e:
            return {"error": str(e)}

        from uuid import UUID as _UUID

        block_uuid = _UUID(block_id_str)

        try:
            client = await get_sensehub_client(farm_id, block_uuid)
        except Exception as e:
            return {
                "error": (
                    f"Cannot connect to SenseHub for block '{block_code}': {e}. "
                    "Ensure SenseHub is online and credentials are configured."
                )
            }

        if tool_name == "get_block_equipment":
            equipment = await client.get_equipment()
            return {
                "block_code": block_code,
                "equipment": equipment,
                "count": len(equipment),
            }

        elif tool_name == "get_block_sensor_readings":
            equipment_id = int(tool_input["equipment_id"])
            limit = int(tool_input.get("limit", 10))

            readings = await client.get_equipment_history(equipment_id, limit=limit)

            latest_reading: Optional[dict] = None
            try:
                all_equipment = await client.get_equipment()
                for eq in all_equipment:
                    eq_id = eq.get("id") or eq.get("equipment_id")
                    if eq_id is not None and int(eq_id) == equipment_id:
                        latest_reading = eq.get("last_reading") or eq.get("lastReading")
                        break
            except Exception as inner_e:
                logger.debug(
                    f"Could not fetch latest reading for equipment "
                    f"{equipment_id} on block '{block_code}': {inner_e}"
                )

            result: dict = {
                "block_code": block_code,
                "equipment_id": equipment_id,
                "readings": readings,
                "count": len(readings),
            }
            if latest_reading is not None:
                result["latest_reading"] = latest_reading
            return result

        elif tool_name == "get_block_automations":
            automations = await client.get_automations()
            return {
                "block_code": block_code,
                "automations": automations,
                "count": len(automations),
            }

        elif tool_name == "get_block_alerts":
            severity = tool_input.get("severity")
            alerts = await client.get_alerts(severity=severity)
            return {
                "block_code": block_code,
                "alerts": alerts,
                "count": len(alerts),
            }

        elif tool_name == "get_block_system_status":
            health = await client.health_check()
            system_info = await client.get_system_info()
            return {
                "block_code": block_code,
                "health": health,
                "system_info": system_info,
            }

        else:
            raise ValueError(f"Unknown read tool: {tool_name}")

    except Exception as e:
        logger.error(f"Farm-level read tool execution failed: {tool_name} - {e}")
        return {"error": str(e)}


async def _get_all_blocks_alerts(
    farm_id: UUID,
    severity: Optional[str] = None,
) -> dict:
    """
    Aggregate SenseHub alerts across all SenseHub-connected blocks on the farm.

    Uses asyncio.gather for concurrent requests.  Per-block errors are captured
    as partial results so a single offline block does not fail the whole call.

    Args:
        farm_id: Farm UUID.
        severity: Optional severity filter ('critical', 'warning', 'info').

    Returns:
        Dict with total alert count and per-block alert lists.
    """
    db = farm_db.get_database()

    # Find all connected blocks
    cursor = db.blocks.find(
        {
            "farmId": str(farm_id),
            "isActive": True,
            "iotController.connectionStatus": "connected",
        }
    ).sort("blockCode", 1)
    connected_blocks = await cursor.to_list(length=500)

    if not connected_blocks:
        return {
            "message": "No SenseHub-connected blocks found on this farm.",
            "total_alerts": 0,
            "blocks": [],
        }

    async def _fetch_block_alerts(block: dict) -> dict:
        """Fetch alerts for a single block; capture errors gracefully."""
        block_code = block.get("blockCode", "")
        block_id_str = str(block.get("blockId", ""))
        try:
            from uuid import UUID as _UUID

            block_uuid = _UUID(block_id_str)
            client = await get_sensehub_client(farm_id, block_uuid)
            alerts = await client.get_alerts(severity=severity)
            return {
                "block_code": block_code,
                "alerts": alerts,
                "count": len(alerts),
                "error": None,
            }
        except Exception as e:
            logger.warning(
                f"Failed to fetch alerts for block '{block_code}': {e}"
            )
            return {
                "block_code": block_code,
                "alerts": [],
                "count": 0,
                "error": str(e),
            }

    # Fetch alerts from all blocks concurrently
    per_block_results = await asyncio.gather(
        *[_fetch_block_alerts(b) for b in connected_blocks]
    )

    total_alerts = sum(r["count"] for r in per_block_results)

    return {
        "total_alerts": total_alerts,
        "severity_filter": severity,
        "blocks": list(per_block_results),
    }


async def execute_write_tool(
    client: SenseHubClient,
    tool_name: str,
    tool_input: dict,
) -> dict:
    """
    Execute a confirmed farm-level write tool via a SenseHub client.

    Maps farm-level write tool names to their block-level equivalents and
    delegates to the block-level executor to avoid code duplication.

    Args:
        client: Authenticated SenseHubClient for the target block.
        tool_name: Farm-level write tool name (e.g. 'control_block_relay').
        tool_input: Tool input parameters (may include block_code which is
                    ignored here since the client is already resolved).

    Returns:
        Execution result dict from the block-level executor.
    """
    # Map farm-level tool names to block-level equivalents
    _FARM_TO_BLOCK: dict[str, str] = {
        "control_block_relay": "control_relay",
        "trigger_block_automation": "trigger_automation",
        "toggle_block_automation": "toggle_automation",
    }

    block_tool_name = _FARM_TO_BLOCK.get(tool_name)
    if not block_tool_name:
        return {"success": False, "error": f"Unknown write tool: {tool_name}"}

    # Strip block_code from input before forwarding - block-level tool doesn't expect it
    forwarded_input = {k: v for k, v in tool_input.items() if k != "block_code"}

    return await _block_execute_write_tool(client, block_tool_name, forwarded_input)


def describe_write_action(tool_name: str, tool_input: dict) -> tuple[str, str]:
    """
    Generate a human-readable description and risk level for a farm-level write action.

    Always includes the target block_code in the description so users know
    exactly which block will be affected.

    Args:
        tool_name: The farm-level write tool name.
        tool_input: Tool input parameters including block_code.

    Returns:
        A tuple of (description, risk_level).
    """
    block_code = tool_input.get("block_code", "?")

    if tool_name == "control_block_relay":
        state_str = "ON" if tool_input.get("state") else "OFF"
        desc = (
            f"[Block {block_code}] Turn {state_str} relay channel "
            f"{tool_input.get('channel', '?')} on equipment "
            f"#{tool_input.get('equipment_id', '?')}"
        )
        return desc, "medium"

    elif tool_name == "trigger_block_automation":
        desc = (
            f"[Block {block_code}] Trigger automation "
            f"#{tool_input.get('automation_id', '?')} to run once"
        )
        return desc, "medium"

    elif tool_name == "toggle_block_automation":
        desc = (
            f"[Block {block_code}] Toggle automation "
            f"#{tool_input.get('automation_id', '?')} enabled/disabled"
        )
        return desc, "medium"

    return f"[Block {block_code}] Execute {tool_name}", "high"
