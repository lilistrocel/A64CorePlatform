"""
Farm-Level AI Chat - Tool Definitions

Defines farm-scoped tool schemas for the Gemini function-calling API.
All block-specific tools require a ``block_code`` parameter to target the
correct SenseHub instance.

READ tools execute immediately; WRITE tools require user confirmation.

Reuses ``get_google_search_tool`` from the block-level farm_ai module
to avoid duplication.
"""

from vertexai.generative_models import FunctionDeclaration, Tool

# Re-use the Google Search tool builder from the block-level module
from ..farm_ai.tool_definitions import get_google_search_tool  # noqa: F401

# ---------------------------------------------------------------------------
# READ tools — execute without user confirmation
# ---------------------------------------------------------------------------
READ_TOOLS = [
    {
        "name": "get_farm_overview",
        "description": (
            "Get a high-level overview of all active blocks on the farm. "
            "Returns each block's code, name, state, block type, crop name, "
            "plant count, and whether SenseHub is connected. "
            "Use this to answer general questions about the farm or to find out "
            "which blocks are available and what crops they grow."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_block_equipment",
        "description": (
            "Get a list of all SenseHub equipment (sensors and relays) for a "
            "specific block, including their current status, type, zone, and latest "
            "readings. Specify the block using its block_code (e.g. 'BLK-001'). "
            "Use this to find out what hardware is installed in a particular block."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": (
                        "The block code of the target block (e.g. 'BLK-001')"
                    ),
                },
            },
            "required": ["block_code"],
        },
    },
    {
        "name": "get_block_sensor_readings",
        "description": (
            "Get sensor readings for a specific equipment in a specific block. "
            "Returns the latest reading and historical readings. "
            "Specify the block with block_code and the equipment with equipment_id. "
            "Use limit to control how many historical readings to return. "
            "Use this to check current conditions or trends in a block."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "equipment_id": {
                    "type": "integer",
                    "description": "The SenseHub equipment ID to read from",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of historical readings to return (default 10)",
                },
            },
            "required": ["block_code", "equipment_id"],
        },
    },
    {
        "name": "get_block_automations",
        "description": (
            "Get all configured automation programs on SenseHub for a specific block. "
            "Returns name, description, enabled status, priority, run count, and last "
            "run time. Specify the block with block_code. "
            "Use this to check which automations are active in a block."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
            },
            "required": ["block_code"],
        },
    },
    {
        "name": "get_block_alerts",
        "description": (
            "Get active SenseHub alerts for a specific block with severity "
            "(critical/warning/info), equipment name, zone, and acknowledgement status. "
            "Optionally filter by severity. Specify the block with block_code. "
            "Use this to check for problems in a particular block."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "severity": {
                    "type": "string",
                    "enum": ["critical", "warning", "info"],
                    "description": "Filter by severity level (optional)",
                },
            },
            "required": ["block_code"],
        },
    },
    {
        "name": "get_all_blocks_alerts",
        "description": (
            "Get active SenseHub alerts aggregated across ALL connected blocks on the farm. "
            "Each alert result includes the originating block_code. "
            "Optionally filter by severity. "
            "Use this when the user asks 'are there any alerts on the farm?' or "
            "'do any blocks have critical issues?'."
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
        "name": "get_block_system_status",
        "description": (
            "Get SenseHub system health and info for a specific block, including uptime, "
            "version, CPU/memory usage, and connectivity status. "
            "Specify the block with block_code. "
            "Use this to diagnose system issues or check SenseHub health for a block."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
            },
            "required": ["block_code"],
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

# ---------------------------------------------------------------------------
# WRITE tools — require user confirmation before execution
# ---------------------------------------------------------------------------
WRITE_TOOLS = [
    {
        "name": "control_block_relay",
        "description": (
            "Turn a relay channel ON or OFF on a specific block's SenseHub equipment. "
            "Relays control physical devices like pumps, fans, lights, valves. "
            "Specify the target block with block_code. "
            "This is a WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
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
            "required": ["block_code", "equipment_id", "channel", "state"],
        },
    },
    {
        "name": "trigger_block_automation",
        "description": (
            "Manually trigger an automation program to run once immediately on a "
            "specific block's SenseHub. The automation must be enabled. "
            "Specify the target block with block_code. "
            "This is a WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to trigger",
                },
            },
            "required": ["block_code", "automation_id"],
        },
    },
    {
        "name": "toggle_block_automation",
        "description": (
            "Enable or disable an automation program on a specific block's SenseHub. "
            "If currently enabled, it will be disabled and vice versa. "
            "Specify the target block with block_code. "
            "This is a WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to toggle",
                },
            },
            "required": ["block_code", "automation_id"],
        },
    },
    {
        "name": "create_block_automation",
        "description": (
            "Create a new automation program/schedule on a specific block's SenseHub. "
            "Can set up timed relay control, irrigation schedules, or any recurring "
            "equipment action. Requires a name, the equipment ID to automate, the relay "
            "channel to control, and a schedule configuration object. "
            "Specify the target block with block_code. "
            "This is a HIGH-RISK WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "name": {
                    "type": "string",
                    "description": (
                        "Human-readable name for the automation "
                        "(e.g. 'Morning Irrigation')"
                    ),
                },
                "equipment_id": {
                    "type": "integer",
                    "description": "The SenseHub equipment ID to automate",
                },
                "channel": {
                    "type": "integer",
                    "description": "The relay channel number to control (0-based)",
                },
                "schedule": {
                    "type": "object",
                    "description": (
                        "Schedule configuration object. Common fields: "
                        "type ('time' or 'interval'), start_time (HH:MM), "
                        "end_time (HH:MM), days (list of 0-6 for Sun-Sat), "
                        "duration_seconds (for interval type), "
                        "interval_seconds (for interval type). "
                        "Use get_block_automations first to see the schedule "
                        "format used by existing automations on this block."
                    ),
                },
            },
            "required": ["block_code", "name", "equipment_id", "channel", "schedule"],
        },
    },
    {
        "name": "update_block_automation",
        "description": (
            "Update an existing automation program's schedule, name, or enabled state "
            "on a specific block's SenseHub. Only the fields provided in 'updates' will "
            "be changed. Use get_block_automations first to retrieve the automation ID "
            "and current settings. "
            "Specify the target block with block_code. "
            "This is a HIGH-RISK WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to update",
                },
                "updates": {
                    "type": "object",
                    "description": (
                        "Fields to update on the automation. Any combination of: "
                        "name (string), enabled (boolean), schedule (object with "
                        "the same structure as used in create_block_automation)."
                    ),
                },
            },
            "required": ["block_code", "automation_id", "updates"],
        },
    },
    {
        "name": "delete_block_automation",
        "description": (
            "Permanently delete an automation program from a specific block's SenseHub. "
            "This action cannot be undone. "
            "Use get_block_automations first to confirm the correct automation_id. "
            "Specify the target block with block_code. "
            "This is a HIGH-RISK WRITE action - the user will be asked to confirm before execution."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "block_code": {
                    "type": "string",
                    "description": "The block code of the target block (e.g. 'BLK-001')",
                },
                "automation_id": {
                    "type": "integer",
                    "description": "The automation program ID to permanently delete",
                },
            },
            "required": ["block_code", "automation_id"],
        },
    },
]

# Set of write tool names for quick lookup during tool-use loop
WRITE_TOOL_NAMES: set[str] = {t["name"] for t in WRITE_TOOLS}

# All tools combined (reads first, then writes)
ALL_TOOLS = READ_TOOLS + WRITE_TOOLS


def get_gemini_tools(include_write: bool = True) -> list[Tool]:
    """
    Convert tool definitions to a Gemini-compatible Tool list.

    Args:
        include_write: When False, only READ tools are included.
                       Set to False when no block has SenseHub connected.

    Returns:
        A single-element list containing one Tool with all selected
        function declarations.
    """
    tools_to_use = ALL_TOOLS if include_write else READ_TOOLS
    declarations = [
        FunctionDeclaration(
            name=tool_def["name"],
            description=tool_def["description"],
            parameters=tool_def["input_schema"],
        )
        for tool_def in tools_to_use
    ]
    return [Tool(function_declarations=declarations)]
