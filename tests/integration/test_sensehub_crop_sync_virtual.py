"""
Integration tests for T-007 — SenseHub virtual-block sync architecture.

Covers the T-007 changes to SenseHubCropSync.from_block() and the
_reconcile_crop_data() virtual-child expansion logic.

All BlockRepository calls are patched — no real MongoDB, no real MCP calls.

Scenarios (6 new tests):

  1. from_block(virtual_child)  — parent has iotController → returns SenseHubCropSync
  2. from_block(virtual_child)  — parent has no iotController, grandparent does
                                   → walks two levels, returns SenseHubCropSync
  3. from_block(virtual_child)  — no ancestor has iotController → returns None
  4. from_block(virtual_child)  — parentBlockId points to deleted/missing parent
                                   → returns None, WARNING logged
  5. Reconciliation skips iot_parent that has virtual children; iterates children
  6. Reconciliation handles iot_parent without children (T-006 flow) unchanged

Run inside the Docker container:
    docker exec a64core-api-dev python -m pytest tests/integration/test_sensehub_crop_sync_virtual.py -v

Or from a local virtualenv with src/ on PYTHONPATH:
    python -m pytest tests/integration/test_sensehub_crop_sync_virtual.py -v
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
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
from src.modules.farm_manager.services.sensehub.sensehub_stage_mapper import SenseHubStage

# ---------------------------------------------------------------------------
# Shared UUID constants
# ---------------------------------------------------------------------------
_FARM_ID = uuid4()
_PLANT_DATA_ID = uuid4()
_PLANTING_ID = uuid4()
_USER_ID = uuid4()
_PLANTED_DATE = datetime(2026, 3, 15, 0, 0, 0)  # naive UTC


# ---------------------------------------------------------------------------
# Block repository patch path
# ---------------------------------------------------------------------------
_BLOCK_REPO_GET_BY_ID_PATH = (
    "src.modules.farm_manager.services.block"
    ".block_repository_new.BlockRepository.get_by_id"
)
_BLOCK_REPO_GET_CHILDREN_PATH = (
    "src.modules.farm_manager.services.block"
    ".block_repository_new.BlockRepository.get_children_by_parent"
)
_CROP_SYNC_FROM_BLOCK_PATH = (
    "src.modules.farm_manager.services.sensehub.sensehub_crop_sync"
    ".SenseHubCropSync.from_block"
)
_PLANTING_REPO_PATH = (
    "src.modules.farm_manager.services.planting"
    ".planting_repository.PlantingRepository"
)
_PLANT_DATA_REPO_PATH = (
    "src.modules.farm_manager.services.plant_data"
    ".plant_data_enhanced_repository.PlantDataEnhancedRepository"
)


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------


def _make_iot_controller(
    address: str = "192.168.1.50",
    mcp_port: int = 3001,
    api_key: str = "test-api-key-abc123",
) -> IoTController:
    """IoT controller with a valid mcpApiKey."""
    return IoTController(
        address=address,
        mcpPort=mcp_port,
        mcpApiKey=api_key,
    )


def _make_growth_cycle() -> GrowthCycleDuration:
    return GrowthCycleDuration(
        germinationDays=7,
        vegetativeDays=30,
        floweringDays=14,
        fruitingDays=35,
        harvestDurationDays=6,
        totalCycleDays=92,
    )


def _make_plant_data() -> PlantDataEnhanced:
    """Minimal but valid PlantDataEnhanced document."""
    return PlantDataEnhanced(
        plantDataId=_PLANT_DATA_ID,
        plantName="Capsicum Green",
        scientificName="Capsicum annuum",
        farmTypeCompatibility=[FarmTypeEnum.GREENHOUSE],
        growthCycle=_make_growth_cycle(),
        yieldInfo=YieldInfo(yieldPerPlant=1.5, yieldUnit="kg"),
        environmentalRequirements=EnvironmentalRequirements(
            temperature=TemperatureRange(
                minCelsius=18, maxCelsius=30, optimalCelsius=24
            ),
            humidity=HumidityRange(
                minPercentage=50, maxPercentage=80, optimalPercentage=65
            ),
        ),
        soilRequirements=SoilRequirements(
            phRequirements=PHRequirements(minPH=6.0, maxPH=6.8, optimalPH=6.4),
            soilTypes=[SoilTypeEnum.LOAMY],
        ),
        wateringRequirements=WateringRequirements(
            frequencyDays=2,
            amountPerPlantLiters=1.0,
        ),
        lightRequirements=LightRequirements(
            lightType=LightTypeEnum.FULL_SUN,
            minHoursDaily=8.0,
            maxHoursDaily=14.0,
            optimalHoursDaily=12.0,
        ),
        createdBy=_USER_ID,
        createdByEmail="test@a64core.com",
    )


def _make_virtual_block(
    block_id: Optional[UUID] = None,
    parent_block_id: Optional[UUID] = None,
    state: BlockStatus = BlockStatus.HARVESTING,
) -> Block:
    """Build a virtual child block (no iotController of its own)."""
    return Block(
        blockId=block_id or uuid4(),
        farmId=_FARM_ID,
        maxPlants=1000,
        state=state,
        blockCategory="virtual",
        parentBlockId=parent_block_id,
        targetCrop=_PLANT_DATA_ID,
        targetCropName="Capsicum Green",
        actualPlantCount=1000,
        plantedDate=_PLANTED_DATE,
        kpi=BlockKPI(predictedYieldKg=1500.0, actualYieldKg=0.0, totalHarvests=0),
        iotController=None,  # virtual children never hold iotController directly
    )


def _make_physical_block(
    block_id: Optional[UUID] = None,
    parent_block_id: Optional[UUID] = None,
    with_iot: bool = True,
    state: BlockStatus = BlockStatus.PARTIAL,
) -> Block:
    """Build a physical parent block (iotController on parent)."""
    return Block(
        blockId=block_id or uuid4(),
        farmId=_FARM_ID,
        maxPlants=500,
        state=state,
        blockCategory="physical",
        parentBlockId=parent_block_id,
        targetCrop=None,
        plantedDate=None,
        kpi=BlockKPI(predictedYieldKg=0.0, actualYieldKg=0.0, totalHarvests=0),
        iotController=_make_iot_controller() if with_iot else None,
    )


def _block_to_raw_dict(block: Block) -> Dict[str, Any]:
    """Convert Block model to raw dict (as MongoDB would return it)."""
    d = block.model_dump(mode="json")
    for field in ("blockId", "farmId", "targetCrop", "parentBlockId"):
        if d.get(field) is not None:
            d[field] = str(d[field])
    return d


def _make_sync_service() -> Any:
    """Create a bare SenseHubSyncService instance for testing."""
    from src.modules.farm_manager.services.sensehub.sync_service import (
        SenseHubSyncService,
    )

    SenseHubSyncService._instance = None
    svc = SenseHubSyncService.get_instance()
    svc._db = None
    return svc


def _make_fake_planting(
    planting_id: UUID = _PLANTING_ID,
) -> MagicMock:
    """Build a minimal fake Planting object."""
    fake = MagicMock()
    fake.plantingId = planting_id
    fake.status = "planted"
    return fake


# =============================================================================
# Scenario 1 — from_block(virtual_child): parent has iotController → returns
#               SenseHubCropSync using parent's MCP creds
# =============================================================================


class TestFromBlockVirtualChildWithDirectParentIoT:
    """
    Virtual child has no iotController; physical parent does.
    from_block should walk up one level and return a SenseHubCropSync.
    """

    @pytest.mark.asyncio
    async def test_virtual_child_inherits_parent_iot_controller(self) -> None:
        """
        GIVEN a virtual child block with parentBlockId pointing to a parent with iotController
        WHEN SenseHubCropSync.from_block(virtual_child) is called
        THEN it returns a SenseHubCropSync instance (not None)
        AND the MCP client is configured from the parent's iotController
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        parent_id = uuid4()
        child_id = uuid4()
        parent = _make_physical_block(block_id=parent_id, with_iot=True)
        child = _make_virtual_block(block_id=child_id, parent_block_id=parent_id)

        with patch(_BLOCK_REPO_GET_BY_ID_PATH, new=AsyncMock(return_value=parent)):
            result = await SenseHubCropSync.from_block(child)

        assert result is not None, "Expected SenseHubCropSync but got None"
        # MCP address should reflect parent's iotController settings
        assert "192.168.1.50" in result._mcp_address
        assert "3001" in result._mcp_address

    @pytest.mark.asyncio
    async def test_from_block_called_with_correct_parent_id(self) -> None:
        """
        GIVEN a virtual child with a specific parentBlockId
        WHEN from_block is called
        THEN BlockRepository.get_by_id is called with that parent UUID
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        parent_id = uuid4()
        child = _make_virtual_block(parent_block_id=parent_id)
        parent = _make_physical_block(block_id=parent_id, with_iot=True)

        mock_get_by_id = AsyncMock(return_value=parent)
        with patch(_BLOCK_REPO_GET_BY_ID_PATH, new=mock_get_by_id):
            await SenseHubCropSync.from_block(child)

        mock_get_by_id.assert_called_once_with(parent_id)


# =============================================================================
# Scenario 2 — from_block walks two levels up (grandparent has iotController)
# =============================================================================


class TestFromBlockVirtualChildGrandparentIoT:
    """
    Virtual child → parent (no iotController) → grandparent (has iotController).
    from_block must walk two levels up and return the correct SenseHubCropSync.
    """

    @pytest.mark.asyncio
    async def test_grandparent_iot_resolved_after_two_level_walk(self) -> None:
        """
        GIVEN a chain: virtual_child → parent (no iot) → grandparent (has iot)
        WHEN from_block(virtual_child) is called
        THEN it returns a SenseHubCropSync configured from grandparent's iotController
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        grandparent_id = uuid4()
        parent_id = uuid4()
        child_id = uuid4()

        grandparent = _make_physical_block(
            block_id=grandparent_id,
            with_iot=True,
        )
        # Override grandparent's iotController address for identification
        grandparent.iotController.address = "10.0.0.99"  # type: ignore[union-attr]
        grandparent.iotController.mcpApiKey = "grandparent-key"  # type: ignore[union-attr]

        parent = _make_physical_block(
            block_id=parent_id,
            parent_block_id=grandparent_id,
            with_iot=False,
        )
        child = _make_virtual_block(
            block_id=child_id,
            parent_block_id=parent_id,
        )

        def _mock_get_by_id(block_id: UUID) -> Optional[Block]:
            if block_id == parent_id:
                return parent
            if block_id == grandparent_id:
                return grandparent
            return None

        with patch(
            _BLOCK_REPO_GET_BY_ID_PATH,
            new=AsyncMock(side_effect=_mock_get_by_id),
        ):
            result = await SenseHubCropSync.from_block(child)

        assert result is not None, "Expected SenseHubCropSync from grandparent but got None"
        assert "10.0.0.99" in result._mcp_address


