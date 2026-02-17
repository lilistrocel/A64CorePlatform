"""
Farm AI Chat - Context Builder

Builds the system prompt for Claude by loading block, crop, and growth
stage data from MongoDB. Provides rich agricultural context so Claude
can give informed, crop-specific advice.
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from ..database import farm_db

logger = logging.getLogger(__name__)


def _calculate_growth_stage(
    planted_date: datetime,
    growth_cycle: dict,
) -> dict:
    """
    Determine current growth stage from planting date and cycle durations.

    Returns dict with stage name, day number, total days, progress percent.
    """
    days_since_planting = (datetime.utcnow() - planted_date).days
    if days_since_planting < 0:
        days_since_planting = 0

    germ = growth_cycle.get("germinationDays", 0)
    veg = growth_cycle.get("vegetativeDays", 0)
    flower = growth_cycle.get("floweringDays", 0)
    fruit = growth_cycle.get("fruitingDays", 0)
    harvest = growth_cycle.get("harvestDurationDays", 0)
    total = growth_cycle.get("totalCycleDays", germ + veg + flower + fruit + harvest)

    if total == 0:
        total = 1  # avoid division by zero

    progress = min(round((days_since_planting / total) * 100, 1), 100.0)

    cumulative = 0
    stage = "unknown"

    cumulative += germ
    if days_since_planting <= cumulative:
        stage = "germination"
    else:
        cumulative += veg
        if days_since_planting <= cumulative:
            stage = "vegetative"
        else:
            cumulative += flower
            if days_since_planting <= cumulative:
                stage = "flowering"
            else:
                cumulative += fruit
                if days_since_planting <= cumulative:
                    stage = "fruiting"
                else:
                    stage = "harvest"

    return {
        "stage": stage,
        "day": days_since_planting,
        "total_cycle_days": total,
        "progress_percent": progress,
    }


def _format_fertigation_context(
    fertigation_schedule: Optional[dict],
    current_stage: str,
) -> str:
    """Extract active fertigation card for current growth stage."""
    if not fertigation_schedule:
        return "No fertigation schedule configured."

    cards = fertigation_schedule.get("cards", [])
    if not cards:
        return "Fertigation schedule has no cards."

    active_cards = [
        c for c in cards
        if c.get("growthStage") == current_stage or c.get("growthStage") == "general"
    ]
    if not active_cards:
        # Fall back to any active card
        active_cards = [c for c in cards if c.get("isActive", True)]

    if not active_cards:
        return "No active fertigation card for current growth stage."

    card = active_cards[0]
    lines = [f"Active fertigation card: {card.get('cardName', 'Unnamed')}"]
    lines.append(f"  Stage: {card.get('growthStage', 'unknown')}, Days {card.get('dayStart', '?')}-{card.get('dayEnd', '?')}")

    for rule in card.get("rules", []):
        rule_name = rule.get("name", "Unnamed rule")
        rule_type = rule.get("type", "unknown")
        if rule_type == "interval":
            freq = rule.get("frequencyDays", "?")
            lines.append(f"  Rule: {rule_name} (every {freq} days)")
            for ing in rule.get("ingredients", []):
                lines.append(f"    - {ing.get('name')}: {ing.get('dosagePerPoint')} {ing.get('unit', 'g')}/point")
        elif rule_type == "custom":
            apps = rule.get("applications", [])
            lines.append(f"  Rule: {rule_name} (custom, {len(apps)} applications)")

    return "\n".join(lines)


async def build_system_prompt(
    farm_id: UUID,
    block_id: UUID,
) -> tuple[str, Optional[dict]]:
    """
    Build Claude's system prompt with full block + crop context.

    Returns:
        (system_prompt, growth_stage_info) - growth_stage_info is None if no active crop.
    """
    db = farm_db.get_database()

    # Load block
    block = await db.blocks.find_one(
        {"blockId": str(block_id), "farmId": str(farm_id), "isActive": True}
    )

    if not block:
        return (
            "You are a farm AI assistant. The requested block was not found. "
            "Let the user know and ask them to check the block ID.",
            None,
        )

    # Load farm name
    farm = await db.farms.find_one({"farmId": str(farm_id)})
    farm_name = farm.get("name", "Unknown Farm") if farm else "Unknown Farm"

    # Block basics
    block_name = block.get("name", block.get("blockCode", "Unknown Block"))
    block_type = block.get("blockType", "unknown")
    block_state = block.get("state", "empty")
    block_area = block.get("area", 0)
    area_unit = block.get("areaUnit", "sqm")
    plant_count = block.get("actualPlantCount", 0)
    planted_date = block.get("plantedDate")

    # If this is a physical parent block (state=partial), load virtual children
    # so the AI knows about all crops planted in this block's area.
    virtual_children = []
    if block.get("blockCategory") == "physical" and block.get("state") == "partial":
        cursor = db.blocks.find(
            {"parentBlockId": str(block_id), "isActive": True}
        ).sort("blockCode", 1)
        virtual_children = await cursor.to_list(length=50)

    # Load crop data if assigned
    crop_context = "No crop currently assigned to this block."
    growth_stage_info = None
    fertigation_context = "No fertigation data available."

    target_crop_id = block.get("targetCrop")
    crop_name = block.get("targetCropName", "Unknown")

    # For physical parent blocks, build context from virtual children
    if not target_crop_id and virtual_children:
        crop_sections = []
        total_plants = 0
        primary_growth_stage = None  # Use first child with growth stage for header badge

        for child in virtual_children:
            child_crop_id = child.get("targetCrop")
            child_crop_name = child.get("targetCropName", "Unknown")
            child_state = child.get("state", "empty")
            child_plants = child.get("actualPlantCount", 0) or 0
            child_area = child.get("allocatedArea", child.get("area", 0))
            child_planted = child.get("plantedDate")
            total_plants += child_plants

            section = f"  [{child.get('blockCode', '?')}] {child_crop_name} ({child_state})"
            section += f" - {child_plants} plants, {child_area} {area_unit}"

            if child_crop_id:
                crop = await db.plant_data_enhanced.find_one(
                    {"plantDataId": str(child_crop_id)}
                )
                if not crop:
                    crop = await db.plant_data.find_one(
                        {"plantDataId": str(child_crop_id)}
                    )

                if crop:
                    env_req = crop.get("environmentalRequirements", {})
                    growth_cycle = crop.get("growthCycle", {})

                    # Temperature range
                    temp = env_req.get("temperature", {})
                    if temp:
                        section += (
                            f"\n    Temp: {temp.get('minCelsius', '?')}-"
                            f"{temp.get('maxCelsius', '?')}C "
                            f"(optimal {temp.get('optimalCelsius', '?')}C)"
                        )

                    # Humidity range
                    humidity = env_req.get("humidity", {})
                    if humidity:
                        section += (
                            f"\n    Humidity: {humidity.get('minPercentage', '?')}-"
                            f"{humidity.get('maxPercentage', '?')}%"
                        )

                    # Growth stage for this child - prefer the block's actual
                    # state (user may have manually advanced it) over the
                    # calculated stage from plantedDate + growthCycle.
                    _BLOCK_STATE_TO_STAGE = {
                        "growing": None,  # use calculated stage
                        "harvesting": "harvest",
                        "completed": "completed",
                        "fallow": "fallow",
                    }
                    mapped_stage = _BLOCK_STATE_TO_STAGE.get(child_state)

                    if mapped_stage:
                        # Block state overrides calculated stage
                        total = growth_cycle.get("totalCycleDays", 1) or 1
                        days = 0
                        if child_planted:
                            pd = child_planted
                            if isinstance(pd, str):
                                pd = datetime.fromisoformat(pd.replace("Z", "+00:00"))
                            days = max(0, (datetime.utcnow() - pd).days)
                        child_growth = {
                            "stage": mapped_stage,
                            "day": days,
                            "total_cycle_days": total,
                            "progress_percent": min(round((days / total) * 100, 1), 100.0),
                        }
                        section += (
                            f"\n    Growth: {child_growth['stage'].upper()} "
                            f"(day {child_growth['day']}/{child_growth['total_cycle_days']})"
                        )
                        if primary_growth_stage is None:
                            primary_growth_stage = child_growth
                    elif child_planted and growth_cycle:
                        pd = child_planted
                        if isinstance(pd, str):
                            pd = datetime.fromisoformat(pd.replace("Z", "+00:00"))
                        child_growth = _calculate_growth_stage(pd, growth_cycle)
                        section += (
                            f"\n    Growth: {child_growth['stage'].upper()} "
                            f"(day {child_growth['day']}/{child_growth['total_cycle_days']})"
                        )
                        if primary_growth_stage is None:
                            primary_growth_stage = child_growth

                    # Fertigation
                    fert = crop.get("fertigationSchedule")
                    if fert and fert.get("cards"):
                        active = [c for c in fert["cards"] if c.get("isActive", True)]
                        if active:
                            section += f"\n    Fertigation: {active[0].get('cardName', 'Active')}"

            crop_sections.append(section)

        plant_count = total_plants
        crop_context = (
            f"This is a multi-crop block with {len(virtual_children)} virtual planting(s):\n"
            + "\n".join(crop_sections)
        )
        growth_stage_info = primary_growth_stage

    elif target_crop_id:
        crop = await db.plant_data_enhanced.find_one(
            {"plantDataId": str(target_crop_id)}
        )
        if not crop:
            # Try legacy plant_data collection
            crop = await db.plant_data.find_one(
                {"plantDataId": str(target_crop_id)}
            )

        if crop:
            crop_name = crop.get("plantName", crop_name)
            growth_cycle = crop.get("growthCycle", {})
            env_req = crop.get("environmentalRequirements", {})
            water_req = crop.get("wateringRequirements", {})
            soil_req = crop.get("soilRequirements", {})
            light_req = crop.get("lightRequirements", {})
            yield_info = crop.get("yieldInfo", {})

            # Temperature
            temp = env_req.get("temperature", {})
            temp_str = ""
            if temp:
                temp_str = (
                    f"Temperature: {temp.get('minCelsius', '?')}-{temp.get('maxCelsius', '?')}C "
                    f"(optimal {temp.get('optimalCelsius', '?')}C)"
                )

            # Humidity
            humidity = env_req.get("humidity", {})
            humidity_str = ""
            if humidity:
                humidity_str = (
                    f"Humidity: {humidity.get('minPercentage', '?')}-{humidity.get('maxPercentage', '?')}% "
                    f"(optimal {humidity.get('optimalPercentage', '?')}%)"
                )

            # pH
            ph = soil_req.get("phRequirements", {}) if soil_req else {}
            ph_str = ""
            if ph:
                ph_str = f"pH: {ph.get('minPH', '?')}-{ph.get('maxPH', '?')} (optimal {ph.get('optimalPH', '?')})"

            # Light
            light_str = ""
            if light_req:
                light_str = (
                    f"Light: {light_req.get('minHoursDaily', '?')}-{light_req.get('maxHoursDaily', '?')} hours/day "
                    f"({light_req.get('lightType', 'unknown')})"
                )

            # Watering
            water_str = ""
            if water_req:
                water_str = f"Watering: every {water_req.get('frequencyDays', '?')} days"
                amt = water_req.get("amountPerPlantLiters")
                if amt:
                    water_str += f", {amt}L/plant"

            # Yield
            yield_str = ""
            if yield_info:
                yield_str = (
                    f"Expected yield: {yield_info.get('yieldPerPlant', '?')} "
                    f"{yield_info.get('yieldUnit', 'kg')}/plant"
                )

            crop_context = (
                f"Crop: {crop_name} ({crop.get('scientificName', '')})\n"
                f"Growth cycle: {growth_cycle.get('totalCycleDays', '?')} days total\n"
                f"  Germination: {growth_cycle.get('germinationDays', '?')}d, "
                f"Vegetative: {growth_cycle.get('vegetativeDays', '?')}d, "
                f"Flowering: {growth_cycle.get('floweringDays', '?')}d, "
                f"Fruiting: {growth_cycle.get('fruitingDays', '?')}d, "
                f"Harvest: {growth_cycle.get('harvestDurationDays', '?')}d\n"
                f"{temp_str}\n{humidity_str}\n{ph_str}\n{light_str}\n{water_str}\n{yield_str}"
            ).strip()

            # Growth stage - prefer the block's actual state over calculated
            _SINGLE_STATE_MAP = {
                "harvesting": "harvest",
                "completed": "completed",
                "fallow": "fallow",
            }
            override_stage = _SINGLE_STATE_MAP.get(block_state)

            if override_stage and growth_cycle:
                total = growth_cycle.get("totalCycleDays", 1) or 1
                days = 0
                if planted_date:
                    if isinstance(planted_date, str):
                        planted_date = datetime.fromisoformat(planted_date.replace("Z", "+00:00"))
                    days = max(0, (datetime.utcnow() - planted_date).days)
                growth_stage_info = {
                    "stage": override_stage,
                    "day": days,
                    "total_cycle_days": total,
                    "progress_percent": min(round((days / total) * 100, 1), 100.0),
                }
            elif planted_date and growth_cycle:
                if isinstance(planted_date, str):
                    planted_date = datetime.fromisoformat(planted_date.replace("Z", "+00:00"))
                growth_stage_info = _calculate_growth_stage(planted_date, growth_cycle)

            # Fertigation
            fert_schedule = crop.get("fertigationSchedule")
            if fert_schedule and growth_stage_info:
                fertigation_context = _format_fertigation_context(
                    fert_schedule, growth_stage_info["stage"]
                )

    # Build growth stage string
    growth_stage_str = "No active planting."
    if growth_stage_info:
        prefix = "Primary crop growth stage" if virtual_children else "Current growth stage"
        growth_stage_str = (
            f"{prefix}: {growth_stage_info['stage'].upper()}\n"
            f"Day {growth_stage_info['day']} of {growth_stage_info['total_cycle_days']} "
            f"({growth_stage_info['progress_percent']}% complete)"
        )

    # KPI
    kpi = block.get("kpi", {})
    kpi_str = ""
    if kpi and kpi.get("predictedYieldKg", 0) > 0:
        kpi_str = (
            f"\nYield KPI: {kpi.get('actualYieldKg', 0):.1f} / "
            f"{kpi.get('predictedYieldKg', 0):.1f} kg "
            f"({kpi.get('yieldEfficiencyPercent', 0):.0f}% efficiency, "
            f"{kpi.get('totalHarvests', 0)} harvests)"
        )

    system_prompt = f"""You are an AI farm assistant for {farm_name}. You help farmers monitor and manage their crops using real-time sensor data from SenseHub.

