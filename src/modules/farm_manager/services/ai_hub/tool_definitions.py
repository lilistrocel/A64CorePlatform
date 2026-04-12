"""
AI Hub Service - Tool Definitions

Aggregates tools from global_ai and farm_level_ai into unified tool sets
for each Hub section. The Control section receives the full set including
write tools; all other sections receive read-only tools.

Key design decisions:
- De-duplicate tools with identical names (prefer global_ai version for
  tools that exist in both, since global tools use farm_name + block_code
  which is appropriate for the platform-wide Hub scope).
- Write tools from farm_level_ai are adapted to include a ``farm_name``
  parameter so the AI can target any farm's block from a single assistant.
- WRITE_TOOL_NAMES is exported for the service layer to route write tool
  calls through the confirmation flow.
"""

from vertexai.generative_models import FunctionDeclaration, Tool

from ..global_ai.tool_definitions import GLOBAL_READ_TOOLS
from ..farm_level_ai.tool_definitions import READ_TOOLS as FARM_LEVEL_READ_TOOLS
from ..farm_level_ai.tool_definitions import WRITE_TOOLS as FARM_LEVEL_WRITE_TOOLS

# ---------------------------------------------------------------------------
# Build the read tool set (global + farm-level, de-duplicated)
# ---------------------------------------------------------------------------

# Collect names already in the global set so we can skip duplicates
_global_tool_names: set[str] = {t["name"] for t in GLOBAL_READ_TOOLS}

# Include farm-level read tools that are NOT already covered by global tools.
# The global tools identify blocks by (farm_name, block_code) which is the
# correct pattern for a platform-wide assistant.  Farm-level tools that also
# exist globally (e.g. "web_search") are skipped to avoid sending duplicate
# declarations to Gemini, which would cause a validation error.
_deduped_farm_read_tools = [
    t for t in FARM_LEVEL_READ_TOOLS if t["name"] not in _global_tool_names
]

# Combined read-only tool list for Monitor, Report, and Advise sections
HUB_READ_TOOLS = GLOBAL_READ_TOOLS + _deduped_farm_read_tools

# ---------------------------------------------------------------------------
# Build hub-adapted write tools (farm_name added as a required parameter)
# ---------------------------------------------------------------------------

HUB_WRITE_TOOLS: list[dict] = []

for _tool in FARM_LEVEL_WRITE_TOOLS:
    # Deep-copy the tool dict and its input_schema
    _hub_tool: dict = dict(_tool)
    _hub_tool["input_schema"] = dict(_tool["input_schema"])
    _hub_tool["input_schema"]["properties"] = {
        "farm_name": {
            "type": "string",
            "description": (
                "The name of the farm that contains the target block "
                "(case-insensitive). Use get_all_farms to list available farms."
            ),
        },
        **_tool["input_schema"]["properties"],
    }
    _hub_tool["input_schema"]["required"] = [
        "farm_name"
    ] + list(_tool["input_schema"].get("required", []))

    # Update description to clarify the hub context
    _hub_tool["description"] = (
        _tool["description"].rstrip()
        + " Use farm_name + block_code to target the correct block "
        "across any farm in the platform."
    )

    HUB_WRITE_TOOLS.append(_hub_tool)

# Set of write tool names for O(1) lookup during the tool-use loop
WRITE_TOOL_NAMES: set[str] = {t["name"] for t in HUB_WRITE_TOOLS}

# Set of global read tool names for routing to the global executor
GLOBAL_TOOL_NAMES: set[str] = {t["name"] for t in GLOBAL_READ_TOOLS}


def get_gemini_tools(section: str) -> list[Tool]:
    """
    Return the Gemini Tool list appropriate for the requested Hub section.

    Control section: read tools + hub-adapted write tools (farm_name param).
    All other sections: read-only tools (global + farm-level de-duplicated).

    Args:
        section: One of "control", "monitor", "report", "advise".

    Returns:
        A single-element list containing one Tool with all selected
        function declarations.

    Raises:
        Nothing — unknown sections fall back to read-only tools.
    """
    if section == "control":
        tools_to_use = HUB_READ_TOOLS + HUB_WRITE_TOOLS
    else:
        tools_to_use = HUB_READ_TOOLS

    declarations = [
        FunctionDeclaration(
            name=tool_def["name"],
            description=tool_def["description"],
            parameters=tool_def["input_schema"],
        )
        for tool_def in tools_to_use
    ]
    return [Tool(function_declarations=declarations)]