# =============================================================================
# Scenario 3 — No ancestor has iotController → returns None
# =============================================================================


class TestFromBlockNoAncestorIoT:
    """
    Chain has no iotController at any level → from_block returns None.
    """

    @pytest.mark.asyncio
    async def test_no_iot_in_chain_returns_none(self) -> None:
        """
        GIVEN a virtual child whose parent chain has no iotController anywhere
        WHEN from_block(virtual_child) is called
        THEN it returns None
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        parent_id = uuid4()
        child = _make_virtual_block(parent_block_id=parent_id)
        parent = _make_physical_block(block_id=parent_id, with_iot=False)
        # parent.parentBlockId is None → chain ends after one level

        with patch(_BLOCK_REPO_GET_BY_ID_PATH, new=AsyncMock(return_value=parent)):
            result = await SenseHubCropSync.from_block(child)

        assert result is None

    @pytest.mark.asyncio
    async def test_no_parent_no_iot_returns_none(self) -> None:
        """
        GIVEN a virtual child with no parentBlockId and no iotController
        WHEN from_block is called
        THEN returns None without querying BlockRepository
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        child = _make_virtual_block(parent_block_id=None)
        mock_get_by_id = AsyncMock()

        with patch(_BLOCK_REPO_GET_BY_ID_PATH, new=mock_get_by_id):
            result = await SenseHubCropSync.from_block(child)

        assert result is None
        # Reason: no parentBlockId so BlockRepository.get_by_id should never be called.
        mock_get_by_id.assert_not_called()


