"""
Farm AI Chat - Tool Executor

Maps Gemini tool_use calls to SenseHubClient methods and web search.
Handles both read (immediate execution) and write (returns data for pending action).
"""

import logging
from typing import Any, Optional

import httpx
from vertexai.generative_models import GenerationConfig, GenerativeModel

from src.config.settings import settings
from ..sensehub import SenseHubClient
from ..sensehub.cache_query_service import SenseHubCacheQueryService
from .tool_definitions import get_google_search_tool

logger = logging.getLogger(__name__)


async def _try_cache_fallback(
    tool_name: str,
    tool_input: dict,
    block_id: Optional[str] = None,
) -> Optional[dict]:
    """
    Attempt to serve a read tool result from the SenseHub cache.
    Returns None if no cached data is available.
    """
    if not block_id:
        return None

    try:
        if tool_name == "get_equipment_list":
            equipment = await SenseHubCacheQueryService.get_equipment_as_list(block_id)
            if equipment:
                return {"equipment": equipment, "count": len(equipment), "_cached": True}

        elif tool_name == "get_alerts":
            severity = tool_input.get("severity")
            alerts = await SenseHubCacheQueryService.get_alerts_as_list(block_id, severity=severity)
            if alerts:
                return {"alerts": alerts, "count": len(alerts), "_cached": True}

        elif tool_name == "get_sensor_readings":
            # Fall back to cached equipment list for latest readings
            equipment = await SenseHubCacheQueryService.get_equipment_as_list(block_id)
            equipment_id = int(tool_input.get("equipment_id", 0))
            for eq in equipment:
                eq_id = eq.get("id")
                if eq_id is not None and int(eq_id) == equipment_id:
                    return {
                        "equipment_id": equipment_id,
                        "readings": [],
                        "count": 0,
                        "latest_reading": eq.get("last_reading"),
                        "_cached": True,
                    }

    except Exception as exc:
        logger.debug(f"Cache fallback failed for {tool_name}: {exc}")

    return None


async def execute_read_tool(
    client: SenseHubClient,
    tool_name: str,
    tool_input: dict,
    block_id: Optional[str] = None,
) -> dict:
    """
    Execute a read-only tool and return the result.
    Falls back to cached data on SenseHub connection errors.

    Args:
        client: Authenticated SenseHubClient
        tool_name: Name of the tool to execute
        tool_input: Tool input parameters from Claude
        block_id: Optional block ID for cache fallback

    Returns:
        Tool execution result as a dict

    Raises:
        ValueError: If tool_name is not a valid read tool
    """
    try:
        if tool_name == "get_equipment_list":
            equipment = await client.get_equipment()
            return {"equipment": equipment, "count": len(equipment)}

        elif tool_name == "get_sensor_readings":
            # Gemini returns numbers as floats; cast to int for URL path
            equipment_id = int(tool_input["equipment_id"])
            limit = int(tool_input.get("limit", 10))

            # Try historical readings first
            readings = await client.get_equipment_history(
                equipment_id, limit=limit
            )

            # Always fetch the equipment's latest reading as well.
            # The /history endpoint may be empty on fresh SenseHub instances,
            # but the equipment object carries a `last_reading` with current values.
            latest_reading = None
            try:
                all_equipment = await client.get_equipment()
                for eq in all_equipment:
                    eq_id = eq.get("id") or eq.get("equipment_id")
                    if eq_id is not None and int(eq_id) == equipment_id:
                        latest_reading = eq.get("last_reading") or eq.get("lastReading")
                        break
            except Exception as e:
                logger.debug(f"Could not fetch latest reading for equipment {equipment_id}: {e}")

            result = {
                "equipment_id": equipment_id,
                "readings": readings,
                "count": len(readings),
            }
            if latest_reading is not None:
                result["latest_reading"] = latest_reading
            return result

        elif tool_name == "get_automations":
            automations = await client.get_automations()
            return {"automations": automations, "count": len(automations)}

        elif tool_name == "get_alerts":
            severity = tool_input.get("severity")
            alerts = await client.get_alerts(severity=severity)
            return {"alerts": alerts, "count": len(alerts)}

        elif tool_name == "get_system_status":
            health = await client.health_check()
            system_info = await client.get_system_info()
            return {"health": health, "system_info": system_info}

        elif tool_name == "web_search":
            query = tool_input.get("query", "")
            return await execute_web_search(query)

        else:
            raise ValueError(f"Unknown read tool: {tool_name}")

    except Exception as e:
        # On connection errors, try cache fallback before returning error
        if isinstance(e, (httpx.ConnectError, httpx.TimeoutException, ConnectionError, OSError)):
            logger.warning(f"SenseHub unreachable for {tool_name}, trying cache: {e}")
            cached = await _try_cache_fallback(tool_name, tool_input, block_id)
            if cached:
                return cached

        logger.error(f"Tool execution failed: {tool_name} - {e}")
        return {"error": str(e)}


