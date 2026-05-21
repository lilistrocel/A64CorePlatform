"""
AI Assistant — Tool Executor (Phase B)

Dispatches Claude tool-use calls to the appropriate backend service.
All executed tools are READ-ONLY. No write/control actions are permitted.

Routing:
  query_mongodb     → ai_analytics QueryEngine (NL→MongoDB pipeline)
  get_equipment_list  → SenseHubClient via block connection service
  get_sensor_readings → SenseHubClient
  get_alerts          → SenseHubClient
  get_automations     → SenseHubClient
  get_lab_readings    → SenseHubClient (GET /api/lab/readings)
  get_lab_latest      → SenseHubClient (GET /api/lab/latest)

SenseHub fallback:
  On network errors the executor falls back to SenseHubCacheQueryService
  (Redis/DB cached data) before returning an error result.
"""

import json
import logging
from typing import Any, Dict, Optional
from uuid import UUID

import httpx
from fastapi import HTTPException

from src.config.settings import settings
from src.modules.farm_manager.services.database import farm_db
from src.services.database import MongoDBManager
from src.modules.farm_manager.services.sensehub import (
    SenseHubCacheQueryService,
)
from src.modules.farm_manager.services.sensehub.sensehub_connection_service import (
    SenseHubConnectionService,
)

logger = logging.getLogger(__name__)

# READ-ONLY tool set — the executor will reject any name not in this set.
_READ_TOOLS = frozenset(
    {
        "query_mongodb",
        "get_equipment_list",
        "get_sensor_readings",
        "get_alerts",
        "get_automations",
        "get_lab_readings",
        "get_lab_latest",
    }
)


async def _get_sensehub_client(block_id: Optional[str]):
    """
    Retrieve an authenticated SenseHubClient for the given block.

    Looks up the block document to obtain its farmId, then delegates to
    SenseHubConnectionService.get_client(farm_id, block_id).

    Args:
        block_id: UUID string of the farm block.

    Returns:
        SenseHubClient instance, or None if block has no IoT controller.

    Raises:
        ValueError: If block_id is not provided or block is not found.
    """
    if not block_id:
        raise ValueError(
            "block_id is required to query SenseHub data. "
            "Please specify which farm block you are asking about."
        )

    # Reason: SenseHubConnectionService.get_client requires farm_id.
    # We look it up from the block document so callers only need block_id.
    db = farm_db.get_database()
    block = await db.blocks.find_one(
        {"blockId": block_id, "isActive": True},
        {"farmId": 1, "_id": 0},
    )
    if not block:
        raise ValueError(
            f"Block '{block_id}' not found. "
            "Please check the block ID and ensure it is active."
        )

    farm_id_str = block.get("farmId")
    if not farm_id_str:
        raise ValueError(f"Block '{block_id}' has no farmId — cannot connect to SenseHub.")

    try:
        client = await SenseHubConnectionService.get_client(
            UUID(farm_id_str), UUID(block_id)
        )
        return client
    except HTTPException as exc:
        # Raise as ValueError so calling code can return a friendly error dict
        raise ValueError(exc.detail) from exc


async def _cache_fallback_equipment(block_id: str) -> Optional[Dict]:
    """Serve get_equipment_list from cache when SenseHub is unreachable."""
    try:
        equipment = await SenseHubCacheQueryService.get_equipment_as_list(block_id)
        if equipment:
            return {"equipment": equipment, "count": len(equipment), "_cached": True}
    except Exception as exc:
        logger.debug("Equipment cache fallback failed: %s", exc)
    return None


async def _cache_fallback_alerts(
    block_id: str, severity: Optional[str]
) -> Optional[Dict]:
    """Serve get_alerts from cache when SenseHub is unreachable."""
    try:
        alerts = await SenseHubCacheQueryService.get_alerts_as_list(
            block_id, severity=severity
        )
        if alerts:
            return {"alerts": alerts, "count": len(alerts), "_cached": True}
    except Exception as exc:
        logger.debug("Alerts cache fallback failed: %s", exc)
    return None


def _is_network_error(exc: Exception) -> bool:
    """Return True for transient SenseHub connectivity errors."""
    return isinstance(
        exc, (httpx.ConnectError, httpx.TimeoutException, ConnectionError, OSError)
    )


