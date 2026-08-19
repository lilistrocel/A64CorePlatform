"""
Harvest Service - Business Logic Layer

Handles business logic for harvest recording and management.
Automatically adds harvests to the inventory system.
"""

from typing import Dict, List, Optional, Tuple
from uuid import UUID, uuid4
from datetime import date, datetime, time
from fastapi import HTTPException
import logging

from ...models.block_harvest import (
    BlockHarvest,
    BlockHarvestCreate,
    BlockHarvestUpdate,
    BlockHarvestSummary,
    HarvestBatchGroup,
    HarvestBatchLineCreate,
    HarvestBatchLineResult,
    HarvestBatchLookupLine,
    HarvestBatchLookupResponse,
    HarvestBatchSubmitRequest,
    HarvestBatchSubmitResponse,
    QualityGrade as HarvestQualityGrade,
)
from ...models.inventory import (
    HarvestInventory,
    InventoryType,
    ProcessingInventory,
    QualityGrade,
    MovementType,
    InventoryMovement,
    InventoryScope,
    WasteInventory,
    WasteSourceType,
    DisposalMethod,
)
from ...models.plant_mother import ProductCategory
from ...models.farming_year_config import (
    get_farming_year,
    DEFAULT_FARMING_YEAR_START_MONTH,
)
from .harvest_repository import HarvestRepository
from .block_repository_new import BlockRepository
from ..database import farm_db
from ..plant_data.plant_mother_repository import PlantMotherRepository

logger = logging.getLogger(__name__)


