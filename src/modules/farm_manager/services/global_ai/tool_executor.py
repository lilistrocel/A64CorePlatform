"""
Global AI Chat - Tool Executor

Maps Gemini tool_use calls to MongoDB queries and SenseHub HTTP clients.
All tools are read-only — no write operations are performed here.

Farm and block resolution is done by name (case-insensitive) rather than
by UUID, matching how users refer to farms and blocks in natural language.
"""

import asyncio
import logging
from typing import Any
from uuid import UUID

from ..database import farm_db
from ..sensehub import SenseHubClient, SenseHubConnectionService

# Reason: Reuse web_search implementation to avoid duplication.
from ..farm_ai.tool_executor import execute_web_search

logger = logging.getLogger(__name__)

# Per-block timeout when gathering alerts in parallel (seconds)
_BLOCK_ALERT_TIMEOUT = 5.0


async def resolve_farm_by_name(farm_name: str) -> tuple[str, dict]:
    """
    Find a farm document by name using a case-insensitive search.

    Args:
        farm_name: Human-readable farm name as provided by the user.

    Returns:
        Tuple of (farm_id_str, farm_doc).

    Raises:
        ValueError: If no matching farm is found.
    """
    db = farm_db.get_database()

    # Reason: Use regex for case-insensitive name matching so users do not
    # need to type the exact capitalisation.
    farm = await db.farms.find_one(
        {"name": {"$regex": f"^{farm_name}$", "$options": "i"}, "isActive": True}
    )

    if not farm:
        # Try partial match as fallback
        farm = await db.farms.find_one(
            {"name": {"$regex": farm_name, "$options": "i"}, "isActive": True}
        )

    if not farm:
        raise ValueError(
            f"Farm '{farm_name}' not found. "
            "Use get_all_farms to see available farm names."
        )

    return farm["farmId"], farm


async def resolve_block(farm_id_str: str, block_code: str) -> tuple[str, dict]:
    """
    Find an active block document by its code within a farm.

    Args:
        farm_id_str: Farm ID string (from resolve_farm_by_name).
        block_code: Block code string as shown in the dashboard.

    Returns:
        Tuple of (block_id_str, block_doc).

    Raises:
        ValueError: If no matching block is found in that farm.
    """
    db = farm_db.get_database()

    block = await db.blocks.find_one(
        {
            "farmId": farm_id_str,
            "blockCode": {"$regex": f"^{block_code}$", "$options": "i"},
            "isActive": True,
        }
    )

    if not block:
        raise ValueError(
            f"Block '{block_code}' not found in farm. "
            "Use get_farm_blocks(farm_name) to see available block codes."
        )

    return block["blockId"], block


async def _get_sensehub_client_for_block(block: dict) -> SenseHubClient:
    """
    Build a SenseHubClient from a block document without hitting the DB again.

    Args:
        block: Full block document from MongoDB (must contain iotController).

    Returns:
        SenseHubClient ready to use.

    Raises:
        ValueError: If the block is not connected to SenseHub.
    """
    from src.utils.encryption import decrypt_sensehub_password

    iot = block.get("iotController")
    if not iot or not iot.get("enabled"):
        raise ValueError("Block does not have SenseHub enabled.")

    creds = iot.get("senseHubCredentials")
    if not creds:
        raise ValueError("Block has no SenseHub credentials configured.")

    try:
        password = decrypt_sensehub_password(creds["encryptedPassword"])
    except Exception as e:
        raise ValueError(f"Failed to decrypt SenseHub credentials: {e}")

    client = SenseHubClient(
        address=iot["address"],
        port=iot.get("port", 3000),
        email=creds["email"],
        password=password,
        token=creds.get("token"),
        token_expires_at=creds.get("tokenExpiresAt"),
    )
    return client