async def execute_write_tool(
    client: SenseHubClient,
    tool_name: str,
    tool_input: dict,
) -> dict:
    """
    Execute a confirmed write tool.

    Args:
        client: Authenticated SenseHubClient
        tool_name: Name of the write tool
        tool_input: Tool input parameters

    Returns:
        Execution result

    Raises:
        ValueError: If tool_name is not a valid write tool
    """
    try:
        if tool_name == "control_relay":
            result = await client.control_relay(
                equipment_id=int(tool_input["equipment_id"]),
                channel=int(tool_input["channel"]),
                state=bool(tool_input["state"]),
            )
            state_str = "ON" if tool_input["state"] else "OFF"
            return {
                "success": True,
                "message": f"Relay channel {tool_input['channel']} on equipment {tool_input['equipment_id']} turned {state_str}",
                "result": result,
            }

        elif tool_name == "trigger_automation":
            result = await client.trigger_automation(
                automation_id=int(tool_input["automation_id"])
            )
            return {
                "success": True,
                "message": f"Automation {tool_input['automation_id']} triggered",
                "result": result,
            }

        elif tool_name == "toggle_automation":
            result = await client.toggle_automation(
                automation_id=int(tool_input["automation_id"])
            )
            return {
                "success": True,
                "message": f"Automation {tool_input['automation_id']} toggled",
                "result": result,
            }

        elif tool_name == "create_automation":
            # Build the automation payload forwarded to SenseHub.
            # Reason: Pull recognised fields explicitly; include any extra fields
            # the caller provided so schedule sub-fields are preserved verbatim.
            automation_data: dict = {
                "name": tool_input["name"],
                "equipment_id": int(tool_input["equipment_id"]),
                "channel": int(tool_input["channel"]),
                "schedule": tool_input["schedule"],
            }
            result = await client.create_automation(automation_data)
            return {
                "success": True,
                "message": f"Automation '{tool_input['name']}' created successfully",
                "result": result,
            }

        elif tool_name == "update_automation":
            result = await client.update_automation(
                automation_id=int(tool_input["automation_id"]),
                automation_data=tool_input["updates"],
            )
            return {
                "success": True,
                "message": (
                    f"Automation {tool_input['automation_id']} updated successfully"
                ),
                "result": result,
            }

        elif tool_name == "delete_automation":
            result = await client.delete_automation(
                automation_id=int(tool_input["automation_id"])
            )
            return {
                "success": True,
                "message": (
                    f"Automation {tool_input['automation_id']} deleted permanently"
                ),
                "result": result,
            }

        else:
            raise ValueError(f"Unknown write tool: {tool_name}")

    except Exception as e:
        logger.error(f"Write tool execution failed: {tool_name} - {e}")
        return {"success": False, "error": str(e)}


def describe_write_action(tool_name: str, tool_input: dict) -> tuple[str, str]:
    """
    Generate a human-readable description and risk level for a write action.

    Returns:
        (description, risk_level)
    """
    if tool_name == "control_relay":
        state_str = "ON" if tool_input.get("state") else "OFF"
        desc = (
            f"Turn {state_str} relay channel {tool_input.get('channel', '?')} "
            f"on equipment #{tool_input.get('equipment_id', '?')}"
        )
        return desc, "medium"

    elif tool_name == "trigger_automation":
        desc = f"Trigger automation #{tool_input.get('automation_id', '?')} to run once"
        return desc, "medium"

    elif tool_name == "toggle_automation":
        desc = f"Toggle automation #{tool_input.get('automation_id', '?')} enabled/disabled"
        return desc, "medium"

    elif tool_name == "create_automation":
        desc = (
            f"Create new automation '{tool_input.get('name', '?')}' on equipment "
            f"#{tool_input.get('equipment_id', '?')} channel {tool_input.get('channel', '?')}"
        )
        return desc, "high"

    elif tool_name == "update_automation":
        desc = (
            f"Update automation #{tool_input.get('automation_id', '?')} "
            f"with: {list(tool_input.get('updates', {}).keys())}"
        )
        return desc, "high"

    elif tool_name == "delete_automation":
        desc = (
            f"PERMANENTLY DELETE automation #{tool_input.get('automation_id', '?')}"
        )
        return desc, "high"

    return f"Execute {tool_name}", "high"


async def execute_web_search(query: str) -> dict:
    """
    Execute a web search by making a separate Gemini API call with
    Google Search grounding enabled.

    This allows the main chat (which uses function-calling tools) to
    access web search results without mixing tool types in one request.

    Args:
        query: The search query string.

    Returns:
        Dict with search_results text and source URLs.
    """
    try:
        search_model = GenerativeModel(
            settings.VERTEX_AI_MODEL,
            system_instruction=(
                "You are a research assistant. Answer the query using the search "
                "results provided by Google Search grounding. Include specific "
                "numbers, ranges, and standards where available. Cite sources."
            ),
        )

        response = await search_model.generate_content_async(
            query,
            generation_config=GenerationConfig(
                max_output_tokens=1024,
                temperature=0.1,
            ),
            tools=get_google_search_tool(),
        )

        # Extract text from response
        text = ""
        for part in response.candidates[0].content.parts:
            if part.text:
                text += part.text

        # Extract grounding sources if available
        sources = []
        grounding = getattr(response.candidates[0], "grounding_metadata", None)
        if grounding:
            for chunk in getattr(grounding, "grounding_chunks", []):
                web = getattr(chunk, "web", None)
                if web:
                    sources.append({
                        "title": getattr(web, "title", ""),
                        "url": getattr(web, "uri", ""),
                    })

        return {
            "search_results": text or "No results found.",
            "sources": sources,
            "query": query,
        }

    except Exception as e:
        logger.error(f"Web search failed for query '{query}': {e}")
        return {
            "error": f"Web search failed: {str(e)}",
            "query": query,
        }