class HarvestService:
    """Service for Harvest business logic"""

    @staticmethod
    def _map_quality_grade(harvest_grade: HarvestQualityGrade) -> QualityGrade:
        """Map BlockHarvest quality grade to Inventory quality grade"""
        grade_mapping = {
            HarvestQualityGrade.A: QualityGrade.GRADE_A,
            HarvestQualityGrade.B: QualityGrade.GRADE_B,
            HarvestQualityGrade.C: QualityGrade.GRADE_C,
        }
        return grade_mapping.get(harvest_grade, QualityGrade.GRADE_B)

    @staticmethod
    async def record_harvest(
        harvest_data: BlockHarvestCreate,
        user_id: UUID,
        user_email: str,
        *,
        product_id: Optional[UUID] = None,
        product_name: Optional[str] = None,
        harvest_batch_id: Optional[UUID] = None,
    ) -> BlockHarvest:
        """
        Record a new harvest and update block KPI

        Automatically updates:
        - Block actualYieldKg (cumulative)
        - Block totalHarvests count
        - Block yieldEfficiencyPercent
        - Harvest Inventory (adds new inventory item)

        Args:
            product_id/product_name/harvest_batch_id: Plant Library product
                extension Stage 3 routing fields, threaded through from
                submit_harvest_batch for a sellable product line. None for
                the single-harvest endpoint (its request body has no product
                field), which keeps behaving exactly as before.
        """
        # Verify block exists and is in harvesting status
        block = await BlockRepository.get_by_id(harvest_data.blockId)
        if not block:
            raise HTTPException(404, f"Block not found: {harvest_data.blockId}")

        # Create harvest record
        harvest = await HarvestRepository.create(
            harvest_data,
            user_id,
            user_email,
            product_id=product_id,
            product_name=product_name,
            harvest_batch_id=harvest_batch_id,
        )

        # Update block KPI atomically (avoids race conditions during bulk imports)
        await BlockRepository.increment_kpi(
            harvest_data.blockId,
            yield_kg_delta=harvest_data.quantityKg,
            harvest_count_delta=1,
        )

        # Get user's organizationId for inventory
        db = farm_db.get_database()
        user_doc = await db.users.find_one({"userId": str(user_id)})
        organization_id = user_doc.get("organizationId") if user_doc else None

        # Add to Harvest Inventory automatically
        await HarvestService._add_to_inventory(
            harvest=harvest,
            block=block,
            user_id=user_id,
            organization_id=organization_id,
            product_name_override=product_name,
        )

        logger.info(
            f"[Harvest Service] Recorded harvest {harvest.harvestId} "
            f"for block {harvest_data.blockId} ({harvest_data.quantityKg}kg) "
            f"and added to inventory"
        )

        return harvest

    @staticmethod
    async def _add_to_inventory(
        harvest: BlockHarvest,
        block,
        user_id: UUID,
        organization_id: str = None,
        product_name_override: Optional[str] = None,
    ) -> None:
        """
        Add a harvest record to the inventory system.

        Each harvest event creates ONE new inventory_harvest row (no merging
        with prior harvests). This preserves per-batch dating so the FIFO
        allocation in the sales-order flow can walk batches accurately —
        oldest harvestDate first, deplete, move to the next.

        The batch's originalQuantity is set on creation and never modified;
        `quantity` decrements as stock ships. A row is "depleted" when
        quantity == 0.

        Args:
            product_name_override: The specific PlantProduct's name (Plant
                Library product extension Stage 3), when this harvest was
                recorded through the multi-line submission — takes priority
                over block.productName since a mother can yield several
                distinct sellable products (e.g. "Green Capsicum" vs "Red
                Capsicum" both under mother "Capsicum").
        """
        db = farm_db.get_database()

        # Map quality grade from BlockHarvest to Inventory
        inventory_grade = HarvestService._map_quality_grade(harvest.qualityGrade)

        # Reason (pre-existing bug fix, design doc §9 #1): this used to read
        # block.targetCropName, which is the VARIETY name (e.g. "Roma"), not
        # the product harvest/inventory/sales roll up to. block.productName
        # is the mother/product name, denormalized onto the block at plant
        # time — fall back to targetCropName only for a block whose mother
        # link hasn't been resolved yet.
        plant_name = (
            product_name_override
            or getattr(block, "productName", None)
            or getattr(block, "targetCropName", None)
            or "Unknown Crop"
        )
        plant_data_id = getattr(block, "targetCrop", None)
        product_type = "fresh"  # Default to fresh

        # Use passed organization_id, or try to get from block/farm
        org_id = organization_id
        if not org_id:
            org_id = getattr(block, "organizationId", None)
        if not org_id:
            # Fallback: try to get from farm
            farm_doc = await db.farms.find_one({"farmId": str(harvest.farmId)})
            if farm_doc:
                org_id = farm_doc.get("organizationId")

        # Compute farmingYear from the harvest date so the Inventory module's
        # year filter matches new rows out of the box.
        harvest_date_dt = harvest.harvestDate
        if not isinstance(harvest_date_dt, datetime):
            harvest_date_dt = datetime.fromisoformat(str(harvest_date_dt))
        farming_year = get_farming_year(
            harvest_date_dt, DEFAULT_FARMING_YEAR_START_MONTH
        )

        # TODO: Once plant_data exposes a `shelfLifeDays` field, set
        # `expiryDate = harvest_date_dt + timedelta(days=shelfLifeDays)` here.
        # Currently expiryDate stays None until manually set on the row.
        inventory_item = HarvestInventory(
            farmId=harvest.farmId,
            organizationId=org_id,
            inventoryScope=InventoryScope.FARM,  # Farm-specific inventory
            blockId=harvest.blockId,
            plantDataId=(
                plant_data_id if plant_data_id else harvest.blockId
            ),  # Use blockId as fallback
            plantName=plant_name,
            productType=product_type,
            quantity=harvest.quantityKg,
            originalQuantity=harvest.quantityKg,  # Immutable batch size
            unit="kg",
            reservedQuantity=0,
            availableQuantity=harvest.quantityKg,
            qualityGrade=inventory_grade,
            harvestDate=(
                harvest.harvestDate.isoformat()
                if isinstance(harvest.harvestDate, datetime)
                else harvest.harvestDate
            ),
            farmingYear=farming_year,
            currency="AED",
            notes=f"Auto-added from block harvest {harvest.harvestId}. {harvest.notes or ''}".strip(),
            createdBy=user_id,
            sourceHarvestId=harvest.harvestId,  # Link back to original harvest
        )

        # Insert into inventory
        doc = inventory_item.model_dump(mode="json")
        await db.inventory_harvest.insert_one(doc)

        # Record movement (audit row for traceability)
        movement = InventoryMovement(
            inventoryId=inventory_item.inventoryId,
            inventoryType=InventoryType.HARVEST,
            movementType=MovementType.ADDITION,
            quantityBefore=0,
            quantityChange=harvest.quantityKg,
            quantityAfter=harvest.quantityKg,
            organizationId=org_id,
            reason=f"Harvest from block {block.blockCode}",
            referenceId=str(harvest.harvestId),
            performedBy=user_id,
            performedAt=datetime.utcnow(),
        )
        await db.inventory_movements.insert_one(movement.model_dump(mode="json"))

        logger.info(
            f"[Harvest Service] Created new harvest inventory batch: {inventory_item.inventoryId} "
            f"({harvest.quantityKg}kg of {plant_name})"
        )

    @staticmethod
    async def get_harvest(harvest_id: UUID) -> BlockHarvest:
        """Get harvest by ID"""
        harvest = await HarvestRepository.get_by_id(harvest_id)

        if not harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        return harvest

    @staticmethod
    async def list_harvests_by_block(
        block_id: UUID,
        page: int = 1,
        per_page: int = 20,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        farming_year: Optional[int] = None,
    ) -> Tuple[List[BlockHarvest], int, int]:
        """
        List harvests for a block with pagination and date filters.

        Behavior depends on block category:
        - Physical blocks: Returns ALL harvests from this block + all child virtual blocks (complete history)
        - Virtual blocks: Returns ONLY harvests from this block that occurred since the block's plantedDate (current cycle)

        Optional farmingYear filter can be combined with date range filters for precise filtering.
        """
        skip = (page - 1) * per_page

        # Get block to determine category
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            # Block not found, return empty
            return [], 0, 0

        if block.blockCategory == "physical":
            # Physical block: get all harvests from this block + all child virtual blocks
            block_ids = [str(block_id)]
            if block.childBlockIds:
                block_ids.extend(block.childBlockIds)

            logger.info(
                f"[Harvest Service] Physical block {block_id}: fetching harvests from {len(block_ids)} blocks (including children)"
            )

            harvests, total = await HarvestRepository.get_harvests_for_multiple_blocks(
                block_ids, skip, per_page, start_date, end_date, farming_year
            )
        else:
            # Virtual block: get only harvests since plantedDate (current cycle)
            effective_start_date = start_date

            # If block has a plantedDate and no explicit start_date, use plantedDate as start
            if block.plantedDate and not start_date:
                effective_start_date = block.plantedDate
                logger.info(
                    f"[Harvest Service] Virtual block {block_id}: filtering harvests from plantedDate {block.plantedDate}"
                )
            elif block.plantedDate and start_date:
                # Use the later of the two dates
                effective_start_date = max(start_date, block.plantedDate)

            harvests, total = await HarvestRepository.get_by_block(
                block_id, skip, per_page, effective_start_date, end_date, farming_year
            )

        total_pages = (total + per_page - 1) // per_page

        return harvests, total, total_pages

    @staticmethod
    async def list_harvests_by_farm(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 20,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        farming_year: Optional[int] = None,
    ) -> Tuple[List[BlockHarvest], int, int]:
        """List all harvests for a farm with pagination, date filters, and farming year filter"""
        skip = (page - 1) * per_page

        harvests, total = await HarvestRepository.get_by_farm(
            farm_id, skip, per_page, start_date, end_date, farming_year
        )

        total_pages = (total + per_page - 1) // per_page

        return harvests, total, total_pages

    @staticmethod
    async def update_harvest(
        harvest_id: UUID, update_data: BlockHarvestUpdate
    ) -> BlockHarvest:
        """
        Update a harvest record and recalculate block KPI if quantity changed
        """
        # Get current harvest
        current_harvest = await HarvestRepository.get_by_id(harvest_id)
        if not current_harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        # Check if quantity is changing
        quantity_changed = (
            update_data.quantityKg is not None
            and update_data.quantityKg != current_harvest.quantityKg
        )

        # Update harvest
        updated_harvest = await HarvestRepository.update(harvest_id, update_data)

        if not updated_harvest:
            raise HTTPException(500, "Failed to update harvest")

        # Recalculate block KPI if quantity changed
        if quantity_changed:
            # Get all harvests for the block to recalculate total
            total_quantity = await HarvestRepository.get_total_quantity_for_block(
                current_harvest.blockId
            )

            await BlockRepository.update_kpi(
                current_harvest.blockId, actual_yield_kg=total_quantity
            )

            logger.info(
                f"[Harvest Service] Updated harvest {harvest_id} and recalculated block KPI"
            )

        return updated_harvest

    @staticmethod
    async def delete_harvest(harvest_id: UUID) -> bool:
        """
        Delete a harvest record and update block KPI
        """
        # Get harvest before deleting
        harvest = await HarvestRepository.get_by_id(harvest_id)
        if not harvest:
            raise HTTPException(404, f"Harvest not found: {harvest_id}")

        block_id = harvest.blockId
        quantity_to_subtract = harvest.quantityKg

        # Delete harvest
        success = await HarvestRepository.delete(harvest_id)

        if not success:
            raise HTTPException(500, "Failed to delete harvest")

        # Update block KPI atomically
        await BlockRepository.increment_kpi(
            block_id, yield_kg_delta=-quantity_to_subtract, harvest_count_delta=-1
        )

        logger.info(
            f"[Harvest Service] Deleted harvest {harvest_id} and updated block KPI"
        )
        return success

    @staticmethod
    async def get_harvest_summary(block_id: UUID) -> BlockHarvestSummary:
        """
        Get comprehensive harvest summary for a block.

        Behavior depends on block category:
        - Physical blocks: Returns summary for ALL harvests from this block + all child virtual blocks
        - Virtual blocks: Returns summary ONLY for this block (current cycle harvests)
        """
        # Get block to determine category
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            # Block not found, return empty summary
            return BlockHarvestSummary(
                blockId=block_id,
                totalHarvests=0,
                totalQuantityKg=0.0,
                qualityAKg=0.0,
                qualityBKg=0.0,
                qualityCKg=0.0,
                averageQualityGrade="N/A",
                firstHarvestDate=None,
                lastHarvestDate=None,
            )

        if block.blockCategory == "physical":
            # Physical block: get summary from this block + all child virtual blocks
            block_ids = [str(block_id)]
            if block.childBlockIds:
                block_ids.extend(block.childBlockIds)

            logger.info(
                f"[Harvest Service] Physical block {block_id}: fetching summary from {len(block_ids)} blocks"
            )

            summary = await HarvestRepository.get_summary_for_multiple_blocks(block_ids)
            # Set the correct blockId in the summary
            summary.blockId = block_id
            return summary
        else:
            # Virtual block: get summary for only this block
            return await HarvestRepository.get_block_summary(block_id)

    # ==================== Multi-line harvest batch submission ====================
    #
    # Plant Library product extension Stage 3 (design doc §5 and §3/§3.1).
    # One submission -> N product lines, each routed by its product's
    # category to exactly one destination — see the routing table in the
    # design doc. `block_harvests` NEVER gets a row for a process/waste
    # line; see §3.1 for why that would silently corrupt yield/P&L.

    @staticmethod
    async def _resolve_organization_id(
        block, farm_id: UUID, user_id: UUID
    ) -> Optional[str]:
        """Same fallback order record_harvest/_add_to_inventory already use."""
        db = farm_db.get_database()
        user_doc = await db.users.find_one({"userId": str(user_id)})
        org_id = user_doc.get("organizationId") if user_doc else None
        if org_id:
            return org_id
        org_id = getattr(block, "organizationId", None)
        if org_id:
            return org_id
        farm_doc = await db.farms.find_one({"farmId": str(farm_id)})
        return farm_doc.get("organizationId") if farm_doc else None

    @staticmethod
    async def submit_harvest_batch(
        farm_id: UUID,
        block_id: UUID,
        request: HarvestBatchSubmitRequest,
        user_id: UUID,
        user_email: str,
    ) -> HarvestBatchSubmitResponse:
        """
        Record a multi-line harvest submission, routing each line by its
        product's category. All lines share one server-generated
        harvestBatchId (never client-supplied).

        Validations (see design doc §5, §4.1a):
        - Block must exist, belong to farm_id, and have a resolvable
          product mother (block.productMotherId -> plant_mothers).
        - Every line's productId must belong to that mother's products[]
          (400 otherwise) and be active.
        - qualityGrade is required for sellable/process lines, and REJECTED
          (not silently ignored) on waste lines — harvest waste is not
          graded, and a client sending one is a signal something is wrong
          upstream (e.g. UI state bug) worth surfacing rather than eating.

        All lines are validated up-front, before anything is written, so a
        single bad line rejects the whole submission rather than partially
        routing lines then failing partway through.
        """
        block = await BlockRepository.get_by_id(block_id)
        if not block:
            raise HTTPException(404, f"Block not found: {block_id}")
        if block.farmId != farm_id:
            raise HTTPException(404, f"Block {block_id} not found in farm {farm_id}")

        if not block.productMotherId:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Block {block.blockCode or block_id} has no product "
                    "mother assigned — plant a variety before recording a "
                    "harvest"
                ),
            )

        mother = await PlantMotherRepository.get_by_id(block.productMotherId)
        if not mother:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Block {block.blockCode or block_id}'s product mother "
                    f"{block.productMotherId} no longer exists"
                ),
            )

        products_by_id = {p.productId: p for p in mother.products}

        resolved_lines = []
        for line in request.lines:
            product = products_by_id.get(line.productId)
            if not product:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Product {line.productId} does not belong to this "
                        f"block's mother '{mother.plantName}'"
                    ),
                )
            if not product.isActive:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Product '{product.name}' is inactive and cannot "
                        "be used for a new harvest line"
                    ),
                )

            if product.category == ProductCategory.WASTE:
                if line.qualityGrade is not None:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Waste line for product '{product.name}' must "
                            "not supply a qualityGrade — harvest waste is "
                            "not graded"
                        ),
                    )
            elif line.qualityGrade is None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Line for product '{product.name}' "
                        f"({product.category.value}) requires a qualityGrade"
                    ),
                )

            resolved_lines.append((line, product))

        organization_id = await HarvestService._resolve_organization_id(
            block, farm_id, user_id
        )
        if not organization_id:
            raise HTTPException(
                status_code=500,
                detail="Could not resolve an organization for this block/user",
            )

        harvest_batch_id = uuid4()
        results: List[HarvestBatchLineResult] = []

        for line, product in resolved_lines:
            if product.category == ProductCategory.SELLABLE:
                record_id = await HarvestService._route_sellable_line(
                    block_id=block_id,
                    request=request,
                    line=line,
                    product=product,
                    harvest_batch_id=harvest_batch_id,
                    user_id=user_id,
                    user_email=user_email,
                )
                destination = "block_harvests"
            elif product.category == ProductCategory.PROCESS:
                record_id = await HarvestService._route_process_line(
                    block=block,
                    farm_id=farm_id,
                    request=request,
                    line=line,
                    product=product,
                    harvest_batch_id=harvest_batch_id,
                    organization_id=organization_id,
                    user_id=user_id,
                )
                destination = "processing_inventory"
            else:  # ProductCategory.WASTE
                record_id = await HarvestService._route_waste_line(
                    block=block,
                    farm_id=farm_id,
                    request=request,
                    line=line,
                    product=product,
                    harvest_batch_id=harvest_batch_id,
                    organization_id=organization_id,
                    user_id=user_id,
                )
                destination = "inventory_waste"

            results.append(
                HarvestBatchLineResult(
                    productId=product.productId,
                    productName=product.name,
                    category=product.category.value,
                    destination=destination,
                    recordId=record_id,
                    quantity=line.quantity,
                    qualityGrade=(
                        line.qualityGrade.value if line.qualityGrade else None
                    ),
                )
            )

        logger.info(
            f"[Harvest Service] Recorded harvest batch {harvest_batch_id} for "
            f"block {block_id}: {len(results)} line(s) "
            f"({sum(1 for r in results if r.destination == 'block_harvests')} "
            "sellable, "
            f"{sum(1 for r in results if r.destination == 'processing_inventory')} "
            "process, "
            f"{sum(1 for r in results if r.destination == 'inventory_waste')} waste)"
        )

        return HarvestBatchSubmitResponse(
            harvestBatchId=harvest_batch_id,
            blockId=block_id,
            harvestDate=request.harvestDate,
            lines=results,
        )

    @staticmethod
    async def _route_sellable_line(
        *,
        block_id: UUID,
        request: HarvestBatchSubmitRequest,
        line: HarvestBatchLineCreate,
        product,
        harvest_batch_id: UUID,
        user_id: UUID,
        user_email: str,
    ) -> UUID:
        """Sellable -> block_harvests row -> inventory_harvest FIFO batch."""
        harvest_create = BlockHarvestCreate(
            blockId=block_id,
            harvestDate=request.harvestDate,
            quantityKg=line.quantity,
            qualityGrade=line.qualityGrade,
            notes=line.notes,
            farmingYear=request.farmingYear,
        )
        harvest = await HarvestService.record_harvest(
            harvest_create,
            user_id,
            user_email,
            product_id=product.productId,
            product_name=product.name,
            harvest_batch_id=harvest_batch_id,
        )
        return harvest.harvestId

    @staticmethod
    async def _route_process_line(
        *,
        block,
        farm_id: UUID,
        request: HarvestBatchSubmitRequest,
        line: HarvestBatchLineCreate,
        product,
        harvest_batch_id: UUID,
        organization_id: str,
        user_id: UUID,
    ) -> UUID:
        """Process -> NEW processing_inventory row (not block_harvests)."""
        db = farm_db.get_database()

        processing_item = ProcessingInventory(
            organizationId=organization_id,
            farmId=farm_id,
            blockId=block.blockId,
            productId=product.productId,
            productName=product.name,
            quantity=line.quantity,
            unit="kg",
            qualityGrade=line.qualityGrade,
            harvestDate=request.harvestDate,
            harvestBatchId=harvest_batch_id,
            notes=line.notes,
            createdBy=user_id,
        )
        doc = processing_item.model_dump(mode="json")
        await db.processing_inventory.insert_one(doc)

        logger.info(
            f"[Harvest Service] Created processing inventory batch: "
            f"{processing_item.inventoryId} ({line.quantity}kg of {product.name})"
        )
        return processing_item.inventoryId

    @staticmethod
    async def _route_waste_line(
        *,
        block,
        farm_id: UUID,
        request: HarvestBatchSubmitRequest,
        line: HarvestBatchLineCreate,
        product,
        harvest_batch_id: UUID,
        organization_id: str,
        user_id: UUID,
    ) -> UUID:
        """
        Waste -> inventory_waste DIRECTLY (never block_harvests). Mirrors
        the shape of the single live migrated row: sourceType='harvest',
        sourceBlockId=block, plantName set from the PRODUCT name (design
        doc §4.3), originalGrade left null (waste lines are not graded).
        """
        db = farm_db.get_database()

        block_code = getattr(block, "blockCode", None) or str(block.blockId)
        waste_item = WasteInventory(
            organizationId=organization_id,
            farmId=farm_id,
            sourceType=WasteSourceType.HARVEST,
            sourceBlockId=block.blockId,
            productId=product.productId,
            harvestBatchId=harvest_batch_id,
            plantName=product.name,
            quantity=line.quantity,
            unit="kg",
            originalGrade=None,
            wasteReason=(
                f"Recorded as waste from harvest of {product.name} on {block_code}"
            ),
            wasteDate=request.harvestDate,
            disposalMethod=DisposalMethod.PENDING,
            notes=line.notes,
            recordedBy=user_id,
        )
        doc = waste_item.model_dump(mode="json")
        await db.inventory_waste.insert_one(doc)

        logger.info(
            f"[Harvest Service] Created harvest waste record: "
            f"{waste_item.wasteId} ({line.quantity}kg of {product.name})"
        )
        return waste_item.wasteId

    # ==================== Batch lookup (design doc §7) ====================

    @staticmethod
    async def get_batch_lookup(
        block_id: UUID, harvest_date: date
    ) -> HarvestBatchLookupResponse:
        """
        Given a block + calendar date, return every line recorded for that
        block on that date across all three destinations (block_harvests,
        processing_inventory, inventory_waste), grouped by harvestBatchId so
        a mixed submission can be reviewed/edited as a unit.

        The default harvest list (GET .../harvests) is UNCHANGED — it stays
        block_harvests-only. This is a separate, deliberately more
        expensive lookup used only when editing.
        """
        db = farm_db.get_database()

        day_start = datetime.combine(harvest_date, time.min)
        day_end = datetime.combine(harvest_date, time.max)
        block_id_str = str(block_id)

        harvest_docs = await db.block_harvests.find(
            {
                "blockId": block_id_str,
                "harvestDate": {"$gte": day_start, "$lte": day_end},
            }
        ).to_list(length=1000)

        process_docs = await db.processing_inventory.find(
            {
                "blockId": block_id_str,
                "harvestDate": {"$gte": day_start, "$lte": day_end},
            }
        ).to_list(length=1000)

        waste_docs = await db.inventory_waste.find(
            {
                "sourceBlockId": block_id_str,
                "sourceType": WasteSourceType.HARVEST.value,
                "wasteDate": {"$gte": day_start, "$lte": day_end},
            }
        ).to_list(length=1000)

        lines: List[HarvestBatchLookupLine] = []
        for doc in harvest_docs:
            lines.append(
                HarvestBatchLookupLine(
                    destination="block_harvests",
                    category="sellable",
                    recordId=doc["harvestId"],
                    productId=doc.get("productId"),
                    productName=doc.get("productName"),
                    quantity=doc["quantityKg"],
                    unit="kg",
                    qualityGrade=doc.get("qualityGrade"),
                    harvestBatchId=doc.get("harvestBatchId"),
                )
            )
        for doc in process_docs:
            lines.append(
                HarvestBatchLookupLine(
                    destination="processing_inventory",
                    category="process",
                    recordId=doc["inventoryId"],
                    productId=doc.get("productId"),
                    productName=doc.get("productName"),
                    quantity=doc["quantity"],
                    unit=doc.get("unit", "kg"),
                    qualityGrade=doc.get("qualityGrade"),
                    harvestBatchId=doc.get("harvestBatchId"),
                )
            )
        for doc in waste_docs:
            lines.append(
                HarvestBatchLookupLine(
                    destination="inventory_waste",
                    category="waste",
                    recordId=doc["wasteId"],
                    productId=doc.get("productId"),
                    productName=doc.get("plantName"),
                    quantity=doc["quantity"],
                    unit=doc.get("unit", "kg"),
                    qualityGrade=None,
                    harvestBatchId=doc.get("harvestBatchId"),
                )
            )

        # Group by harvestBatchId. Legacy/single-line rows with no
        # harvestBatchId each become their own singleton group (keyed by
        # recordId) rather than being merged together under one "None"
        # bucket, which would incorrectly imply they were one submission.
        groups: Dict[str, List[HarvestBatchLookupLine]] = {}
        group_batch_id: Dict[str, Optional[UUID]] = {}
        for entry in lines:
            key = (
                str(entry.harvestBatchId)
                if entry.harvestBatchId
                else (f"__ungrouped__{entry.destination}__{entry.recordId}")
            )
            groups.setdefault(key, []).append(entry)
            group_batch_id[key] = entry.harvestBatchId

        batches = [
            HarvestBatchGroup(harvestBatchId=group_batch_id[key], lines=group_lines)
            for key, group_lines in groups.items()
        ]

        return HarvestBatchLookupResponse(
            blockId=block_id, harvestDate=harvest_date, batches=batches
        )