async def execute_tool(
    tool_name: str,
    tool_input: Dict[str, Any],
    user_id: str,
    user_role: str,
    conversation_history: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Dispatch a Claude tool-use call and return the result.

    Args:
        tool_name:            Name of the tool to execute.
        tool_input:           Parameters dict from Claude's tool_use block.
        user_id:              Authenticated user ID (needed by query_mongodb).
        user_role:            User role string (needed by QueryValidator).
        conversation_history: Prior turns for query_mongodb context (optional).

    Returns:
        Dict with tool execution result, suitable for a tool_result message.

    Raises:
        ValueError: If tool_name is not in the allowed read-only set.
    """
    if tool_name not in _READ_TOOLS:
        # Reason: Hard-block any attempt to call write tools from this executor.
        raise ValueError(
            f"Tool '{tool_name}' is not available. "
            "Only read-only tools are permitted in the AI assistant."
        )

    logger.debug("Executing tool: %s | input keys: %s", tool_name, list(tool_input.keys()))

    # ------------------------------------------------------------------
    # query_mongodb — delegates to the existing ai_analytics QueryEngine
    # ------------------------------------------------------------------
    if tool_name == "query_mongodb":
        return await _execute_query_mongodb(
            tool_input, user_id, user_role, conversation_history or []
        )

    # ------------------------------------------------------------------
    # SenseHub tools
    # ------------------------------------------------------------------
    block_id: Optional[str] = tool_input.get("block_id")

    if tool_name == "get_equipment_list":
        return await _execute_get_equipment_list(block_id)

    if tool_name == "get_sensor_readings":
        equipment_id = tool_input.get("equipment_id")
        limit = int(tool_input.get("limit", 10))
        return await _execute_get_sensor_readings(block_id, equipment_id, limit)

    if tool_name == "get_alerts":
        severity = tool_input.get("severity")
        return await _execute_get_alerts(block_id, severity)

    if tool_name == "get_automations":
        return await _execute_get_automations(block_id)

    if tool_name == "get_lab_readings":
        limit = int(tool_input.get("limit", 10))
        return await _execute_get_lab_readings(block_id, limit)

    if tool_name == "get_lab_latest":
        return await _execute_get_lab_latest(block_id)

    # Should never reach here given the frozenset guard above.
    return {"error": f"Unhandled tool: {tool_name}"}


# ---------------------------------------------------------------------------
# Individual tool implementations
# ---------------------------------------------------------------------------


async def _execute_query_mongodb(
    tool_input: Dict[str, Any],
    user_id: str,
    user_role: str,
    conversation_history: list,
) -> Dict[str, Any]:
    """
    Wrap the ai_analytics QueryEngine.execute_ai_query() pipeline.

    The QueryEngine handles NL→MongoDB query generation via Gemini, validates
    the query with QueryValidator, executes it, and returns a formatted result.
    We re-use this entire pipeline intact — including the 30-min in-memory cache.

    Args:
        tool_input:           Must contain 'question' key.
        user_id:              Passed to the engine for cache key and cost tracking.
        user_role:            Passed to QueryValidator for permission checks.
        conversation_history: Prior turns for multi-turn context.

    Returns:
        Dict with 'result', 'query_used', 'records_count' keys on success.
    """
    from src.modules.ai_analytics.services.query_engine import get_query_engine

    question = tool_input.get("question", "").strip()
    if not question:
        return {"error": "question parameter is required for query_mongodb"}

    try:
        # get_query_engine is sync and needs the motor client + db name.
        # MongoDBManager.client is populated at app startup; settings holds the db name.
        engine = get_query_engine(
            mongodb_client=MongoDBManager.client,
            db_name=settings.MONGODB_DB_NAME,
        )
        result = await engine.execute_ai_query(
            user_prompt=question,
            user_id=user_id,
            user_role=user_role,
            conversation_history=conversation_history,
        )
        return result
    except Exception as exc:
        logger.warning("query_mongodb failed: %s", exc)
        return {"error": f"Database query failed: {str(exc)}"}


async def _execute_get_equipment_list(block_id: Optional[str]) -> Dict[str, Any]:
    """
    Retrieve equipment list from SenseHub.

    Args:
        block_id: UUID of the farm block (required).

    Returns:
        Dict with 'equipment' list and 'count'.
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}
        equipment = await client.get_equipment()
        return {"equipment": equipment, "count": len(equipment)}
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        if _is_network_error(exc):
            logger.warning("SenseHub unreachable for get_equipment_list: %s", exc)
            fallback = await _cache_fallback_equipment(block_id or "")
            if fallback:
                return fallback
        logger.error("get_equipment_list failed: %s", exc)
        return {"error": f"Could not retrieve equipment list: {str(exc)}"}


