"""
Farm-Level AI Chat - Context Builder

Builds the system prompt for the farm-level AI by loading the farm and ALL
active blocks from MongoDB.  Provides a high-level overview so the AI can
answer questions about any block and coordinate multi-block operations.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from ..database import farm_db

logger = logging.getLogger(__name__)


def _sensehub_connected(block: dict) -> bool:
    """Return True when a block's iotController reports a connected status."""
    iot = block.get("iotController") or {}
    return iot.get("connectionStatus") == "connected"


async def build_farm_system_prompt(
    farm_id: UUID,
) -> tuple[str, Optional[dict]]:
    """
    Build the farm-level AI system prompt with context for all active blocks.

    Loads the farm document and all its active blocks from MongoDB, then
    composes a system prompt that includes:
    - Farm identity and summary statistics
    - A table of all blocks with state, crop, SenseHub status
    - Operating instructions for the AI

    Args:
        farm_id: UUID of the farm to build context for.

    Returns:
        A tuple of (system_prompt, farm_summary_dict).
        farm_summary_dict has keys: farm_name, block_count, connected_blocks.
        Returns a generic error prompt with None summary if farm is not found.
    """
    db = farm_db.get_database()

    # Load farm document
    farm = await db.farms.find_one({"farmId": str(farm_id)})
    if not farm:
        logger.warning(f"Farm {farm_id} not found when building system prompt")
        return (
            "You are a farm-level AI assistant. The requested farm was not found. "
            "Let the user know and ask them to verify the farm ID.",
            None,
        )

    farm_name = farm.get("name", "Unknown Farm")
    farm_location = farm.get("location", "")
    farm_area = farm.get("totalArea", 0)
    farm_area_unit = farm.get("areaUnit", "sqm")

    # Load all active blocks for this farm
    cursor = db.blocks.find(
        {"farmId": str(farm_id), "isActive": True}
    ).sort("blockCode", 1)
    blocks = await cursor.to_list(length=500)

    total_blocks = len(blocks)
    connected_blocks = sum(1 for b in blocks if _sensehub_connected(b))

    # Build block summary table
    block_rows: list[str] = []
    for block in blocks:
        block_code = block.get("blockCode", "?")
        block_name = block.get("name", block_code)
        state = block.get("state", "unknown")
        block_type = block.get("blockType", "unknown")
        crop_name = block.get("targetCropName", "—")
        plant_count = block.get("actualPlantCount", 0) or 0

        connected_flag = "YES" if _sensehub_connected(block) else "no"

        block_rows.append(
            f"  | {block_code:<12} | {block_name:<20} | {state:<12} | "
            f"{block_type:<12} | {crop_name:<20} | {plant_count:>6} plants | "
            f"SenseHub: {connected_flag}"
        )

    if block_rows:
        block_table_header = (
            "  | BlockCode     | Name                 | State        | "
            "Type         | Crop                 | Plants        | IoT"
        )
        block_table_sep = "  " + "-" * 110
        block_table = (
            block_table_header
            + "\n"
            + block_table_sep
            + "\n"
            + "\n".join(block_rows)
        )
    else:
        block_table = "  No active blocks found on this farm."

    # Farm summary for response metadata
    farm_summary_dict = {
        "farm_name": farm_name,
        "block_count": total_blocks,
        "connected_blocks": connected_blocks,
    }

    sensehub_note = (
        f"{connected_blocks} of {total_blocks} block(s) have SenseHub connected."
        if total_blocks > 0
        else "No blocks found."
    )

    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    system_prompt = f"""You are a farm-level AI monitor and assistant for {farm_name}.

FARM OVERVIEW:
Farm: {farm_name}
{"Location: " + farm_location if farm_location else ""}
{"Total area: " + str(farm_area) + " " + farm_area_unit if farm_area else ""}
Active blocks: {total_blocks}
{sensehub_note}

ALL ACTIVE BLOCKS:
{block_table}

INSTRUCTIONS:
- You can see ALL blocks on this farm and their current status.
- Use the tools available to fetch real-time data from any specific block.
- When a user asks about sensor readings, equipment, or environmental conditions, \
use the relevant block-scoped tool and pass the block_code parameter.
- For cross-farm questions (e.g. "any alerts across all blocks?"), use the \
get_all_blocks_alerts tool which aggregates data from every connected block.
- For write actions (relay control, trigger automations) you MUST specify the \
target block by block_code. The system will confirm with the user before executing.
- If the user does not specify which block, ask them to clarify or list the available blocks.
- Do NOT make up sensor data or relay states. Always use the tools to fetch live data.
- You have access to Google Search. Use it for agricultural standards, crop benchmarks, \
pest/disease identification, and any external reference data the user asks about.
- Compare sensor readings against typical optimal ranges and flag anomalies.
- Today's date is {today_str}.
- Blocks without SenseHub connected cannot provide real-time sensor data; \
inform the user if they ask about such a block."""

    return system_prompt, farm_summary_dict
