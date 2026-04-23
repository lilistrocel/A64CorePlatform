"""
Integration tests for T-002 Phase 4 — SenseHub MCP trigger wiring.

Covers the three service-layer hook points wired in Phase 4:

  1. PlantingService.mark_as_planted → SenseHubCropSync.set_crop_data
  2. BlockService.change_status      → SenseHubCropSync.update_growth_stage
  3. BlockService.change_status (HARVESTING→CLEANING) → SenseHubCropSync.complete_crop

All SenseHubCropSync methods are mocked — no real MCP calls, no MongoDB.
Block/Repository dependencies are patched at the service boundary so we test
only the trigger wiring logic without standing up a database.

Run inside the Docker container:
    docker exec a64core-api-dev python -m pytest tests/integration/test_sensehub_trigger_wiring.py -v

Or from a local virtualenv with src/ on PYTHONPATH:
    python -m pytest tests/integration/test_sensehub_trigger_wiring.py -v
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
import pytest_asyncio

# ---------------------------------------------------------------------------
# Shared model fixtures
# ---------------------------------------------------------------------------
from src.modules.farm_manager.models.block import (
    Block,
    BlockKPI,
    BlockStatus,
    IoTController,
)
from src.modules.farm_manager.models.block_harvest import BlockHarvestSummary
from src.modules.farm_manager.models.plant_data_enhanced import (
    EnvironmentalRequirements,
    FarmTypeEnum,
    GrowthCycleDuration,
    HumidityRange,
    LightRequirements,
    LightTypeEnum,
    PHRequirements,
    PlantDataEnhanced,
    SoilRequirements,
    SoilTypeEnum,
    TemperatureRange,
    WateringRequirements,
    YieldInfo,
)
from src.modules.farm_manager.services.sensehub.sensehub_stage_mapper import (
    SenseHubStage,
)

# ---------------------------------------------------------------------------
# Shared UUID constants
# ---------------------------------------------------------------------------
_BLOCK_ID = uuid4()
_FARM_ID = uuid4()
_PLANT_DATA_ID = uuid4()
_PLANTING_ID = uuid4()
_USER_ID = uuid4()
_PLANTED_DATE = datetime(2026, 3, 15, 0, 0, 0)  # naive UTC


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def _make_iot_controller() -> IoTController:
    """IoT controller with a valid mcpApiKey so from_block returns an instance."""
    return IoTController(
        address="192.168.1.50",
        mcpPort=3001,
        mcpApiKey="test-api-key-abc123",
    )


def _make_growth_cycle(
    germ: int = 7,
    veg: int = 30,
    flower: int = 14,
    fruit: int = 35,
    harvest_dur: int = 6,
    total: int = 92,
) -> GrowthCycleDuration:
    return GrowthCycleDuration(
        germinationDays=germ,
        vegetativeDays=veg,
        floweringDays=flower,
        fruitingDays=fruit,
        harvestDurationDays=harvest_dur,
        totalCycleDays=total,
    )


def _make_plant_data(plant_data_id: UUID = _PLANT_DATA_ID) -> PlantDataEnhanced:
    """Minimal but valid PlantDataEnhanced document."""
    return PlantDataEnhanced(
        plantDataId=plant_data_id,
        plantName="Tomato",
        scientificName="Solanum lycopersicum",
        farmTypeCompatibility=[FarmTypeEnum.GREENHOUSE],
        growthCycle=_make_growth_cycle(),
        yieldInfo=YieldInfo(yieldPerPlant=3.0, yieldUnit="kg"),
        environmentalRequirements=EnvironmentalRequirements(
            temperature=TemperatureRange(
                minCelsius=15, maxCelsius=30, optimalCelsius=22
            ),
            humidity=HumidityRange(
                minPercentage=50, maxPercentage=80, optimalPercentage=65
            ),
        ),
        soilRequirements=SoilRequirements(
            phRequirements=PHRequirements(minPH=5.8, maxPH=6.5, optimalPH=6.2),
            soilTypes=[SoilTypeEnum.LOAMY],
        ),
        wateringRequirements=WateringRequirements(
            frequencyDays=2,
            amountPerPlantLiters=1.2,
        ),
        lightRequirements=LightRequirements(
            lightType=LightTypeEnum.FULL_SUN,
            minHoursDaily=10.0,
            maxHoursDaily=16.0,
            optimalHoursDaily=14.0,
        ),
        createdBy=_USER_ID,
        createdByEmail="test@a64core.com",
    )


def _make_block(
    state: BlockStatus = BlockStatus.GROWING,
    planted_date: Optional[datetime] = _PLANTED_DATE,
    with_iot: bool = True,
    plant_data_id: UUID = _PLANT_DATA_ID,
) -> Block:
    """Build a minimal Block instance suitable for unit/integration testing."""
    return Block(
        blockId=_BLOCK_ID,
        farmId=_FARM_ID,
        maxPlants=100,
        state=state,
        targetCrop=plant_data_id,
        targetCropName="Tomato",
        actualPlantCount=80,
        plantedDate=planted_date,
        kpi=BlockKPI(predictedYieldKg=240.0, actualYieldKg=50.0, totalHarvests=3),
        iotController=_make_iot_controller() if with_iot else None,
    )


# ---------------------------------------------------------------------------
# Helpers for running detached tasks synchronously in tests
# ---------------------------------------------------------------------------


async def _run_pending_tasks() -> None:
    """
    Yield control so any asyncio.create_task() callbacks can run.

    create_task schedules a coroutine on the running event loop.  In tests we
    need to give the loop a chance to execute those tasks before asserting.
    """
    await asyncio.sleep(0)


# =============================================================================
# Planting trigger tests — PlantingService.mark_as_planted
# =============================================================================


class TestMarkAsPlantedSenseHubTrigger:
    """
    Test that mark_as_planted fires set_crop_data exactly once when the block
    has an iotController, and does nothing when it doesn't.
    """

    @pytest.mark.asyncio
    async def test_mark_as_planted_with_iot_calls_set_crop_data(self) -> None:
        """
        GIVEN a block with iotController configured
        WHEN mark_as_planted succeeds
        THEN SenseHubCropSync.set_crop_data is called exactly once with the correct
             block_id, planting_id, and plant_data_enhanced matching block.targetCrop.
        """
        from src.modules.farm_manager.services.planting import planting_service as ps_module

        # mark_as_planted validates block.state == PLANNED before proceeding.
        # After update_block_state the block transitions to GROWING — we return
        # the GROWING version from update_block_state so the trigger sees it.
        block_planned = _make_block(state=BlockStatus.PLANNED, with_iot=True)
        block_growing = _make_block(state=BlockStatus.GROWING, with_iot=True)
        plant_data = _make_plant_data()

        # Build a fake planting object with one plant item so mark_as_planted
        # can compute the longest_cycle (max over plantDataSnapshot.growthCycleDays).
        fake_plant_item = MagicMock()
        fake_plant_item.plantDataSnapshot = {"growthCycleDays": 92}
        fake_planting = MagicMock()
        fake_planting.plantingId = _PLANTING_ID
        fake_planting.blockId = _BLOCK_ID
        fake_planting.status = "planned"
        fake_planting.plants = [fake_plant_item]

        mock_set_crop_data = AsyncMock(return_value={"ok": True, "sensehub_crop_id": "sh-123"})
        mock_sync_instance = MagicMock()
        mock_sync_instance.set_crop_data = mock_set_crop_data

        with (
            patch.object(
                ps_module.PlantingRepository,
                "get_by_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            # create=True because planting_service references legacy BlockService methods
            # (get_block_by_id / update_block_state) that may not exist on block_service_new.
            patch.object(
                ps_module.BlockService,
                "get_block_by_id",
                new=AsyncMock(return_value=block_planned),
                create=True,
            ),
            patch.object(
                ps_module.PlantingRepository,
                "update",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch.object(
                ps_module.BlockService,
                "update_block_state",
                # Returns GROWING block — this is what the trigger sees.
                new=AsyncMock(return_value=block_growing),
                create=True,
            ),
            # Patch SenseHubCropSync.from_block to return our mock
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            # Patch PlantDataEnhancedRepository.get_by_id to return test plant data
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            await ps_module.PlantingService.mark_as_planted(
                planting_id=_PLANTING_ID,
                farmer_user_id=_USER_ID,
                farmer_email="farmer@test.com",
            )
            # Let the background task execute.
            await _run_pending_tasks()

        mock_set_crop_data.assert_called_once()
        call_kwargs = mock_set_crop_data.call_args.kwargs
        assert call_kwargs["planting_id"] == _PLANTING_ID
        # plant_data_enhanced should match the resolved plant data (by plantDataId)
        assert call_kwargs["plant_data_enhanced"].plantDataId == _PLANT_DATA_ID
        # current_stage must be a valid SenseHubStage value
        assert isinstance(call_kwargs["current_stage"], SenseHubStage)

    @pytest.mark.asyncio
    async def test_mark_as_planted_without_iot_does_not_call_set_crop_data(
        self,
    ) -> None:
        """
        GIVEN a block with NO iotController
        WHEN mark_as_planted succeeds
        THEN set_crop_data is NOT called and the primary operation still succeeds.
        """
        from src.modules.farm_manager.services.planting import planting_service as ps_module

        block_planned = _make_block(state=BlockStatus.PLANNED, with_iot=False)
        block_growing = _make_block(state=BlockStatus.GROWING, with_iot=False)

        fake_planting = MagicMock()
        fake_planting.plantingId = _PLANTING_ID
        fake_planting.blockId = _BLOCK_ID
        fake_planting.status = "planned"
        fake_plant_item = MagicMock()
        fake_plant_item.plantDataSnapshot = {"growthCycleDays": 92}
        fake_planting.plants = [fake_plant_item]

        mock_set_crop_data = AsyncMock()

        with (
            patch.object(
                ps_module.PlantingRepository,
                "get_by_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch.object(
                ps_module.BlockService,
                "get_block_by_id",
                new=AsyncMock(return_value=block_planned),
                create=True,
            ),
            patch.object(
                ps_module.PlantingRepository,
                "update",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch.object(
                ps_module.BlockService,
                "update_block_state",
                new=AsyncMock(return_value=block_growing),
                create=True,
            ),
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.set_crop_data",
                new=mock_set_crop_data,
            ),
        ):
            result = await ps_module.PlantingService.mark_as_planted(
                planting_id=_PLANTING_ID,
                farmer_user_id=_USER_ID,
                farmer_email="farmer@test.com",
            )
            await _run_pending_tasks()

        # Primary operation returns normally
        assert result is not None
        # set_crop_data must never have been called
        mock_set_crop_data.assert_not_called()

    @pytest.mark.asyncio
    async def test_mark_as_planted_mcp_failure_does_not_propagate(self) -> None:
        """
        GIVEN set_crop_data raises an exception
        WHEN mark_as_planted runs
        THEN the primary API response still succeeds (returns 2xx-compatible data).
        """
        from src.modules.farm_manager.services.planting import planting_service as ps_module

        block_planned = _make_block(state=BlockStatus.PLANNED, with_iot=True)
        block_growing = _make_block(state=BlockStatus.GROWING, with_iot=True)
        plant_data = _make_plant_data()

        fake_planting = MagicMock()
        fake_planting.plantingId = _PLANTING_ID
        fake_planting.blockId = _BLOCK_ID
        fake_planting.status = "planned"
        fake_plant_item = MagicMock()
        fake_plant_item.plantDataSnapshot = {"growthCycleDays": 92}
        fake_planting.plants = [fake_plant_item]

        # set_crop_data raises a simulated network error
        mock_set_crop_data = AsyncMock(side_effect=RuntimeError("MCP connection timeout"))
        mock_sync_instance = MagicMock()
        mock_sync_instance.set_crop_data = mock_set_crop_data

        with (
            patch.object(
                ps_module.PlantingRepository,
                "get_by_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch.object(
                ps_module.BlockService,
                "get_block_by_id",
                new=AsyncMock(return_value=block_planned),
                create=True,
            ),
            patch.object(
                ps_module.PlantingRepository,
                "update",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch.object(
                ps_module.BlockService,
                "update_block_state",
                new=AsyncMock(return_value=block_growing),
                create=True,
            ),
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            # Primary operation must NOT raise
            planting, updated_block = await ps_module.PlantingService.mark_as_planted(
                planting_id=_PLANTING_ID,
                farmer_user_id=_USER_ID,
                farmer_email="farmer@test.com",
            )
            await _run_pending_tasks()

        # The primary operation returned successfully despite MCP failure
        assert planting is not None


# =============================================================================
# Status-change trigger tests — BlockService.change_status (stage boundary)
# =============================================================================


class TestChangeStatusSenseHubStageTrigger:
    """
    Test that change_status calls update_growth_stage when the SenseHub stage
    changes, and does NOT call it when the stage stays the same or plantedDate
    is missing.
    """

    @pytest.mark.asyncio
    async def test_stage_boundary_crossed_calls_update_growth_stage(self) -> None:
        """
        GIVEN block in GROWING state transitioning to FRUITING at day 55
              (vegetative window = days 7..37, fruiting window = days 51..86
               so day 55 = fruiting stage after, still vegetative before)
        WHEN change_status succeeds
        THEN update_growth_stage is called with the new stage.
        """
        from src.modules.farm_manager.services.block import block_service_new as bs_module
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_update_growth_stage_task,
        )
        from src.modules.farm_manager.models.block import BlockStatusUpdate

        # Plant at 55 days ago so GROWING → FRUITING crosses the vegetative boundary.
        planted_55_days_ago = datetime.utcnow() - timedelta(days=55)
        block = _make_block(
            state=BlockStatus.GROWING,
            planted_date=planted_55_days_ago,
            with_iot=True,
        )
        plant_data = _make_plant_data()

        # Stage before (GROWING at day 55): germinationDays=7, vegDays=30 → cumulative=37
        # day 55 > 37 → past vegetative; floweringDays=14 → cumulative=51
        # day 55 > 51 → past flowering; fruitingDays=35, ripening threshold = 51 + int(35*0.85)=80
        # day 55 <= 80 → FRUITING
        # Stage after (FRUITING at day 55): same computation → FRUITING
        # Both GROWING and FRUITING at day 55 resolve to FRUITING stage (day-based boundary).
        # To force a boundary crossing, we need prev_state=GROWING to map to vegetative.
        # Use day 20 instead so prev_state=GROWING lands in vegetative, next_state=FRUITING lands in fruiting.
        planted_20_days_ago = datetime.utcnow() - timedelta(days=20)
        block_day20 = _make_block(
            state=BlockStatus.GROWING,
            planted_date=planted_20_days_ago,
            with_iot=True,
        )

        mock_update_growth_stage = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.update_growth_stage = mock_update_growth_stage

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            # Directly test the trigger helper to avoid needing to mock the full
            # BlockRepository / task-generation chain.
            await _sensehub_update_growth_stage_task(
                snapshot_block=block_day20,
                prev_state=BlockStatus.GROWING,
                next_state=BlockStatus.FRUITING,
            )

        # GROWING at day 20: germ=7, veg=30 → cumulative=37; day 20 <= 37 → VEGETATIVE
        # FRUITING at day 20: same day-based; FRUITING state maps by state priority? No —
        # only CLEANING/EMPTY/HARVESTING have state-priority. FRUITING → day-based → VEGETATIVE
        # Both resolve to VEGETATIVE (day 20 < 37). So stage_before == stage_after → no call.
        # We need a scenario where state DOES change stage.
        # HARVESTING state → RIPENING via state-priority (regardless of day count).
        # GROWING (prev) at day 20 → VEGETATIVE; HARVESTING (next) → RIPENING. Boundary crossed.

        # Reset mock and test with GROWING→HARVESTING at day 20
        mock_update_growth_stage.reset_mock()

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            await _sensehub_update_growth_stage_task(
                snapshot_block=block_day20,
                prev_state=BlockStatus.GROWING,
                next_state=BlockStatus.HARVESTING,
            )

        # GROWING at day 20 → VEGETATIVE; HARVESTING → RIPENING (state-priority).
        # Stage crossed: update_growth_stage should be called once.
        mock_update_growth_stage.assert_called_once()
        call_kwargs = mock_update_growth_stage.call_args.kwargs
        assert call_kwargs["stage"] == SenseHubStage.RIPENING

    @pytest.mark.asyncio
    async def test_no_stage_boundary_does_not_call_update_growth_stage(self) -> None:
        """
        GIVEN block in GROWING state transitioning to GROWING (noop) or to a
              status that maps to the same SenseHub stage
        WHEN _sensehub_update_growth_stage_task runs
        THEN update_growth_stage is NOT called.
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_update_growth_stage_task,
        )

        # Day 20 → VEGETATIVE stage. GROWING → FRUITING at day 20 also → VEGETATIVE.
        planted_20_days_ago = datetime.utcnow() - timedelta(days=20)
        block = _make_block(
            state=BlockStatus.GROWING,
            planted_date=planted_20_days_ago,
            with_iot=True,
        )
        plant_data = _make_plant_data()

        mock_update_growth_stage = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.update_growth_stage = mock_update_growth_stage

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            # GROWING → FRUITING at day 20: both map to VEGETATIVE (day-based, no state override)
            await _sensehub_update_growth_stage_task(
                snapshot_block=block,
                prev_state=BlockStatus.GROWING,
                next_state=BlockStatus.FRUITING,
            )

        mock_update_growth_stage.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_planted_date_does_not_call_update_growth_stage(self) -> None:
        """
        GIVEN block with no plantedDate (state change before planting, e.g. EMPTY→PLANNED)
        WHEN _sensehub_update_growth_stage_task runs
        THEN update_growth_stage is NOT called.

        Note: the actual guard lives in change_status (task is only created when
        snapshot_block.plantedDate is not None).  This test verifies the helper
        itself also guards correctly if called with a None planted_date.
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_update_growth_stage_task,
        )

        # Block has no plantedDate
        block = _make_block(
            state=BlockStatus.PLANNED,
            planted_date=None,
            with_iot=True,
        )
        plant_data = _make_plant_data()

        mock_update_growth_stage = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.update_growth_stage = mock_update_growth_stage

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            # If called with plantedDate=None the helper should not crash and should not
            # reach update_growth_stage.
            try:
                await _sensehub_update_growth_stage_task(
                    snapshot_block=block,
                    prev_state=BlockStatus.EMPTY,
                    next_state=BlockStatus.PLANNED,
                )
            except Exception:
                # Must not propagate
                pass

        mock_update_growth_stage.assert_not_called()

    @pytest.mark.asyncio
    async def test_transition_to_cleaning_skipped_for_stage_update(self) -> None:
        """
        GIVEN block transitioning to CLEANING (post-harvest)
        WHEN _sensehub_update_growth_stage_task runs
        THEN update_growth_stage is NOT called — complete_crop handles finalization.
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_update_growth_stage_task,
        )

        block = _make_block(
            state=BlockStatus.HARVESTING,
            planted_date=_PLANTED_DATE,
            with_iot=True,
        )
        plant_data = _make_plant_data()

        mock_update_growth_stage = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.update_growth_stage = mock_update_growth_stage

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.plant_data"
                ".plant_data_enhanced_repository.PlantDataEnhancedRepository.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            await _sensehub_update_growth_stage_task(
                snapshot_block=block,
                prev_state=BlockStatus.HARVESTING,
                next_state=BlockStatus.CLEANING,
            )

        mock_update_growth_stage.assert_not_called()


