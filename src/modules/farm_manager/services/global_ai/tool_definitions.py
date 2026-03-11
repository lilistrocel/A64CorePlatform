"""
Global AI Chat - Tool Definitions

Defines the read-only tool schemas for the Gemini function-calling API.
All tools operate at the global level and identify farms by name rather
than by ID, because users think in names.

NO write tools are defined here. The global monitoring assistant is
strictly read-only — equipment control is delegated to the block-level
assistant which has the appropriate confirmation flow.
"""

from vertexai.generative_models import FunctionDeclaration, Tool

# Reason: Reuse the shared Google Search grounding tool helper.
from ..farm_ai.tool_definitions import get_google_search_tool  # noqa: F401 (re-exported)

# All tools for the global monitoring assistant (read-only)
GLOBAL_READ_TOOLS = [
    {
        "name": "get_all_farms",
        "description": (
            "Get a live summary of all farms in the platform, including their name, "
            "location, total block count, and number of SenseHub-connected blocks. "
            "Use this to answer questions like 'how many farms do we have?', "
            "'which farms have sensors connected?', or to get an overall view of "
            "the operation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_farm_blocks",
        "description": (
            "Get all active blocks for a specific farm, identified by name. "
            "Returns each block's code, type, state (growing/harvesting/empty/etc.), "
            "current crop, plant count, area, and whether it has SenseHub connected. "
            "Use this to drill into a particular farm after using get_all_farms."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "farm_name": {
                    "type": "string",
                    "description": (
                        "The name of the farm (case-insensitive). "
                        "E.g. 'Green Valley Farm' or 'Al Khawaneej'."
                    ),
                },
            },
            "required": ["farm_name"],
        },
    },
    {
        "name": "get_block_equipment_list",
        "description": (
            "Get the list of SenseHub equipment (sensors and relays) for a specific "
            "block, identified by farm name and block code. Returns each device's ID, "
            "name, type, zone, online/offline status, and latest readings. "
            "Use this before calling get_block_sensors to find equipment IDs."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "farm_name": {
                    "type": "string",
                    "description": "The name of the farm (case-insensitive).",
                },
                "block_code": {
                    "type": "string",
                    "description": (
                        "The block code as shown in the farm dashboard. "
                        "E.g. 'A1', 'B2', or 'GH-01'."
                    ),
                },
            },
            "required": ["farm_name", "block_code"],
        },
    },
    {
        "name": "get_block_sensors",
        "description": (
            "Get sensor readings for a specific equipment device in a block. "
            "Returns the latest reading (current values) and historical readings. "
            "Use get_block_equipment_list first to find the correct equipment_id. "
            "Sensor types include temperature, humidity, pH, EC, light, soil moisture, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "farm_name": {
                    "type": "string",
                    "description": "The name of the farm (case-insensitive).",
                },
                "block_code": {
                    "type": "string",
                    "description": "The block code. E.g. 'A1', 'GH-01'.",
                },
                "equipment_id": {
                    "type": "integer",
                    "description": "The SenseHub equipment ID (from get_block_equipment_list).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of historical readings to return (default 10).",
                },
            },
            "required": ["farm_name", "block_code", "equipment_id"],
        },
    },
    {
        "name": "get_farm_alerts",
        "description": (
            "Get active alerts from all SenseHub-connected blocks on a specific farm. "
            "Returns alert severity (critical/warning/info), equipment name, zone, "
            "and acknowledgement status. Use this to check for problems on a farm."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "farm_name": {
                    "type": "string",
                    "description": "The name of the farm (case-insensitive).",
                },
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "Filter by severity level (optional).",
                },
            },
            "required": ["farm_name"],
        },
    },
    {
        "name": "get_all_alerts",
        "description": (
            "Get active alerts across ALL farms and ALL SenseHub-connected blocks. "
            "Returns each alert grouped by farm and block so you can pinpoint issues. "
            "Use this for a platform-wide health check or when the user asks "
            "'are there any alerts anywhere?' or 'show me all critical alerts'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "Filter by severity level (optional).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "web_search",
        "description": (
            "Search the web for agricultural information, international standards, "
            "best practices, and reference data. Use this when the user asks about "
            "optimal ranges, international crop standards, pest/disease identification, "
            "NPK/EC benchmarks, or any external knowledge not available in the sensor "
            "data or your training data. Returns a text summary with source references."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": (
                        "The search query. Be specific and include crop name, "
                        "e.g. 'optimal EC range for capsicum greenhouse cultivation'."
                    ),
                },
            },
            "required": ["query"],
        },
    },
]


def get_gemini_tools() -> list[Tool]:
    """
    Convert GLOBAL_READ_TOOLS definitions to a Gemini-compatible Tool list.

    All tools are read-only. No write tools are included. The returned list
    contains a single Tool with all function declarations.

    Returns:
        A single-element list containing one Tool with all function declarations.
    """
    declarations = []
    for tool_def in GLOBAL_READ_TOOLS:
        declarations.append(
            FunctionDeclaration(
                name=tool_def["name"],
                description=tool_def["description"],
                parameters=tool_def["input_schema"],
            )
        )
    return [Tool(function_declarations=declarations)]