# =============================================================================
# Scenario 4 — parentBlockId points to missing/deleted parent → None + WARNING
# =============================================================================


class TestFromBlockMissingParent:
    """
    parentBlockId is set but the parent no longer exists → from_block returns None
    and logs a WARNING.
    """

    @pytest.mark.asyncio
    async def test_missing_parent_returns_none_with_warning(
        self, caplog: pytest.LogCaptureFixture
    ) -> None:
        """
        GIVEN a virtual child whose parentBlockId points to a deleted block
        WHEN from_block is called
        THEN returns None
        AND a WARNING is logged mentioning the missing parent
        """
        from src.modules.farm_manager.services.sensehub.sensehub_crop_sync import (
            SenseHubCropSync,
        )

        parent_id = uuid4()
        child_id = uuid4()
        child = _make_virtual_block(block_id=child_id, parent_block_id=parent_id)

        with patch(
            _BLOCK_REPO_GET_BY_ID_PATH, new=AsyncMock(return_value=None)
        ), caplog.at_level(logging.WARNING, logger="src.modules.farm_manager.services.sensehub.sensehub_crop_sync"):
            result = await SenseHubCropSync.from_block(child)

        assert result is None
        # Verify a warning about the missing parent was logged.
        warning_logs = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert any(
            "parent not found" in r.message or str(parent_id) in r.message
            for r in warning_logs
        ), f"Expected WARNING about missing parent. Got: {[r.message for r in warning_logs]}"