async def _collect_block_alerts(
    farm_name: str,
    block: dict,
    severity: str | None,
) -> list[dict]:
    """
    Collect alerts from a single block's SenseHub instance.

    Wraps each alert with farm and block metadata so callers can identify
    the source without needing to join back to the DB.

    Args:
        farm_name: Farm name (for labelling the alert).
        block: Full block document from MongoDB.
        severity: Optional severity filter passed through to SenseHub.

    Returns:
        List of enriched alert dicts. Returns empty list on any error.
    """
    block_code = block.get("blockCode", block.get("blockId", "unknown"))
    block_id_str = block.get("blockId", "")
    farm_id_str = block.get("farmId", "")

    try:
        client = await _get_sensehub_client_for_block(block)
        alerts = await client.get_alerts(severity=severity)

        enriched: list[dict] = []
        for alert in alerts:
            enriched.append(
                {
                    **alert,
                    "_farm": farm_name,
                    "_block": block_code,
                }
            )
        return enriched

    except Exception as e:
        logger.debug(
            f"Could not collect alerts from {farm_name}/{block_code}: {e}"
        )
        return []


async def execute_tool(tool_name: str, tool_input: dict) -> dict:
    """
    Dispatch a tool call to the appropriate implementation.

    Args:
        tool_name: Name of the tool as declared in tool_definitions.py.
        tool_input: Parameters dict from Gemini function_call.args.

    Returns:
        Tool result as a plain dict (will be fed back to Gemini as
        a function response).
    """
    try:
        if tool_name == "get_all_farms":
            return await _get_all_farms()

        elif tool_name == "get_farm_blocks":
            farm_name = tool_input.get("farm_name", "")
            return await _get_farm_blocks(farm_name)

        elif tool_name == "get_block_equipment_list":
            farm_name = tool_input.get("farm_name", "")
            block_code = tool_input.get("block_code", "")
            return await _get_block_equipment_list(farm_name, block_code)

        elif tool_name == "get_block_sensors":
            farm_name = tool_input.get("farm_name", "")
            block_code = tool_input.get("block_code", "")
            equipment_id = int(tool_input.get("equipment_id", 0))
            limit = int(tool_input.get("limit", 10))
            return await _get_block_sensors(farm_name, block_code, equipment_id, limit)

        elif tool_name == "get_farm_alerts":
            farm_name = tool_input.get("farm_name", "")
            severity = tool_input.get("severity")
            return await _get_farm_alerts(farm_name, severity)

        elif tool_name == "get_all_alerts":
            severity = tool_input.get("severity")
            return await _get_all_alerts(severity)

        elif tool_name == "web_search":
            query = tool_input.get("query", "")
            return await execute_web_search(query)

        else:
            return {"error": f"Unknown tool: {tool_name}"}

    except ValueError as e:
        # Reason: Return user-facing errors as structured dicts so Gemini
        # can relay a helpful message rather than raise an unhandled exception.
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Unexpected error in global tool executor: {tool_name} - {e}")
        return {"error": f"Tool execution failed: {str(e)}"}


# ---------------------------------------------------------------------------
# Private tool implementations
# ---------------------------------------------------------------------------


async def _get_all_farms() -> dict:
    """
    Return a live summary of all active farms with block and sensor counts.

    Returns:
        Dict with 'farms' list and 'total_farms' count.
    """
    db = farm_db.get_database()

    farms_cursor = db.farms.find({"isActive": True})
    farms = await farms_cursor.to_list(length=500)

    result_farms: list[dict] = []

    for farm in farms:
        farm_id_str = farm.get("farmId", "")
        farm_name = farm.get("name", "Unknown Farm")

        location = farm.get("location", {})
        if isinstance(location, dict):
            city = location.get("city", "")
            country = location.get("country", "")
            location_str = ", ".join(filter(None, [city, country])) or "Unknown"
        else:
            location_str = str(location) if location else "Unknown"

        block_count = await db.blocks.count_documents(
            {"farmId": farm_id_str, "isActive": True}
        )
        connected_count = await db.blocks.count_documents(
            {
                "farmId": farm_id_str,
                "isActive": True,
                "iotController.enabled": True,
                "iotController.connectionStatus": "connected",
            }
        )

        result_farms.append(
            {
                "farm_name": farm_name,
                "farm_id": farm_id_str,
                "location": location_str,
                "total_blocks": block_count,
                "sensehub_connected_blocks": connected_count,
            }
        )

    return {"farms": result_farms, "total_farms": len(result_farms)}


