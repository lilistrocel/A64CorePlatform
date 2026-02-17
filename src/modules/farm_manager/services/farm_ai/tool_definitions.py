"""
Farm AI Chat - Tool Definitions

Defines the tool schemas for the Gemini function-calling API.
Tools are split into READ (execute freely) and WRITE (require confirmation).

Each tool dict uses an ``input_schema`` key internally (retained for
backward-compatibility with tool_executor.py).  The ``get_gemini_tools``
helper converts them into the ``vertexai.generative_models.Tool`` format
expected by Gemini.
"""

from google.cloud.aiplatform_v1beta1 import types as aiplatform_types
from vertexai.generative_models import FunctionDeclaration, Tool

# Tools that execute without user confirmation
READ_TOOLS = [
    {
        "name": "get_equipment_list",
        "description": (
            "Get a list of all SenseHub equipment (sensors and relays) with their "
            "current status (online/offline), type, zone, and latest readings. "
            "Use this to answer questions about what sensors are available, which "
            "devices are online, or to get an overview of the hardware."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_sensor_readings",
        "description": (
            "Get sensor readings for a specific equipment ID. "
            "Returns the latest reading (current values) and historical readings. "
            "Sensor types include temperature, humidity, pH, EC, light, soil moisture, etc. "
            "The 'latest_reading' field always has the most recent values even if history is empty. "
            "Use 'limit' to control how many historical readings to fetch. "
            "Use this to answer questions about current conditions or trends."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "equipment_id": {
                    "type": "integer",
                    "description": "The SenseHub equipment ID to read from",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of historical readings (default 10)",
                },
            },
            "required": ["equipment_id"],
        },
    },
    {
        "name": "get_automations",
        "description": (
            "Get all configured automation programs on SenseHub. "
            "Returns name, description, enabled status, priority, run count, "
            "and last run time. Use this to find automations by name or check "
            "which automations are active."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_alerts",
        "description": (
            "Get active alerts from SenseHub with severity (critical/warning/info), "
            "equipment name, zone, and acknowledgement status. "
            "Use this to check for problems or answer 'are there any alerts?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "Filter by severity level (optional)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_system_status",
        "description": (
            "Get SenseHub system health and info including uptime, version, "
            "CPU/memory usage, and connectivity status. "
            "Use this to diagnose system issues or check if SenseHub is healthy."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
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
                        "e.g. 'optimal EC range for capsicum greenhouse cultivation'"
                    ),
                },
            },
            "required": ["query"],
        },
    },
]

# Tools that require user confirmation before execution
WRITE_TOOLS = [
    {
        "name": "control_relay",
        "description": (
            "Turn a relay channel ON or OFF on a specific equipment. "
            "Relays control physical devices like pumps, fans, lights, valves. "
            "This is a WRITE action - the user will be asked to confirm."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "equipment_id": {
                    "type": "integer",
                    "description": "The relay equipment ID",
                },
                "channel": {
                    "type": "integer",
                    "description": "The relay channel number (0-based)",
                },
                "state": {
                    "type": "boolean",
                    "description": "True to turn ON, False to turn OFF",
                },
            },
            "required": ["equipment_id", "channel", "state"],
        },
    },
    {
        "name": "trigger_automation",
        "description": (
            "Manually trigger an automation program to run once immediately. "
            "The automation must be enabled. "
            "This is a WRITE action - the user will be asked to confirm."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to trigger",
                },
            },
            "required": ["automation_id"],
        },
    },
    {
        "name": "toggle_automation",
        "description": (
            "Enable or disable an automation program. "
            "If currently enabled, it will be disabled and vice versa. "
            "This is a WRITE action - the user will be asked to confirm."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to toggle",
                },
            },
            "required": ["automation_id"],
        },
    },
]

# Set of write tool names for quick lookup
WRITE_TOOL_NAMES = {t["name"] for t in WRITE_TOOLS}

# All tools combined (order: reads first, then writes)
ALL_TOOLS = READ_TOOLS + WRITE_TOOLS


def get_gemini_tools() -> list[Tool]:
    """
    Convert ALL_TOOLS definitions to a Gemini-compatible Tool list.

    Includes SenseHub function tools (read/write) plus a web_search tool
    for looking up agricultural standards and external reference data.

    Returns:
        A single-element list containing one ``Tool`` with all function
        declarations.
    """
    declarations = []
    for tool_def in ALL_TOOLS:
        declarations.append(
            FunctionDeclaration(
                name=tool_def["name"],
                description=tool_def["description"],
                parameters=tool_def["input_schema"],
            )
        )
    return [Tool(function_declarations=declarations)]


def get_google_search_tool() -> list[Tool]:
    """
    Return a Google Search grounding tool for Gemini.

    Used internally by the web_search function executor to make a separate
    Gemini API call with web search grounding enabled.

    Returns:
        A single-element list containing the Google Search tool.
    """
    proto = aiplatform_types.Tool(
        google_search=aiplatform_types.Tool.GoogleSearch()
    )
    return [Tool._from_gapic(proto)]
