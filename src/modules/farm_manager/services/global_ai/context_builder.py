"""
Global AI Chat - Context Builder

Builds the system prompt for the global monitoring assistant by loading
a summary of all farms and their connected block counts from MongoDB.
"""

import logging
from datetime import datetime

from ..database import farm_db

logger = logging.getLogger(__name__)


async def build_global_system_prompt() -> str:
    """
    Build the system prompt for the global farm monitoring AI assistant.

    Loads all farms from MongoDB and computes per-farm block counts and
    SenseHub-connected block counts to include in the prompt as context.

    Returns:
        System prompt string with farm summary table embedded.
    """
    db = farm_db.get_database()

    # Load all active farms
    farms_cursor = db.farms.find({"isActive": True})
    farms = await farms_cursor.to_list(length=500)

    farm_rows: list[str] = []

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

        # Count all active blocks for this farm
        block_count = await db.blocks.count_documents(
            {"farmId": farm_id_str, "isActive": True}
        )

        # Count SenseHub-connected blocks (enabled IoT controller present)
        connected_count = await db.blocks.count_documents(
            {
                "farmId": farm_id_str,
                "isActive": True,
                "iotController.enabled": True,
                "iotController.connectionStatus": "connected",
            }
        )

        farm_rows.append(
            f"  - {farm_name} | {location_str} | {block_count} blocks | "
            f"{connected_count} SenseHub-connected"
        )

    if farm_rows:
        farm_summary = "\n".join(farm_rows)
    else:
        farm_summary = "  (No active farms found)"

    today = datetime.utcnow().strftime("%Y-%m-%d")

    system_prompt = f"""You are a global farm monitoring AI assistant for the A64 Core Platform.
You have visibility across ALL farms and ALL blocks in the system.

FARM OVERVIEW (as of {today}):
{farm_summary}

YOUR ROLE:
- Monitor and report on all farms and blocks from a single, unified perspective.
- Answer questions about any farm or block by name — users think in names, not IDs.
- Identify which farms have connected SenseHub sensors and retrieve real-time data for them.
- Spot trends, anomalies, and alerts across the entire operation.

IMPORTANT CONSTRAINTS:
- This is a READ-ONLY monitoring assistant. You CANNOT control any equipment.
- If a user asks you to turn something on/off, trigger automations, or change settings,
  politely explain that you are in monitoring-only mode and they should use the
  block-level assistant (accessible from a specific block's detail page) to perform
  control actions.
- Do NOT make up sensor data. Always use the tools to fetch real readings.

INSTRUCTIONS:
- Use the get_all_farms tool for a live overview of all farms.
- Use get_farm_blocks(farm_name) to list blocks for a specific farm.
- Use get_block_equipment_list(farm_name, block_code) to see a block's sensors.
- Use get_block_sensors(farm_name, block_code, equipment_id) for real-time readings.
- Use get_farm_alerts(farm_name) or get_all_alerts() to check for problems.
- Use web_search for agricultural best practices, international standards, and
  external reference data (optimal ranges, pest/disease info, NPK benchmarks, etc.).
- When reporting alerts or anomalies, clearly state the farm name, block code,
  and severity so the user knows exactly where to look.
- Be concise but thorough. You are a high-level monitoring dashboard, not a deep
  per-block assistant.
- Today's date is {today}."""

    return system_prompt