async def _get_farm_blocks(farm_name: str) -> dict:
    """
    Return all active blocks for a farm identified by name.

    Args:
        farm_name: Human-readable farm name.

    Returns:
        Dict with 'farm_name', 'farm_id', 'blocks', and 'total_blocks'.

    Raises:
        ValueError: If farm not found.
    """
    farm_id_str, farm_doc = await resolve_farm_by_name(farm_name)
    db = farm_db.get_database()

    cursor = db.blocks.find({"farmId": farm_id_str, "isActive": True}).sort(
        "blockCode", 1
    )
    blocks = await cursor.to_list(length=500)

    block_summaries: list[dict] = []
    for block in blocks:
        iot = block.get("iotController") or {}
        block_summaries.append(
            {
                "block_code": block.get("blockCode", ""),
                "block_id": block.get("blockId", ""),
                "block_type": block.get("blockType", "unknown"),
                "state": block.get("state", "empty"),
                "current_crop": block.get("targetCropName", None),
                "plant_count": block.get("actualPlantCount", 0),
                "area": block.get("area", 0),
                "area_unit": block.get("areaUnit", "sqm"),
                "sensehub_connected": (
                    iot.get("enabled", False)
                    and iot.get("connectionStatus") == "connected"
                ),
            }
        )

    return {
        "farm_name": farm_doc.get("name", farm_name),
        "farm_id": farm_id_str,
        "blocks": block_summaries,
        "total_blocks": len(block_summaries),
    }


async def _get_block_equipment_list(farm_name: str, block_code: str) -> dict:
    """
    Return the SenseHub equipment list for a specific block.

    Args:
        farm_name: Human-readable farm name.
        block_code: Block code string.

    Returns:
        Dict with equipment list and count, plus farm/block context.

    Raises:
        ValueError: If farm or block not found, or block not connected.
    """
    farm_id_str, farm_doc = await resolve_farm_by_name(farm_name)
    block_id_str, block_doc = await resolve_block(farm_id_str, block_code)

    client = await _get_sensehub_client_for_block(block_doc)
    equipment = await client.get_equipment()

    return {
        "farm_name": farm_doc.get("name", farm_name),
        "block_code": block_doc.get("blockCode", block_code),
        "equipment": equipment,
        "count": len(equipment),
    }


async def _get_block_sensors(
    farm_name: str,
    block_code: str,
    equipment_id: int,
    limit: int,
) -> dict:
    """
    Return sensor readings for a specific equipment device in a block.

    Fetches both historical readings and the latest snapshot from the
    equipment object itself (which is more reliable on fresh instances).

    Args:
        farm_name: Human-readable farm name.
        block_code: Block code string.
        equipment_id: SenseHub equipment integer ID.
        limit: Max number of historical readings to return.

    Returns:
        Dict with 'equipment_id', 'latest_reading', 'readings', and 'count'.

    Raises:
        ValueError: If farm or block not found, or block not connected.
    """
    farm_id_str, farm_doc = await resolve_farm_by_name(farm_name)
    block_id_str, block_doc = await resolve_block(farm_id_str, block_code)

    client = await _get_sensehub_client_for_block(block_doc)

    # Fetch historical readings
    readings = await client.get_equipment_history(equipment_id, limit=limit)

    # Fetch latest reading from the equipment object
    latest_reading = None
    try:
        all_equipment = await client.get_equipment()
        for eq in all_equipment:
            eq_id = eq.get("id") or eq.get("equipment_id")
            if eq_id is not None and int(eq_id) == equipment_id:
                latest_reading = eq.get("last_reading") or eq.get("lastReading")
                break
    except Exception as e:
        logger.debug(
            f"Could not fetch latest reading for equipment {equipment_id}: {e}"
        )

    result: dict[str, Any] = {
        "farm_name": farm_doc.get("name", farm_name),
        "block_code": block_doc.get("blockCode", block_code),
        "equipment_id": equipment_id,
        "readings": readings,
        "count": len(readings),
    }
    if latest_reading is not None:
        result["latest_reading"] = latest_reading

    return result


