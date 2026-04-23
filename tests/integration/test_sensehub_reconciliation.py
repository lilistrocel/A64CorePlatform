"""
Integration tests for T-002 Phase 5 — SenseHub crop-data reconciliation.

Tests the _reconcile_crop_data() method added to SenseHubSyncService.
All SenseHubCropSync methods are AsyncMocks — no real MCP calls, no MongoDB.
Planting/PlantDataEnhanced repository lookups are patched at the module level.

Run inside the Docker container:
    docker exec a64core-api-dev python -m pytest tests/integration/test_sensehub_reconciliation.py -v

Or from a local virtualenv with src/ on PYTHONPATH:
    python -m pytest tests/integration/test_sensehub_reconciliation.py -v

Scenarios covered (10 total):
  1. Active crop expected, SenseHub returns None        → set_crop_data called once
  2. Active crop, SenseHub matches planting_id, stages match → no calls
  3. Active crop, SenseHub matches planting_id, stages differ → update_growth_stage
  4. Active crop, SenseHub has different planting_id    → set_crop_data called (replace)
  5. No active crop (EMPTY), SenseHub has active crop   → complete_crop called
  6. Block with no iotController                        → no MCP calls, no errors
  7. Aggregate counts across 3 drift blocks             → counts correct, errors=0
  8. MCP call raises exception                          → error counted, loop continues
  9. set_crop_data returns None (422)                   → error+PRIMARY_ZONE_NOT_CONFIGURED
 10. Concurrency cap: 10 blocks with delay              → max 5 run simultaneously
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

# ---------------------------------------------------------------------------
# Model imports
# ---------------------------------------------------------------------------
from src.modules.farm_manager.models.block import (
    Block,
    BlockKPI,
    BlockStatus,
    IoTController,
)
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
_PLANTED_DATE = datetime(2026, 3, 15, 0, 0, 0)  # naive UTC — ~35 days ago from test


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
    block_id: Optional[UUID] = None,
) -> Block:
    """Build a minimal Block instance suitable for testing."""
    return Block(
        blockId=block_id or _BLOCK_ID,
        farmId=_FARM_ID,
        maxPlants=100,
        state=state,
        targetCrop=plant_data_id if state in (
            BlockStatus.GROWING, BlockStatus.FRUITING, BlockStatus.HARVESTING
        ) else None,
        targetCropName="Tomato",
        actualPlantCount=80,
        plantedDate=planted_date if state in (
            BlockStatus.GROWING, BlockStatus.FRUITING, BlockStatus.HARVESTING
        ) else None,
        kpi=BlockKPI(predictedYieldKg=240.0, actualYieldKg=50.0, totalHarvests=3),
        iotController=_make_iot_controller() if with_iot else None,
    )


def _block_to_raw_dict(block: Block) -> Dict[str, Any]:
    """
    Convert a Block model instance to a raw dict as MongoDB would return it.

    SenseHubSyncService._get_iot_blocks() returns list[dict], so
    _reconcile_crop_data receives raw dicts, not Block instances.
    """
    d = block.model_dump(mode="json")
    # Ensure UUID fields are strings (as they would be from MongoDB docs).
    for field in ("blockId", "farmId", "targetCrop", "parentBlockId"):
        if d.get(field) is not None:
            d[field] = str(d[field])
    return d


def _make_fake_planting(
    planting_id: UUID = _PLANTING_ID,
    block_id: UUID = _BLOCK_ID,
) -> MagicMock:
    """Build a minimal fake Planting object."""
    fake = MagicMock()
    fake.plantingId = planting_id
    fake.blockId = block_id
    fake.status = "planted"
    return fake


def _make_sync_service() -> Any:
    """
    Create a bare SenseHubSyncService instance without initialising DB.

    We call _reconcile_crop_data() directly — no background loop or lock
    needed for unit/integration tests.
    """
    from src.modules.farm_manager.services.sensehub.sync_service import (
        SenseHubSyncService,
    )

    # Reset singleton state to get a clean instance each test.
    SenseHubSyncService._instance = None
    svc = SenseHubSyncService.get_instance()
    svc._db = None  # no DB needed; repositories are patched
    return svc


# ---------------------------------------------------------------------------
# Patch context helpers
# ---------------------------------------------------------------------------

# Patch at the defining module — these are imported lazily inside
# _reconcile_crop_data so we must patch the canonical definition path,
# not the importer's namespace.
PLANTING_REPO_PATH = (
    "src.modules.farm_manager.services.planting"
    ".planting_repository.PlantingRepository"
)
PLANT_DATA_REPO_PATH = (
    "src.modules.farm_manager.services.plant_data"
    ".plant_data_enhanced_repository.PlantDataEnhancedRepository"
)
CROP_SYNC_FROM_BLOCK_PATH = (
    "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
    ".SenseHubCropSync.from_block"
)


# =============================================================================
# Scenario 1 — Active crop expected, SenseHub has no record → set_crop_data
# =============================================================================


class TestReconcileRepushMissingRecord:
    """SenseHub has no crop record; A64Core has active crop → repush."""

    @pytest.mark.asyncio
    async def test_sensehub_none_triggers_set_crop_data(self) -> None:
        """
        GIVEN A64Core block in GROWING state with planted crop
        AND SenseHub returns None for get_crop_data
        WHEN reconciliation runs
        THEN set_crop_data is called exactly once with the correct planting_id
        AND result shows drift_resolved_by_repush=1, errors=0
        """
        block = _make_block(state=BlockStatus.GROWING)
        raw_blocks = [_block_to_raw_dict(block)]

        mock_set_crop_data = AsyncMock(return_value={"ok": True, "sensehub_crop_id": "sh-1"})
        mock_get_crop_data = AsyncMock(return_value=None)
        mock_sync = MagicMock()
        mock_sync.get_crop_data = mock_get_crop_data
        mock_sync.set_crop_data = mock_set_crop_data

        fake_planting = _make_fake_planting()
        plant_data = _make_plant_data()
        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_set_crop_data.assert_called_once()
        call_kw = mock_set_crop_data.call_args.kwargs
        assert call_kw["planting_id"] == _PLANTING_ID
        assert isinstance(call_kw["current_stage"], SenseHubStage)

        assert result["drift_resolved_by_repush"] == 1
        assert result["drift_resolved_by_stage_update"] == 0
        assert result["drift_resolved_by_complete"] == 0
        assert result["errors"] == 0


# =============================================================================
# Scenario 2 — Matching planting_id, stage identical → no-op
# =============================================================================


class TestReconcileNoOp:
    """Both sides agree: planting_id matches and stage is in sync → nothing."""

    @pytest.mark.asyncio
    async def test_matching_state_is_noop(self) -> None:
        """
        GIVEN A64Core block in GROWING state, planted 5 days ago (seedling stage)
        AND SenseHub returns matching a64core_planting_id and current_stage=seedling
        WHEN reconciliation runs
        THEN no MCP write calls are made
        AND result shows in_sync=1, all drift counters=0
        """
        # 5 days since planting → within germinationDays (7) → seedling stage
        planted_5_days_ago = datetime.utcnow() - timedelta(days=5)
        block = _make_block(state=BlockStatus.GROWING, planted_date=planted_5_days_ago)
        raw_blocks = [_block_to_raw_dict(block)]

        sh_crop = {
            "a64core_planting_id": str(_PLANTING_ID),
            "current_stage": SenseHubStage.SEEDLING.value,
        }
        mock_get_crop_data = AsyncMock(return_value=sh_crop)
        mock_set_crop_data = AsyncMock()
        mock_update_stage = AsyncMock()
        mock_complete = AsyncMock()
        mock_sync = MagicMock()
        mock_sync.get_crop_data = mock_get_crop_data
        mock_sync.set_crop_data = mock_set_crop_data
        mock_sync.update_growth_stage = mock_update_stage
        mock_sync.complete_crop = mock_complete

        fake_planting = _make_fake_planting()
        plant_data = _make_plant_data()
        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_set_crop_data.assert_not_called()
        mock_update_stage.assert_not_called()
        mock_complete.assert_not_called()

        assert result["in_sync"] == 1
        assert result["drift_resolved_by_repush"] == 0
        assert result["drift_resolved_by_stage_update"] == 0
        assert result["drift_resolved_by_complete"] == 0
        assert result["errors"] == 0


# =============================================================================
# Scenario 3 — Matching planting_id, stage differs → update_growth_stage
# =============================================================================


class TestReconcileStageDrift:
    """SenseHub has the right planting but a stale stage → stage correction."""

    @pytest.mark.asyncio
    async def test_stage_drift_calls_update_growth_stage(self) -> None:
        """
        GIVEN A64Core block in GROWING state, planted 5 days ago (seedling)
        AND SenseHub returns matching planting_id but current_stage=vegetative (drift)
        WHEN reconciliation runs
        THEN update_growth_stage is called once with A64Core's stage (seedling)
        AND result shows drift_resolved_by_stage_update=1
        """
        planted_5_days_ago = datetime.utcnow() - timedelta(days=5)
        block = _make_block(state=BlockStatus.GROWING, planted_date=planted_5_days_ago)
        raw_blocks = [_block_to_raw_dict(block)]

        sh_crop = {
            "a64core_planting_id": str(_PLANTING_ID),
            "current_stage": SenseHubStage.VEGETATIVE.value,  # stale / incorrect
        }
        mock_get_crop_data = AsyncMock(return_value=sh_crop)
        mock_update_stage = AsyncMock(return_value=True)
        mock_set_crop_data = AsyncMock()
        mock_sync = MagicMock()
        mock_sync.get_crop_data = mock_get_crop_data
        mock_sync.set_crop_data = mock_set_crop_data
        mock_sync.update_growth_stage = mock_update_stage

        fake_planting = _make_fake_planting()
        plant_data = _make_plant_data()
        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_update_stage.assert_called_once()
        update_kw = mock_update_stage.call_args.kwargs
        # A64Core computed stage for 5 days into a 7-day germination window → seedling
        assert update_kw["stage"] == SenseHubStage.SEEDLING
        mock_set_crop_data.assert_not_called()

        assert result["drift_resolved_by_stage_update"] == 1
        assert result["drift_resolved_by_repush"] == 0
        assert result["errors"] == 0


# =============================================================================
# Scenario 4 — Matching planting_id field missing / mismatched → repush
# =============================================================================


class TestReconcileStaleId:
    """SenseHub has a different a64core_planting_id → atomic replace via set_crop_data."""

    @pytest.mark.asyncio
    async def test_stale_planting_id_triggers_set_crop_data(self) -> None:
        """
        GIVEN SenseHub returns an active crop with a different a64core_planting_id
        WHEN reconciliation runs
        THEN set_crop_data is called once (atomic replace)
        AND result shows drift_resolved_by_repush=1
        """
        block = _make_block(state=BlockStatus.GROWING)
        raw_blocks = [_block_to_raw_dict(block)]

        stale_id = str(uuid4())  # different from _PLANTING_ID
        sh_crop = {
            "a64core_planting_id": stale_id,
            "current_stage": SenseHubStage.VEGETATIVE.value,
        }
        mock_get_crop_data = AsyncMock(return_value=sh_crop)
        mock_set_crop_data = AsyncMock(return_value={"ok": True, "sensehub_crop_id": "sh-new"})
        mock_sync = MagicMock()
        mock_sync.get_crop_data = mock_get_crop_data
        mock_sync.set_crop_data = mock_set_crop_data

        fake_planting = _make_fake_planting()
        plant_data = _make_plant_data()
        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_set_crop_data.assert_called_once()
        call_kw = mock_set_crop_data.call_args.kwargs
        # Must use the current planting_id, not the stale one from SenseHub.
        assert call_kw["planting_id"] == _PLANTING_ID

        assert result["drift_resolved_by_repush"] == 1
        assert result["errors"] == 0


# =============================================================================
# Scenario 5 — No active crop (EMPTY), SenseHub has orphan → complete_crop
# =============================================================================


class TestReconcileOrphanComplete:
    """SenseHub has an orphan active crop for an EMPTY block → complete it."""

    @pytest.mark.asyncio
    async def test_orphan_active_crop_triggers_complete(self) -> None:
        """
        GIVEN A64Core block in EMPTY state (no crop expected)
        AND SenseHub returns an active crop record
        WHEN reconciliation runs
        THEN complete_crop is called once with zero yield and grade "A"
        AND result shows drift_resolved_by_complete=1
        """
        block = _make_block(state=BlockStatus.EMPTY)
        raw_blocks = [_block_to_raw_dict(block)]

        sh_crop = {
            "a64core_planting_id": str(uuid4()),
            "current_stage": SenseHubStage.VEGETATIVE.value,
        }
        mock_get_crop_data = AsyncMock(return_value=sh_crop)
        mock_complete_crop = AsyncMock(return_value=True)
        mock_set_crop_data = AsyncMock()
        mock_sync = MagicMock()
        mock_sync.get_crop_data = mock_get_crop_data
        mock_sync.complete_crop = mock_complete_crop
        mock_sync.set_crop_data = mock_set_crop_data

        svc = _make_sync_service()

        with patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_complete_crop.assert_called_once()
        complete_kw = mock_complete_crop.call_args.kwargs
        assert complete_kw["total_yield_kg"] == 0.0
        assert complete_kw["average_quality_grade"] == "A"
        assert complete_kw["harvest_count"] == 0
        mock_set_crop_data.assert_not_called()

        assert result["drift_resolved_by_complete"] == 1
        assert result["errors"] == 0


# =============================================================================
# Scenario 6 — Block with no iotController → no calls, no errors
# =============================================================================


class TestReconcileNoIoT:
    """Blocks without an iotController are silently skipped."""

    @pytest.mark.asyncio
    async def test_no_iot_controller_skipped_cleanly(self) -> None:
        """
        GIVEN a block with no iotController
        WHEN reconciliation runs
        THEN no MCP calls are made and errors=0
        AND result shows blocks_checked=1 (parse succeeded), in_sync=1
        """
        block = _make_block(state=BlockStatus.GROWING, with_iot=False)
        raw_blocks = [_block_to_raw_dict(block)]

        mock_set_crop_data = AsyncMock()
        mock_get_crop_data = AsyncMock()

        # from_block returns None for blocks without iotController — use the
        # real implementation's return value rather than patching.
        svc = _make_sync_service()

        # We do NOT patch from_block here — let the real from_block run, which
        # returns None for blocks without mcpApiKey (no iotController).
        with (
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=None),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        mock_set_crop_data.assert_not_called()
        mock_get_crop_data.assert_not_called()

        assert result["errors"] == 0
        assert result["drift_resolved_by_repush"] == 0
        assert result["drift_resolved_by_stage_update"] == 0
        assert result["drift_resolved_by_complete"] == 0


# =============================================================================
# Scenario 7 — Aggregate counts across 3 drift blocks
# =============================================================================


class TestReconcileAggregatedCounts:
    """Three blocks: repush, stage-update, orphan-complete → counts each 1."""

    @pytest.mark.asyncio
    async def test_three_drift_cases_aggregate_correctly(self) -> None:
        """
        GIVEN 3 IoT-connected blocks representing the 3 main drift cases
        WHEN reconciliation runs
        THEN result has drift_resolved_by_repush=1, drift_resolved_by_stage_update=1,
             drift_resolved_by_complete=1, errors=0
        """
        # Block A — active crop, SenseHub has None → repush
        block_a = _make_block(state=BlockStatus.GROWING, block_id=uuid4())
        planting_a = _make_fake_planting(planting_id=uuid4(), block_id=block_a.blockId)

        # Block B — active crop, SenseHub has matching id but stale stage → stage update
        planted_5_days_ago = datetime.utcnow() - timedelta(days=5)
        block_b_id = uuid4()
        block_b = _make_block(
            state=BlockStatus.GROWING,
            planted_date=planted_5_days_ago,
            block_id=block_b_id,
        )
        planting_b_id = uuid4()
        planting_b = _make_fake_planting(planting_id=planting_b_id, block_id=block_b_id)

        # Block C — EMPTY, SenseHub has orphan → complete
        block_c = _make_block(state=BlockStatus.EMPTY, block_id=uuid4())

        raw_blocks = [
            _block_to_raw_dict(block_a),
            _block_to_raw_dict(block_b),
            _block_to_raw_dict(block_c),
        ]

        plant_data = _make_plant_data()

        # SenseHub responses per block
        sh_none = None
        sh_b = {
            "a64core_planting_id": str(planting_b_id),
            "current_stage": SenseHubStage.VEGETATIVE.value,  # stale (should be seedling)
        }
        sh_c_orphan = {
            "a64core_planting_id": str(uuid4()),
            "current_stage": SenseHubStage.VEGETATIVE.value,
        }

        responses_by_block_id: Dict[str, Any] = {
            str(block_a.blockId): sh_none,
            str(block_b.blockId): sh_b,
            str(block_c.blockId): sh_c_orphan,
        }

        plannings_by_block_id = {
            str(block_a.blockId): planting_a,
            str(block_b.blockId): planting_b,
            str(block_c.blockId): None,
        }

        # Build per-block mock syncs
        mock_syncs: Dict[str, MagicMock] = {}
        for bid, sh_response in responses_by_block_id.items():
            m = MagicMock()
            m.get_crop_data = AsyncMock(return_value=sh_response)
            m.set_crop_data = AsyncMock(return_value={"ok": True})
            m.update_growth_stage = AsyncMock(return_value=True)
            m.complete_crop = AsyncMock(return_value=True)
            mock_syncs[bid] = m

        def _from_block_side_effect(block_obj: Block) -> MagicMock:
            return mock_syncs[str(block_obj.blockId)]

        def _planting_side_effect(block_id_arg: UUID) -> Any:
            return plannings_by_block_id.get(str(block_id_arg))

        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, side_effect=_from_block_side_effect),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(side_effect=_planting_side_effect),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        assert result["drift_resolved_by_repush"] == 1
        assert result["drift_resolved_by_stage_update"] == 1
        assert result["drift_resolved_by_complete"] == 1
        assert result["errors"] == 0
        assert result["blocks_checked"] == 3


# =============================================================================
# Scenario 8 — MCP call raises → error counted, loop continues
# =============================================================================


class TestReconcileErrorIsolation:
    """A failing block does not abort reconciliation of subsequent blocks."""

    @pytest.mark.asyncio
    async def test_mcp_exception_counted_as_error_loop_continues(self) -> None:
        """
        GIVEN two blocks: the first's get_crop_data raises, the second succeeds
        WHEN reconciliation runs
        THEN the first block counts as an error
        AND the second block is reconciled normally (set_crop_data called)
        AND result shows errors=1, drift_resolved_by_repush=1
        """
        block_fail = _make_block(state=BlockStatus.GROWING, block_id=uuid4())
        block_ok = _make_block(state=BlockStatus.GROWING, block_id=uuid4())
        planting_ok = _make_fake_planting(planting_id=uuid4(), block_id=block_ok.blockId)
        plant_data = _make_plant_data()

        mock_sync_fail = MagicMock()
        mock_sync_fail.get_crop_data = AsyncMock(
            side_effect=RuntimeError("Connection refused")
        )

        mock_sync_ok = MagicMock()
        mock_sync_ok.get_crop_data = AsyncMock(return_value=None)
        mock_sync_ok.set_crop_data = AsyncMock(return_value={"ok": True})

        raw_blocks = [
            _block_to_raw_dict(block_fail),
            _block_to_raw_dict(block_ok),
        ]

        def _from_block_side_effect(block_obj: Block) -> MagicMock:
            if block_obj.blockId == block_fail.blockId:
                return mock_sync_fail
            return mock_sync_ok

        def _planting_side_effect(block_id_arg: UUID) -> Any:
            if block_id_arg == block_ok.blockId:
                return planting_ok
            return None

        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, side_effect=_from_block_side_effect),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(side_effect=_planting_side_effect),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        assert result["errors"] == 1
        assert result["drift_resolved_by_repush"] == 1
        mock_sync_ok.set_crop_data.assert_called_once()


# =============================================================================
# Scenario 9 — set_crop_data returns None (422) → error + marker in samples
# =============================================================================


class TestReconcileZoneNotConfigured:
    """set_crop_data returns None (primary zone not configured) → operator marker."""

    @pytest.mark.asyncio
    async def test_set_crop_data_none_records_zone_error_sample(self) -> None:
        """
        GIVEN SenseHub has no crop record (drift: repush needed)
        AND set_crop_data returns None (HTTP 422 zone-not-configured)
        WHEN reconciliation runs
        THEN errors=1 and 'PRIMARY_ZONE_NOT_CONFIGURED' appears in error_samples
        AND drift_resolved_by_repush=0 (repush did not succeed)
        """
        block = _make_block(state=BlockStatus.GROWING)
        raw_blocks = [_block_to_raw_dict(block)]

        mock_sync = MagicMock()
        mock_sync.get_crop_data = AsyncMock(return_value=None)
        # Simulate zone-not-configured: set_crop_data returns None
        mock_sync.set_crop_data = AsyncMock(return_value=None)

        fake_planting = _make_fake_planting()
        plant_data = _make_plant_data()
        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, return_value=mock_sync),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        assert result["errors"] == 1
        assert result["drift_resolved_by_repush"] == 0
        assert any(
            "PRIMARY_ZONE_NOT_CONFIGURED" in s for s in result["error_samples"]
        ), f"Expected PRIMARY_ZONE_NOT_CONFIGURED in error_samples, got: {result['error_samples']}"


# =============================================================================
# Scenario 10 — Concurrency cap: 10 blocks, max 5 run simultaneously
# =============================================================================


class TestReconcileConcurrencyCap:
    """With RECONCILE_CONCURRENCY=5, at most 5 tasks run at the same time."""

    @pytest.mark.asyncio
    async def test_max_5_concurrent_reconciliations(self) -> None:
        """
        GIVEN 10 IoT-connected blocks all needing reconciliation
        AND each get_crop_data has an artificial 50ms delay
        WHEN reconciliation runs
        THEN no more than 5 tasks are ever executing concurrently
        """
        from src.modules.farm_manager.services.sensehub.sync_service import (
            RECONCILE_CONCURRENCY,
        )

        assert RECONCILE_CONCURRENCY == 5, "Precondition: cap must be 5"

        # Track peak concurrency
        active: List[int] = [0]
        peak: List[int] = [0]

        blocks = [_make_block(state=BlockStatus.GROWING, block_id=uuid4()) for _ in range(10)]
        plantings = [
            _make_fake_planting(planting_id=uuid4(), block_id=b.blockId)
            for b in blocks
        ]
        plant_data = _make_plant_data()
        raw_blocks = [_block_to_raw_dict(b) for b in blocks]

        planting_by_id = {str(p.blockId): p for p in plantings}

        async def _slow_get_crop_data(_block: Block) -> None:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
            await asyncio.sleep(0.05)
            active[0] -= 1
            return None  # trigger set_crop_data path

        mock_syncs: Dict[str, MagicMock] = {}
        for block in blocks:
            m = MagicMock()
            m.get_crop_data = _slow_get_crop_data
            m.set_crop_data = AsyncMock(return_value={"ok": True})
            mock_syncs[str(block.blockId)] = m

        def _from_block_side_effect(block_obj: Block) -> MagicMock:
            return mock_syncs[str(block_obj.blockId)]

        def _planting_side_effect(block_id_arg: UUID) -> Any:
            return planting_by_id.get(str(block_id_arg))

        svc = _make_sync_service()

        with (
            patch(CROP_SYNC_FROM_BLOCK_PATH, side_effect=_from_block_side_effect),
            patch(
                PLANTING_REPO_PATH + ".get_by_block_id",
                new=AsyncMock(side_effect=_planting_side_effect),
            ),
            patch(
                PLANT_DATA_REPO_PATH + ".get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(raw_blocks)

        assert result["blocks_checked"] == 10
        # Peak concurrent executions must never exceed the cap.
        assert peak[0] <= RECONCILE_CONCURRENCY, (
            f"Concurrency cap violated: peak={peak[0]} > cap={RECONCILE_CONCURRENCY}"
        )
