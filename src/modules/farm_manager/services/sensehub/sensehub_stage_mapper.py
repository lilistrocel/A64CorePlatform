"""
SenseHub Stage Mapper

Pure helper module that maps A64Core block state and growth-cycle position to
SenseHub's stage enum.  No IO; deterministic given the inputs.

Stage boundaries (computed from planting date + GrowthCycleDuration):
  0 … germinationDays         → seedling
  germinationDays … +veg      → vegetative
  +veg … +flower              → flowering
  +flower … (fruiting - 15%)  → fruiting
  last 15 % of fruitingDays   → ripening  (or when block is HARVESTING)
  BlockStatus.CLEANING / EMPTY after harvest → harvested
"""

from datetime import datetime
from enum import Enum

from ...models.block import BlockStatus
from ...models.plant_data_enhanced import PlantDataEnhanced


class SenseHubStage(str, Enum):
    """Exhaustive ordered stage enum accepted by SenseHub MCP crop tools."""

    SEEDLING = "seedling"
    VEGETATIVE = "vegetative"
    FLOWERING = "flowering"
    FRUITING = "fruiting"
    RIPENING = "ripening"
    HARVESTED = "harvested"


# Fraction of fruitingDays that counts as "ripening" rather than "fruiting".
_RIPENING_FRACTION = 0.15


def _days_since_planting(planted_date: datetime) -> int:
    """
    Calculate integer days elapsed since planting (clamped to ≥ 0).

    Args:
        planted_date: UTC datetime when planting occurred.

    Returns:
        Non-negative integer day count.
    """
    delta = (datetime.utcnow() - planted_date).days
    return max(delta, 0)


def compute_stage(
    planted_date: datetime,
    plant_data_enhanced: PlantDataEnhanced,
    block_state: BlockStatus,
) -> SenseHubStage:
    """
    Map A64Core's derived growth phase to SenseHub's stage enum.

    Decision tree (in priority order):
    1. block_state is CLEANING or EMPTY → harvested
       (these states appear after complete_crop has been called)
    2. block_state is HARVESTING → ripening
       (operator is actively harvesting; not yet complete)
    3. Day-based boundary computation using GrowthCycleDuration:
       - 0 … germinationDays          → seedling
       - +vegetativeDays              → vegetative
       - +floweringDays               → flowering
       - +fruitingDays * (1-0.15)     → fruiting
       - remainder of fruitingDays    → ripening
       - beyond total cycle           → ripening (harvest overdue)

    Args:
        planted_date: UTC datetime when planting was executed on this block.
        plant_data_enhanced: Full enhanced plant data for the crop.
        block_state: Current BlockStatus of the block.

    Returns:
        SenseHubStage enum value representing the current growth stage.
    """
    # Priority 1 — post-harvest terminal states
    if block_state in (BlockStatus.CLEANING, BlockStatus.EMPTY):
        return SenseHubStage.HARVESTED

    # Priority 2 — operator is actively harvesting
    if block_state == BlockStatus.HARVESTING:
        return SenseHubStage.RIPENING

    # Priority 3 — day-based boundary walk
    gc = plant_data_enhanced.growthCycle
    germ_days: int = gc.germinationDays
    veg_days: int = gc.vegetativeDays
    flower_days: int = gc.floweringDays
    fruit_days: int = gc.fruitingDays

    day: int = _days_since_planting(planted_date)

    # Seedling / germination window
    cumulative = germ_days
    if day <= cumulative:
        return SenseHubStage.SEEDLING

    # Vegetative window
    cumulative += veg_days
    if day <= cumulative:
        return SenseHubStage.VEGETATIVE

    # Flowering window
    cumulative += flower_days
    if day <= cumulative:
        return SenseHubStage.FLOWERING

    # Fruiting window — last _RIPENING_FRACTION of fruitingDays → ripening
    # Ripening threshold: fruiting_start + fruiting_days * (1 - fraction)
    fruiting_start = cumulative  # day count at the beginning of fruiting
    ripening_threshold = fruiting_start + int(fruit_days * (1.0 - _RIPENING_FRACTION))
    cumulative += fruit_days

    if day <= ripening_threshold:
        return SenseHubStage.FRUITING

    # Within fruit_days but past ripening threshold, or beyond total cycle
    return SenseHubStage.RIPENING