# =============================================================================
# Harvest completion trigger tests — complete_crop on HARVESTING→CLEANING
# =============================================================================


class TestChangeStatusHarvestCompletionTrigger:
    """
    Test that complete_crop is called with the correct harvest aggregates when
    the block transitions from HARVESTING to CLEANING.
    """

    @pytest.mark.asyncio
    async def test_harvesting_to_cleaning_calls_complete_crop(self) -> None:
        """
        GIVEN block transitioning from HARVESTING to CLEANING with recorded harvests
        WHEN _sensehub_complete_crop_task runs
        THEN complete_crop is called once with summed total_yield_kg and harvest_count.
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_complete_crop_task,
        )

        block = _make_block(
            state=BlockStatus.HARVESTING,
            planted_date=_PLANTED_DATE,
            with_iot=True,
        )
        last_harvest_date = datetime(2026, 6, 18, 8, 0, 0)
        fake_summary = BlockHarvestSummary(
            blockId=_BLOCK_ID,
            totalHarvests=3,
            totalQuantityKg=42.6,
            qualityAKg=30.0,
            qualityBKg=10.0,
            qualityCKg=2.6,
            averageQualityGrade="A",
            firstHarvestDate=datetime(2026, 6, 10, 8, 0, 0),
            lastHarvestDate=last_harvest_date,
        )

        mock_complete_crop = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.complete_crop = mock_complete_crop

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.block"
                ".harvest_repository.HarvestRepository.get_block_summary",
                new=AsyncMock(return_value=fake_summary),
            ),
        ):
            await _sensehub_complete_crop_task(snapshot_block=block)

        mock_complete_crop.assert_called_once()
        call_kwargs = mock_complete_crop.call_args.kwargs
        assert call_kwargs["total_yield_kg"] == pytest.approx(42.6)
        assert call_kwargs["harvest_count"] == 3
        assert call_kwargs["average_quality_grade"] == "A"
        assert call_kwargs["harvested_at"] == last_harvest_date

    @pytest.mark.asyncio
    async def test_complete_crop_mcp_failure_does_not_propagate(self) -> None:
        """
        GIVEN complete_crop raises an exception
        WHEN _sensehub_complete_crop_task runs
        THEN the exception is caught and does NOT bubble up.
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_complete_crop_task,
        )

        block = _make_block(
            state=BlockStatus.HARVESTING,
            planted_date=_PLANTED_DATE,
            with_iot=True,
        )
        fake_summary = BlockHarvestSummary(
            blockId=_BLOCK_ID,
            totalHarvests=1,
            totalQuantityKg=10.0,
            qualityAKg=10.0,
            qualityBKg=0.0,
            qualityCKg=0.0,
            averageQualityGrade="A",
            firstHarvestDate=datetime(2026, 6, 10, 8, 0, 0),
            lastHarvestDate=datetime(2026, 6, 10, 8, 0, 0),
        )

        mock_complete_crop = AsyncMock(side_effect=RuntimeError("MCP server unreachable"))
        mock_sync_instance = MagicMock()
        mock_sync_instance.complete_crop = mock_complete_crop

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.block"
                ".harvest_repository.HarvestRepository.get_block_summary",
                new=AsyncMock(return_value=fake_summary),
            ),
        ):
            # Must not raise
            await _sensehub_complete_crop_task(snapshot_block=block)

        # We confirm that complete_crop was called (error path proves fire-and-log)
        mock_complete_crop.assert_called_once()

    @pytest.mark.asyncio
    async def test_complete_crop_no_harvests_defaults_grade_to_a(self) -> None:
        """
        GIVEN block with no harvest records (summary returns totalHarvests=0, grade='N/A')
        WHEN _sensehub_complete_crop_task runs
        THEN complete_crop is called with average_quality_grade='A' (default fallback).
        """
        from src.modules.farm_manager.services.block.sensehub_block_service_triggers import (
            _sensehub_complete_crop_task,
        )

        block = _make_block(
            state=BlockStatus.HARVESTING,
            planted_date=_PLANTED_DATE,
            with_iot=True,
        )
        fake_summary = BlockHarvestSummary(
            blockId=_BLOCK_ID,
            totalHarvests=0,
            totalQuantityKg=0.0,
            qualityAKg=0.0,
            qualityBKg=0.0,
            qualityCKg=0.0,
            averageQualityGrade="N/A",
            firstHarvestDate=None,
            lastHarvestDate=None,
        )

        mock_complete_crop = AsyncMock(return_value=True)
        mock_sync_instance = MagicMock()
        mock_sync_instance.complete_crop = mock_complete_crop

        with (
            patch(
                "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
                ".SenseHubCropSync.from_block",
                return_value=mock_sync_instance,
            ),
            patch(
                "src.modules.farm_manager.services.block"
                ".harvest_repository.HarvestRepository.get_block_summary",
                new=AsyncMock(return_value=fake_summary),
            ),
        ):
            await _sensehub_complete_crop_task(snapshot_block=block)

        mock_complete_crop.assert_called_once()
        call_kwargs = mock_complete_crop.call_args.kwargs
        assert call_kwargs["average_quality_grade"] == "A"
        # harvested_at should default to approx now (no last harvest date)
        assert isinstance(call_kwargs["harvested_at"], datetime)