async def _execute_get_sensor_readings(
    block_id: Optional[str],
    equipment_id: Any,
    limit: int,
) -> Dict[str, Any]:
    """
    Retrieve sensor reading history for a specific equipment item.

    Args:
        block_id:     UUID of the farm block.
        equipment_id: Numeric equipment ID.
        limit:        Max number of historical readings to return.

    Returns:
        Dict with 'equipment_id', 'readings', 'count', optionally 'latest_reading'.
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}

        eq_id = int(equipment_id)
        readings = await client.get_equipment_history(eq_id, limit=min(limit, 100))

        # Reason: Always include the latest snapshot from the equipment object —
        # the /history endpoint may be empty on fresh SenseHub instances.
        latest_reading = None
        try:
            all_equipment = await client.get_equipment()
            for eq in all_equipment:
                eid = eq.get("id") or eq.get("equipment_id")
                if eid is not None and int(eid) == eq_id:
                    latest_reading = eq.get("last_reading") or eq.get("lastReading")
                    break
        except Exception:
            pass

        result: Dict[str, Any] = {
            "equipment_id": eq_id,
            "readings": readings,
            "count": len(readings),
        }
        if latest_reading is not None:
            result["latest_reading"] = latest_reading
        return result

    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("get_sensor_readings failed: %s", exc)
        return {"error": f"Could not retrieve sensor readings: {str(exc)}"}


async def _execute_get_alerts(
    block_id: Optional[str],
    severity: Optional[str],
) -> Dict[str, Any]:
    """
    Retrieve active alerts from SenseHub.

    Args:
        block_id: UUID of the farm block (required).
        severity: Optional filter — 'critical', 'warning', or 'info'.

    Returns:
        Dict with 'alerts' list and 'count'.
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}
        alerts = await client.get_alerts(severity=severity)
        return {"alerts": alerts, "count": len(alerts)}
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        if _is_network_error(exc):
            logger.warning("SenseHub unreachable for get_alerts: %s", exc)
            fallback = await _cache_fallback_alerts(block_id or "", severity)
            if fallback:
                return fallback
        logger.error("get_alerts failed: %s", exc)
        return {"error": f"Could not retrieve alerts: {str(exc)}"}


async def _execute_get_automations(block_id: Optional[str]) -> Dict[str, Any]:
    """
    Retrieve configured automations from SenseHub.

    Args:
        block_id: UUID of the farm block (required).

    Returns:
        Dict with 'automations' list and 'count'.
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}
        automations = await client.get_automations()
        return {"automations": automations, "count": len(automations)}
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("get_automations failed: %s", exc)
        return {"error": f"Could not retrieve automations: {str(exc)}"}


async def _execute_get_lab_readings(
    block_id: Optional[str], limit: int
) -> Dict[str, Any]:
    """
    Retrieve lab/nutrient measurement history from SenseHub.

    SenseHub exposes lab readings at GET /api/lab/readings.
    If the endpoint is not available, returns an informative message.

    Args:
        block_id: UUID of the farm block (required).
        limit:    Max readings to return.

    Returns:
        Dict with 'readings' list and 'count'.
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}
        # Reason: SenseHub lab endpoint — use the internal _request helper
        # since get_lab_readings is not a named method on SenseHubClient yet.
        data = await client._request(
            "GET", "/api/lab/readings", params={"limit": min(limit, 100)}
        )
        readings = data if isinstance(data, list) else data.get("readings", data.get("data", []))
        return {"readings": readings, "count": len(readings)}
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("get_lab_readings failed: %s", exc)
        return {
            "error": f"Lab readings unavailable: {str(exc)}",
            "note": "Lab measurement endpoints may not be configured on this SenseHub.",
        }


async def _execute_get_lab_latest(block_id: Optional[str]) -> Dict[str, Any]:
    """
    Retrieve the most recent lab/nutrient measurement from SenseHub.

    Args:
        block_id: UUID of the farm block (required).

    Returns:
        Dict with 'reading' (single measurement object).
    """
    try:
        client = await _get_sensehub_client(block_id)
        if client is None:
            return {"error": "No SenseHub device is connected to this block."}
        data = await client._request("GET", "/api/lab/latest")
        return {"reading": data}
    except ValueError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        logger.error("get_lab_latest failed: %s", exc)
        return {
            "error": f"Latest lab reading unavailable: {str(exc)}",
            "note": "Lab measurement endpoints may not be configured on this SenseHub.",
        }