BLOCK CONTEXT:
Block: {block_name} ({block_type})
Status: {block_state}
Area: {block_area} {area_unit}
Plants: {plant_count}{kpi_str}

CROP INFORMATION:
{crop_context}

GROWTH STAGE:
{growth_stage_str}

FERTIGATION:
{fertigation_context}

INSTRUCTIONS:
- Answer questions about the farm block using the tools available to you.
- When the user asks about sensor readings, equipment, or farm status, use the appropriate tool to get real-time data.
- Compare sensor readings against the crop's optimal ranges and flag any issues.
- For write actions (controlling relays, triggering automations), explain what you intend to do and use the tool. The system will ask the user to confirm before executing.
- Be concise but informative. Use the crop data to give context-aware advice.
- If asked about watering, fertigation, or environmental conditions, reference the crop's specific requirements.
- When reporting sensor values, mention if they are within or outside the optimal range for this crop.
- Do NOT make up sensor data. Always use the tools to get real readings.
- You have access to Google Search. Use it to look up international agricultural standards, optimal NPK/EC ranges, crop-specific best practices, pest/disease identification, and any external reference data the user asks about. When comparing sensor readings to standards, search for authoritative benchmarks.
- Today's date is {datetime.utcnow().strftime('%Y-%m-%d')}."""

    return system_prompt, growth_stage_info