# =============================================================================
# Scenario 5 — Reconciliation expands iot_parent with virtual children
# =============================================================================


class TestReconcileVirtualChildExpansion:
    """
    When an iot_parent has virtual children, reconciliation should iterate the
    children (not the parent) — each child resolved via from_block's parent-walk.
    """

    @pytest.mark.asyncio
    async def test_iot_parent_with_children_reconciles_children_not_parent(self) -> None:
        """
        GIVEN one iot_parent that has 2 virtual children (both in GROWING state)
        WHEN _reconcile_crop_data is called with [iot_parent]
        THEN blocks_checked == 2 (the two children, not the parent)
        AND from_block is called twice (once per child)
        """
        parent_id = uuid4()
        child1_id = uuid4()
        child2_id = uuid4()

        parent = _make_physical_block(block_id=parent_id, with_iot=True)
        child1 = _make_virtual_block(
            block_id=child1_id, parent_block_id=parent_id, state=BlockStatus.GROWING
        )
        child2 = _make_virtual_block(
            block_id=child2_id, parent_block_id=parent_id, state=BlockStatus.GROWING
        )

        iot_blocks = [_block_to_raw_dict(parent)]
        plant_data = _make_plant_data()
        fake_planting = _make_fake_planting()

        # Mock from_block to return a sync instance so get_crop_data can proceed.
        mock_sync = MagicMock()
        mock_sync.get_crop_data = AsyncMock(
            return_value={
                "a64core_planting_id": str(_PLANTING_ID),
                "current_stage": "vegetative",
            }
        )
        mock_sync.update_growth_stage = AsyncMock(return_value=True)

        svc = _make_sync_service()

        with (
            patch(_BLOCK_REPO_GET_CHILDREN_PATH, new=AsyncMock(return_value=[child1, child2])),
            patch(_CROP_SYNC_FROM_BLOCK_PATH, new=AsyncMock(return_value=mock_sync)),
            patch(
                f"{_PLANTING_REPO_PATH}.get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                f"{_PLANT_DATA_REPO_PATH}.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(iot_blocks)

        assert result["blocks_checked"] == 2, (
            f"Expected 2 blocks_checked (children), got {result['blocks_checked']}"
        )

    @pytest.mark.asyncio
    async def test_iot_parent_with_children_parent_not_individually_reconciled(self) -> None:
        """
        GIVEN one iot_parent that has 1 virtual child
        WHEN _reconcile_crop_data runs
        THEN from_block is called with the child's blockId (not parent's blockId)
        """
        parent_id = uuid4()
        child_id = uuid4()

        parent = _make_physical_block(block_id=parent_id, with_iot=True)
        child = _make_virtual_block(
            block_id=child_id, parent_block_id=parent_id, state=BlockStatus.GROWING
        )

        iot_blocks = [_block_to_raw_dict(parent)]
        plant_data = _make_plant_data()
        fake_planting = _make_fake_planting()

        mock_sync = MagicMock()
        mock_sync.get_crop_data = AsyncMock(
            return_value={
                "a64core_planting_id": str(_PLANTING_ID),
                "current_stage": "vegetative",
            }
        )
        mock_sync.update_growth_stage = AsyncMock(return_value=True)

        captured_blocks: List[Block] = []

        async def _capture_from_block(block: Block) -> MagicMock:
            captured_blocks.append(block)
            return mock_sync

        svc = _make_sync_service()

        with (
            patch(_BLOCK_REPO_GET_CHILDREN_PATH, new=AsyncMock(return_value=[child])),
            patch(_CROP_SYNC_FROM_BLOCK_PATH, new=AsyncMock(side_effect=_capture_from_block)),
            patch(
                f"{_PLANTING_REPO_PATH}.get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                f"{_PLANT_DATA_REPO_PATH}.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            await svc._reconcile_crop_data(iot_blocks)

        assert len(captured_blocks) == 1
        # Reason: from_block must be called with the virtual CHILD, not the parent.
        assert str(captured_blocks[0].blockId) == str(child_id), (
            f"Expected from_block called with child {child_id}, "
            f"got {captured_blocks[0].blockId}"
        )


# =============================================================================
# Scenario 6 — Reconciliation handles iot_parent WITHOUT virtual children (T-006)
# =============================================================================


class TestReconcileParentWithNoChildren:
    """
    An iot_parent that has NO virtual children is reconciled directly — this is
    the legacy T-006 flow for parents that have a crop planted directly on them.
    """

    @pytest.mark.asyncio
    async def test_iot_parent_no_children_reconciled_directly(self) -> None:
        """
        GIVEN one iot_parent with no virtual children, in GROWING state with crop
        AND SenseHub returns a matching crop record (in-sync)
        WHEN _reconcile_crop_data runs
        THEN blocks_checked == 1 (the parent itself)
        AND in_sync == 1
        """
        parent_id = uuid4()
        plant_data_id = uuid4()
        planting_id = uuid4()

        # Build parent as if it has a direct crop (T-006 scenario).
        parent = Block(
            blockId=parent_id,
            farmId=_FARM_ID,
            maxPlants=100,
            state=BlockStatus.GROWING,
            targetCrop=plant_data_id,
            targetCropName="Tomato",
            actualPlantCount=80,
            plantedDate=_PLANTED_DATE,
            kpi=BlockKPI(predictedYieldKg=240.0, actualYieldKg=0.0, totalHarvests=0),
            iotController=_make_iot_controller(),
        )

        plant_data = PlantDataEnhanced(
            plantDataId=plant_data_id,
            plantName="Tomato",
            farmTypeCompatibility=[FarmTypeEnum.GREENHOUSE],
            growthCycle=_make_growth_cycle(),
            yieldInfo=YieldInfo(yieldPerPlant=3.0, yieldUnit="kg"),
            createdBy=_USER_ID,
            createdByEmail="test@a64core.com",
        )

        fake_planting = _make_fake_planting(planting_id=planting_id)
        fake_planting.plantingId = planting_id

        mock_sync = MagicMock()
        # Return an in-sync record from SenseHub.
        mock_sync.get_crop_data = AsyncMock(
            return_value={
                "a64core_planting_id": str(planting_id),
                "current_stage": "vegetative",  # reconcile will compute stage and may differ
            }
        )
        mock_sync.update_growth_stage = AsyncMock(return_value=True)

        iot_blocks = [_block_to_raw_dict(parent)]
        svc = _make_sync_service()

        with (
            # No virtual children for this parent.
            patch(_BLOCK_REPO_GET_CHILDREN_PATH, new=AsyncMock(return_value=[])),
            patch(_CROP_SYNC_FROM_BLOCK_PATH, new=AsyncMock(return_value=mock_sync)),
            patch(
                f"{_PLANTING_REPO_PATH}.get_by_block_id",
                new=AsyncMock(return_value=fake_planting),
            ),
            patch(
                f"{_PLANT_DATA_REPO_PATH}.get_by_id",
                new=AsyncMock(return_value=plant_data),
            ),
        ):
            result = await svc._reconcile_crop_data(iot_blocks)

        # Exactly one block was reconciled: the parent itself.
        assert result["blocks_checked"] == 1, (
            f"Expected blocks_checked=1 for parent-only reconciliation, got {result['blocks_checked']}"
        )
        assert result["errors"] == 0, f"Unexpected errors: {result['error_samples']}"
