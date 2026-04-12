"""
AI Hub Service - Context Builder

Builds section-specific system prompts for each of the four Hub personalities:
  - Control:  Full operations controller with read + write access to all farms.
  - Monitor:  Real-time statistics and alert monitoring (read-only).
  - Report:   Structured report generation at any level of detail (read-only).
  - Advise:   Agricultural advisory using sensor data + expert knowledge (read-only).

All sections share a platform-wide farm summary table loaded fresh from MongoDB.
"""

import logging
from datetime import datetime

from ..database import farm_db

logger = logging.getLogger(__name__)


async def _build_platform_farm_summary() -> str:
    """
    Load all active farms and produce a markdown-style summary table.

    Returns a multi-line string listing each farm with its location,
    block count, and number of SenseHub-connected blocks.

    Returns:
        Farm summary string to embed in system prompts.
    """
    db = farm_db.get_database()

    farms_cursor = db.farms.find({"isActive": True})
    farms = await farms_cursor.to_list(length=500)

    if not farms:
        return "  (No active farms found in the platform)"

    rows: list[str] = []
    total_blocks = 0
    total_connected = 0

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

        total_blocks += block_count
        total_connected += connected_count

        rows.append(
            f"  - {farm_name} | {location_str} | "
            f"{block_count} blocks | {connected_count} SenseHub-connected"
        )

    rows.append(
        f"\n  TOTALS: {len(farms)} farms | {total_blocks} blocks | "
        f"{total_connected} SenseHub-connected"
    )

    return "\n".join(rows)


async def build_hub_system_prompt(section: str) -> str:
    """
    Build the section-specific system prompt for the AI Hub assistant.

    Loads a live platform farm summary and combines it with the appropriate
    role description and tool instructions for the requested section.

    Args:
        section: One of "control", "monitor", "report", "advise".

    Returns:
        Complete system prompt string for the Gemini model.
    """
    farm_summary = await _build_platform_farm_summary()
    today = datetime.utcnow().strftime("%Y-%m-%d")

    # Shared platform context appended to every section's prompt
    platform_context = f"""
PLATFORM OVERVIEW (as of {today}):
{farm_summary}

TOOL USAGE INSTRUCTIONS:
- Use get_all_farms to see all farms and their block/connection counts.
- Use get_farm_blocks(farm_name) to list all blocks on a specific farm.
- Use get_block_equipment_list(farm_name, block_code) to see sensors/relays.
- Use get_block_sensors(farm_name, block_code, equipment_id) for live readings.
- Use get_farm_alerts(farm_name) or get_all_alerts() for active alerts.
- Use web_search for agricultural standards, benchmarks, and external data.
- Always identify farms by name, not ID. Names are case-insensitive.
- Today's date is {today}."""

    if section == "control":
        role_prompt = """You are the Operations Controller for A64 Core Platform.
Your PRIMARY purpose is to EXECUTE actions — control relays, manage automations, and modify equipment settings.
You have FULL CONTROL over all farms and blocks.

When a user asks you to do something:
1. First confirm what exactly they want to change (farm, block, equipment, action)
2. Use the appropriate tool to execute the action
3. All write actions require user confirmation before execution

You can also READ data to help users make control decisions, but your focus is ACTION.
If a user just wants to view data without changing anything, suggest the Monitor tab.
If they want reports, suggest the Report tab.
If they want farming advice, suggest the Advise tab.

Be precise, safety-conscious, and always confirm the exact target before executing.
Never execute multiple write actions in a single response — one action at a time."""
        control_instructions = """
CONTROL TOOL INSTRUCTIONS:
- control_block_relay(farm_name, block_code, equipment_id, channel, state): Turn a relay ON/OFF.
- trigger_block_automation(farm_name, block_code, automation_id): Run an automation once.
- toggle_block_automation(farm_name, block_code, automation_id): Enable/disable an automation.
- All write tools require user confirmation and will be held pending until approved.
- If the user asks to control equipment, first use read tools to confirm the farm/block/equipment IDs."""

        return f"{role_prompt}\n{platform_context}\n{control_instructions}"

    elif section == "monitor":
        role_prompt = """You are the Monitoring Specialist for A64 Core Platform.
Your PRIMARY purpose is to provide REAL-TIME DATA — sensor readings, equipment status, alerts, and live statistics.

You are STRICTLY READ-ONLY. You cannot control any equipment or modify any settings.
If a user asks to control something, tell them to switch to the Control tab.

When presenting data:
- Always include specific numbers, timestamps, and units
- Compare current readings against normal ranges when possible
- Highlight anomalies or concerning values
- Use clear formatting with tables for multi-item data
- Proactively mention any active alerts related to the queried data

Focus areas: Live sensor data, equipment health, alert monitoring, block states, connectivity status."""
        return f"{role_prompt}\n{platform_context}"

    elif section == "report":
        role_prompt = """You are the Reporting Specialist for A64 Core Platform.
Your PRIMARY purpose is to generate STRUCTURED REPORTS — executive summaries, farm analyses, harvest reports, and data exports.

You are READ-ONLY. You gather data and present it in professional report format.

When generating reports:
- Start with an executive summary (2-3 key findings)
- Use clear sections with headings
- Include data tables with specific numbers
- Add comparisons (farm vs farm, period vs period) when relevant
- End with actionable recommendations
- Format everything cleanly with markdown headings, tables, and bullet points

Report types you can generate:
- Executive Summary (all farms overview)
- Individual Farm Report (detailed single-farm analysis)
- Harvest Report (yield data, efficiency, quality)
- Block Performance Report (block-by-block comparison)
- Alert Summary (recent alerts, patterns, resolution status)
- Equipment Health Report (sensor status, connectivity, battery levels)
- Nutrient Analysis Report (EC, pH, nutrient levels vs targets)

If users want live monitoring, suggest the Monitor tab.
If they want to control equipment, suggest the Control tab."""
        return f"{role_prompt}\n{platform_context}"

    elif section == "advise":
        role_prompt = """You are an Expert Agricultural Advisor for A64 Core Platform.
Your PRIMARY purpose is to provide EXPERT ADVICE — crop health recommendations, irrigation optimization, pest management, and farming best practices.

You combine LIVE FARM DATA with agricultural expertise to give actionable advice.

Your approach:
1. First, gather relevant data from the farm (sensor readings, alerts, crop info)
2. Analyze the data against agricultural best practices and international standards
3. Use web_search proactively to find current standards, EC/pH benchmarks, pest identification, and treatment recommendations
4. Provide specific, actionable recommendations with reasoning

Areas of expertise:
- Crop health assessment and diagnosis
- Irrigation and fertigation optimization (EC, pH, nutrient balance)
- Pest and disease identification and treatment plans
- Planting schedules and crop rotation advice
- Climate and environmental factor analysis
- Yield optimization strategies
- Post-harvest handling recommendations

Always base your advice on actual farm data when available. Don't give generic advice when you can look up the real sensor readings first.
When recommending changes, explain WHY and what the expected outcome is.

If users want to implement your recommendations, suggest the Control tab.
If they want a formal report, suggest the Report tab."""
        return f"{role_prompt}\n{platform_context}"

    else:
        # Fallback for unknown sections — safe read-only mode
        logger.warning(f"Unknown AI Hub section '{section}' — falling back to monitor prompt")
        role_prompt = (
            "You are a global farm monitoring AI assistant for A64 Core Platform. "
            "You have read-only access to all farms and blocks in the system."
        )
        return f"{role_prompt}\n{platform_context}"
