"""
AI Assistant — Claude Tool Definitions (Phase B)

Defines the JSON-schema tool definitions passed to the Claude messages API.
All tools are READ-ONLY. Write/control actions are intentionally excluded —
SenseHub owns relay/automation control.

Tool inventory:
  query_mongodb     — NL→MongoDB query via the existing ai_analytics engine
  get_equipment_list  — SenseHub: list all equipment in a block
  get_sensor_readings — SenseHub: historical readings for one equipment item
  get_alerts          — SenseHub: active alerts, optional severity filter
  get_automations     — SenseHub: configured automations
  get_lab_readings    — SenseHub: lab/nutrient measurement history
  get_lab_latest      — SenseHub: most recent lab measurement

Prompt caching:
  `cache_control: {"type": "ephemeral"}` is placed on the LAST tool definition.
  Combined with the ephemeral cache on the system prompt, this caches both the
  system block and the full tool list in a single cache slot, giving ~90% cost
  reduction on turns 2+ of any conversation.
"""

from typing import Any, Dict, List


def get_tool_definitions() -> List[Dict[str, Any]]:
    """
    Return the list of Claude tool definitions for the AI assistant.

    The last definition includes `cache_control` to activate prompt caching
    for the entire tools block alongside the cached system prompt.

    Returns:
        List of tool definition dicts compatible with the Anthropic messages API.
    """
    tools: List[Dict[str, Any]] = [
        {
            "name": "query_mongodb",
            "description": (
                "Query the A64 Core Platform database using natural language. "
                "Use this tool when the user asks about historical data, "
                "aggregations, sales figures, harvest records, employee counts, "
                "crop yields, purchase orders, or any structured data stored in "
                "MongoDB. The query engine validates all operations for safety. "
                "Do NOT use this tool for real-time sensor readings — use "
                "get_sensor_readings instead."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "question": {
                        "type": "string",
                        "description": (
                            "Natural language question describing what data "
                            "to retrieve (e.g. 'total harvest yield for Farm A "
                            "in the last 30 days')."
                        ),
                    },
                },
                "required": ["question"],
            },
        },
        {
            "name": "get_equipment_list",
            "description": (
                "Retrieve the list of all equipment/sensors registered on a "
                "SenseHub device for a specific farm block. Returns equipment "
                "IDs, names, types, and current connection status. Call this "
                "first to discover equipment IDs before calling "
                "get_sensor_readings."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block_id": {
                        "type": "string",
                        "description": (
                            "UUID of the farm block whose SenseHub to query. "
                            "Required when the user specifies a particular block."
                        ),
                    },
                },
                "required": [],
            },
        },
        {
            "name": "get_sensor_readings",
            "description": (
                "Retrieve sensor reading history for a specific piece of "
                "equipment on a SenseHub device. Returns timestamped values "
                "such as temperature, humidity, EC, pH, CO2, and light levels. "
                "Also returns the latest reading snapshot."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "equipment_id": {
                        "type": "integer",
                        "description": "Numeric equipment ID obtained from get_equipment_list.",
                    },
                    "block_id": {
                        "type": "string",
                        "description": "UUID of the farm block (required to route to the right SenseHub).",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of historical readings to return (default 10, max 100).",
                        "default": 10,
                    },
                },
                "required": ["equipment_id", "block_id"],
            },
        },
        {
            "name": "get_alerts",
            "description": (
                "Retrieve active alerts from a SenseHub device. Returns alert "
                "details including severity, message, equipment, and timestamp. "
                "Use this when the user asks about problems, warnings, or "
                "anomalies in the farm environment."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block_id": {
                        "type": "string",
                        "description": "UUID of the farm block to check alerts for.",
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "warning", "info"],
                        "description": "Filter alerts by severity level (optional).",
                    },
                },
                "required": [],
            },
        },
        {
            "name": "get_automations",
            "description": (
                "Retrieve the list of configured automations on a SenseHub "
                "device. Returns automation names, schedules, enabled state, "
                "and associated equipment. Use this when the user asks about "
                "scheduled irrigation, ventilation routines, or any automated "
                "control programs."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block_id": {
                        "type": "string",
                        "description": "UUID of the farm block to query automations for.",
                    },
                },
                "required": [],
            },
        },
        {
            "name": "get_lab_readings",
            "description": (
                "Retrieve lab/nutrient measurement history from a SenseHub "
                "device. Returns measurements such as EC, pH, nitrate, "
                "potassium, and other nutrient levels recorded via manual or "
                "automated lab equipment. Use this when the user asks about "
                "nutrient levels, solution quality, or lab test history."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block_id": {
                        "type": "string",
                        "description": "UUID of the farm block to query lab readings for.",
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Number of readings to return (default 10, max 100).",
                        "default": 10,
                    },
                },
                "required": [],
            },
        },
        # Reason: cache_control on the LAST tool caches the entire tools array
        # alongside the system prompt in a single ephemeral cache slot.
        {
            "name": "get_lab_latest",
            "description": (
                "Retrieve only the most recent lab/nutrient measurement from a "
                "SenseHub device. Faster than get_lab_readings when the user "
                "just wants the current nutrient snapshot without history."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "block_id": {
                        "type": "string",
                        "description": "UUID of the farm block to query.",
                    },
                },
                "required": [],
            },
            "cache_control": {"type": "ephemeral"},
        },
    ]

    return tools
