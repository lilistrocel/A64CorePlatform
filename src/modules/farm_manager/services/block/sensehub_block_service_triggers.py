"""
SenseHub trigger helpers for BlockService.change_status.

Extracted here to keep block_service_new.py readable.  These functions are
called via asyncio.create_task() — they must never raise (any exception is
caught and logged at ERROR).

Two public coroutines:

  _sensehub_update_growth_stage_task
      Fires update_growth_stage when a block status transition causes the
      SenseHub computed stage to cross a boundary.

  _sensehub_complete_crop_task
      Fires complete_crop when the operator closes the harvest cycle by
      transitioning the block from HARVESTING to CLEANING.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ...models.block import Block, BlockStatus

logger = logging.getLogger(__name__)

# Maximum characters of exception detail included in log messages.
_ERR_PREVIEW_LEN = 500


async def _sensehub_update_growth_stage_task(
    snapshot_block: "Block",
    prev_state: "BlockStatus",
    next_state: "BlockStatus",
) -> None:
    """
    Background task: push update_growth_stage to SenseHub when the block's
    computed SenseHub stage crosses a boundary due to a status transition.

    Skip conditions (all logged at appropriate level):
    - Block has no iotController (SenseHubCropSync.from_block returns None).
    - block.targetCrop is None.
    - plant_data_enhanced not found for block.targetCrop.
    - Computed stage before and after the transition are identical.
    - next_state is CLEANING or EMPTY: the crop cycle has ended and
      complete_crop will handle finalization (fired separately).

    Args:
        snapshot_block: Block document captured BEFORE the status update was
            persisted (still holds plantedDate, targetCrop, etc.).
        prev_state: BlockStatus before the transition.
        next_state: BlockStatus that was just persisted.
    """
    from ..sensehub.sensehub_crop_sync import SenseHubCropSync
    from ..sensehub.sensehub_stage_mapper import compute_stage, SenseHubStage
    from ...models.block import BlockStatus
    from ..plant_data.plant_data_enhanced_repository import PlantDataEnhancedRepository

    block_id_str = str(snapshot_block.blockId)

    try:
        # Do not push stage updates for terminal post-harvest states — complete_crop
        # handles finalization separately.
        if next_state in (BlockStatus.CLEANING, BlockStatus.EMPTY):
            return

        sync = SenseHubCropSync.from_block(snapshot_block)
        if sync is None:
            # No iotController — already logged inside from_block.
            return

        if snapshot_block.targetCrop is None:
            logger.warning(
                "[SenseHub] block %s has no targetCrop — skipping update_growth_stage "
                "for transition %s → %s",
                block_id_str,
                prev_state.value,
                next_state.value,
            )
            return

        plant_data = await PlantDataEnhancedRepository.get_by_id(snapshot_block.targetCrop)
        if plant_data is None:
            logger.warning(
                "[SenseHub] plant_data_enhanced not found for id=%s (block %s) — "
                "skipping update_growth_stage",
                snapshot_block.targetCrop,
                block_id_str,
            )
            return

        planted_date = snapshot_block.plantedDate  # guaranteed non-None at call site
        assert planted_date is not None  # type narrowing for mypy

        # Compute stage before and after using the respective BlockStatus values.
        stage_before: SenseHubStage = compute_stage(
            planted_date=planted_date,
            plant_data_enhanced=plant_data,
            block_state=prev_state,
        )
        stage_after: SenseHubStage = compute_stage(
            planted_date=planted_date,
            plant_data_enhanced=plant_data,
            block_state=next_state,
        )

        if stage_before == stage_after:
            # No SenseHub stage boundary crossed — nothing to push.
            logger.debug(
                "[SenseHub] block %s: status %s → %s maps to same stage %s — "
                "skipping update_growth_stage",
                block_id_str,
                prev_state.value,
                next_state.value,
                stage_after.value,
            )
            return

        now = datetime.utcnow()
        days_since = (now - planted_date).days

        await sync.update_growth_stage(
            block=snapshot_block,
            stage=stage_after,
            transitioned_at=now,
            days_since_planting=days_since,
        )
        logger.info(
            "[SenseHub] update_growth_stage succeeded | block_id=%s "
            "transition=%s→%s stage=%s days=%d",
            block_id_str,
            prev_state.value,
            next_state.value,
            stage_after.value,
            days_since,
        )

    except Exception as exc:
        logger.error(
            "[SenseHub] update_growth_stage task failed | operation=change_status "
            "block_id=%s transition=%s→%s | error: %s",
            block_id_str,
            prev_state.value,
            next_state.value,
            str(exc)[:_ERR_PREVIEW_LEN],
        )


async def _sensehub_complete_crop_task(snapshot_block: "Block") -> None:
    """
    Background task: push complete_crop to SenseHub when a harvest cycle ends.

    Called exclusively from the HARVESTING → CLEANING branch of
    BlockService.change_status, after the state change is persisted.

    Harvest aggregation uses HarvestRepository.get_block_summary() which runs an
    aggregation pipeline over all harvest records for the block and returns:
      - totalHarvests   → harvest_count
      - totalQuantityKg → total_yield_kg
      - averageQualityGrade ("A"/"B"/"C"/"N/A") → average_quality_grade

    Grade normalisation:
      - "N/A" (no harvests) → "A" (default; annotated in log).
      - Any other value is passed through unchanged.

    harvested_at is taken from the block's most recent harvest (lastHarvestDate
    from summary), or datetime.utcnow() if no harvests recorded.

    Args:
        snapshot_block: Block document captured BEFORE the status update to
            CLEANING was persisted (still holds targetCrop, plantedDate, kpi).
    """
    from ..sensehub.sensehub_crop_sync import SenseHubCropSync
    from .harvest_repository import HarvestRepository

    block_id_str = str(snapshot_block.blockId)

    try:
        sync = SenseHubCropSync.from_block(snapshot_block)
        if sync is None:
            # No iotController — already logged inside from_block.
            return

        # Aggregate all harvests for this block's current cycle.
        summary = await HarvestRepository.get_block_summary(snapshot_block.blockId)

        # Resolve harvested_at from summary or fall back to now.
        harvested_at: datetime = summary.lastHarvestDate or datetime.utcnow()

        # Normalise quality grade.
        raw_grade = summary.averageQualityGrade
        if raw_grade not in ("A", "B", "C"):
            # Reason: "N/A" means no harvests were recorded (edge case); default to "A"
            # to satisfy the SenseHub contract (allowed values: A/B/C/D).
            average_quality_grade = "A"
            logger.warning(
                "[SenseHub] block %s has averageQualityGrade=%r "
                "(no harvests or unexpected value) — defaulting to 'A' for complete_crop",
                block_id_str,
                raw_grade,
            )
        else:
            average_quality_grade = raw_grade

        await sync.complete_crop(
            block=snapshot_block,
            harvested_at=harvested_at,
            total_yield_kg=summary.totalQuantityKg,
            average_quality_grade=average_quality_grade,
            harvest_count=summary.totalHarvests,
        )
        logger.info(
            "[SenseHub] complete_crop succeeded | block_id=%s "
            "yield_kg=%.2f harvest_count=%d grade=%s",
            block_id_str,
            summary.totalQuantityKg,
            summary.totalHarvests,
            average_quality_grade,
        )

    except Exception as exc:
        logger.error(
            "[SenseHub] complete_crop task failed | operation=change_status "
            "block_id=%s | error: %s",
            block_id_str,
            str(exc)[:_ERR_PREVIEW_LEN],
        )