async def _get_farm_alerts(farm_name: str, severity: str | None) -> dict:
    """
    Collect alerts from all SenseHub-connected blocks on a single farm.

    Uses asyncio.gather for parallel fetching across blocks, with individual
    error handling so a single offline block does not abort the whole request.

    Args:
        farm_name: Human-readable farm name.
        severity: Optional severity filter ("critical", "warning", "info").

    Returns:
        Dict with 'farm_name', 'alerts', 'total_alerts', and 'blocks_queried'.

    Raises:
        ValueError: If farm not found.
    """
    farm_id_str, farm_doc = await resolve_farm_by_name(farm_name)
    db = farm_db.get_database()

    # Reason: Only query blocks that are actually connected to avoid
    # attempting HTTP calls to blocks with no SenseHub.
    connected_blocks_cursor = db.blocks.find(
        {
            "farmId": farm_id_str,
            "isActive": True,
            "iotController.enabled": True,
            "iotController.connectionStatus": "connected",
        }
    )
    connected_blocks = await connected_blocks_cursor.to_list(length=200)

    if not connected_blocks:
        return {
            "farm_name": farm_doc.get("name", farm_name),
            "alerts": [],
            "total_alerts": 0,
            "blocks_queried": 0,
            "message": "No SenseHub-connected blocks found on this farm.",
        }

    resolved_farm_name = farm_doc.get("name", farm_name)

    # Gather alerts from all connected blocks in parallel
    tasks = [
        asyncio.wait_for(
            _collect_block_alerts(resolved_farm_name, block, severity),
            timeout=_BLOCK_ALERT_TIMEOUT,
        )
        for block in connected_blocks
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_alerts: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            # Reason: Log timeout/errors but continue so one offline block
            # does not prevent the rest from being queried.
            logger.debug(f"Alert collection task failed: {result}")
            continue
        all_alerts.extend(result)

    return {
        "farm_name": resolved_farm_name,
        "alerts": all_alerts,
        "total_alerts": len(all_alerts),
        "blocks_queried": len(connected_blocks),
    }


async def _get_all_alerts(severity: str | None) -> dict:
    """
    Collect alerts across ALL farms and ALL SenseHub-connected blocks.

    Uses asyncio.gather for parallel fetching across all connected blocks
    platform-wide, with per-block timeouts so a single offline node does
    not stall the entire request.

    Args:
        severity: Optional severity filter ("critical", "warning", "info").

    Returns:
        Dict with 'alerts', 'total_alerts', 'farms_queried', and
        'blocks_queried'.
    """
    db = farm_db.get_database()

    # Load all connected blocks across all farms in one query
    connected_blocks_cursor = db.blocks.find(
        {
            "isActive": True,
            "iotController.enabled": True,
            "iotController.connectionStatus": "connected",
        }
    )
    connected_blocks = await connected_blocks_cursor.to_list(length=1000)

    if not connected_blocks:
        return {
            "alerts": [],
            "total_alerts": 0,
            "farms_queried": 0,
            "blocks_queried": 0,
            "message": "No SenseHub-connected blocks found in the platform.",
        }

    # Build a farm_id -> farm_name lookup to avoid N+1 queries
    all_farm_ids = list({b.get("farmId", "") for b in connected_blocks})
    farms_cursor = db.farms.find({"farmId": {"$in": all_farm_ids}})
    farms_list = await farms_cursor.to_list(length=len(all_farm_ids))
    farm_name_map: dict[str, str] = {
        f["farmId"]: f.get("name", "Unknown Farm") for f in farms_list
    }

    # Create a parallel task for every connected block
    tasks = [
        asyncio.wait_for(
            _collect_block_alerts(
                farm_name_map.get(block.get("farmId", ""), "Unknown Farm"),
                block,
                severity,
            ),
            timeout=_BLOCK_ALERT_TIMEOUT,
        )
        for block in connected_blocks
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    all_alerts: list[dict] = []
    for result in results:
        if isinstance(result, Exception):
            logger.debug(f"Alert collection task failed: {result}")
            continue
        all_alerts.extend(result)

    farms_with_alerts = len({a.get("_farm") for a in all_alerts})

    return {
        "alerts": all_alerts,
        "total_alerts": len(all_alerts),
        "farms_queried": len(farm_name_map),
        "blocks_queried": len(connected_blocks),
        "farms_with_alerts": farms_with_alerts,
    }
