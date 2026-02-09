"""
Block Harvest Repository - Data Access Layer

Handles all database operations for block harvest records.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.block_harvest import (
    BlockHarvest, BlockHarvestCreate, BlockHarvestUpdate,
    BlockHarvestSummary, QualityGrade
)
from ...models.farming_year_config import get_farming_year, DEFAULT_FARMING_YEAR_START_MONTH
from ..database import farm_db

logger = logging.getLogger(__name__)


class HarvestRepository:
    """Repository for BlockHarvest data access"""

    @staticmethod
    async def create(harvest_data: BlockHarvestCreate, user_id: UUID, user_email: str) -> BlockHarvest:
        """Create a new harvest record"""
        db = farm_db.get_database()

        # Get farm ID from block
        block = await db.blocks.find_one({"blockId": str(harvest_data.blockId)})
        if not block:
            raise Exception(f"Block not found: {harvest_data.blockId}")

        farm_id = block["farmId"]

        # Auto-calculate farmingYear if not provided
        harvest_data_dict = harvest_data.model_dump()
        if harvest_data_dict.get("farmingYear") is None:
            # Get farming year start month from config (if available in DB)
            config_doc = await db.system_config.find_one({"configType": "farming_year_config"})
            start_month = config_doc.get("farmingYearStartMonth", DEFAULT_FARMING_YEAR_START_MONTH) if config_doc else DEFAULT_FARMING_YEAR_START_MONTH
            harvest_data_dict["farmingYear"] = get_farming_year(harvest_data.harvestDate, start_month)

        # Create harvest document
        harvest = BlockHarvest(
            **harvest_data_dict,
            farmId=UUID(farm_id),
            recordedBy=user_id,
            recordedByEmail=user_email
        )

        harvest_dict = harvest.model_dump()
        harvest_dict["harvestId"] = str(harvest_dict["harvestId"])
        harvest_dict["blockId"] = str(harvest_dict["blockId"])
        harvest_dict["farmId"] = str(harvest_dict["farmId"])
        harvest_dict["recordedBy"] = str(harvest_dict["recordedBy"])

        result = await db.block_harvests.insert_one(harvest_dict)

        if not result.inserted_id:
            raise Exception("Failed to create harvest record")

        logger.info(f"[Harvest Repository] Created harvest: {harvest.harvestId} for block {harvest.blockId} (farmingYear={harvest.farmingYear})")
        return harvest

    @staticmethod
    async def get_by_id(harvest_id: UUID) -> Optional[BlockHarvest]:
        """Get harvest by ID"""
        db = farm_db.get_database()

        harvest_doc = await db.block_harvests.find_one({"harvestId": str(harvest_id)})

        if not harvest_doc:
            return None

        return BlockHarvest(**harvest_doc)

    @staticmethod
    async def get_by_block(
        block_id: UUID,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockHarvest], int]:
        """Get harvests for a block with optional date range filter"""
        db = farm_db.get_database()

        # Build query
        query = {"blockId": str(block_id)}

        if start_date or end_date:
            query["harvestDate"] = {}
            if start_date:
                query["harvestDate"]["$gte"] = start_date
            if end_date:
                query["harvestDate"]["$lte"] = end_date

        # Get total count
        total = await db.block_harvests.count_documents(query)

        # Get paginated results (most recent first)
        cursor = db.block_harvests.find(query).sort("harvestDate", -1).skip(skip).limit(limit)
        harvest_docs = await cursor.to_list(length=limit)

        harvests = [BlockHarvest(**doc) for doc in harvest_docs]

        return harvests, total

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockHarvest], int]:
        """Get all harvests for a farm with optional date range filter"""
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id)}

        if start_date or end_date:
            query["harvestDate"] = {}
            if start_date:
                query["harvestDate"]["$gte"] = start_date
            if end_date:
                query["harvestDate"]["$lte"] = end_date

        # Get total count
        total = await db.block_harvests.count_documents(query)

        # Get paginated results
        cursor = db.block_harvests.find(query).sort("harvestDate", -1).skip(skip).limit(limit)
        harvest_docs = await cursor.to_list(length=limit)

        harvests = [BlockHarvest(**doc) for doc in harvest_docs]

        return harvests, total

    @staticmethod
    async def update(harvest_id: UUID, update_data: BlockHarvestUpdate) -> Optional[BlockHarvest]:
        """Update a harvest record"""
        db = farm_db.get_database()

        # Only update fields that are provided
        update_dict = {
            k: v for k, v in update_data.model_dump(exclude_unset=True).items()
            if v is not None
        }

        if not update_dict:
            return await HarvestRepository.get_by_id(harvest_id)

        result = await db.block_harvests.update_one(
            {"harvestId": str(harvest_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Harvest Repository] Updated harvest: {harvest_id}")
        return await HarvestRepository.get_by_id(harvest_id)

    @staticmethod
    async def delete(harvest_id: UUID) -> bool:
        """Delete a harvest record"""
        db = farm_db.get_database()

        result = await db.block_harvests.delete_one({"harvestId": str(harvest_id)})

        if result.deleted_count == 0:
            return False

        logger.info(f"[Harvest Repository] Deleted harvest: {harvest_id}")
        return True

    @staticmethod
    async def get_block_summary(block_id: UUID) -> BlockHarvestSummary:
        """Get harvest summary for a block"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"blockId": str(block_id)}},
            {
                "$group": {
                    "_id": "$blockId",
                    "totalHarvests": {"$sum": 1},
                    "totalQuantityKg": {"$sum": "$quantityKg"},
                    "qualityAKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "A"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityBKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "B"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityCKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "C"]}, "$quantityKg", 0]
                        }
                    },
                    "firstHarvestDate": {"$min": "$harvestDate"},
                    "lastHarvestDate": {"$max": "$harvestDate"}
                }
            }
        ]

        result = await db.block_harvests.aggregate(pipeline).to_list(length=1)

        if not result:
            return BlockHarvestSummary(
                blockId=block_id,
                totalHarvests=0,
                totalQuantityKg=0.0,
                qualityAKg=0.0,
                qualityBKg=0.0,
                qualityCKg=0.0,
                averageQualityGrade="N/A",
                firstHarvestDate=None,
                lastHarvestDate=None
            )

        data = result[0]

        # Calculate average quality grade
        total_kg = data["totalQuantityKg"]
        if total_kg > 0:
            a_percent = (data["qualityAKg"] / total_kg) * 100
            b_percent = (data["qualityBKg"] / total_kg) * 100

            if a_percent >= 60:
                avg_grade = "A"
            elif a_percent + b_percent >= 80:
                avg_grade = "B"
            else:
                avg_grade = "C"
        else:
            avg_grade = "N/A"

        return BlockHarvestSummary(
            blockId=block_id,
            totalHarvests=data["totalHarvests"],
            totalQuantityKg=data["totalQuantityKg"],
            qualityAKg=data["qualityAKg"],
            qualityBKg=data["qualityBKg"],
            qualityCKg=data["qualityCKg"],
            averageQualityGrade=avg_grade,
            firstHarvestDate=data.get("firstHarvestDate"),
            lastHarvestDate=data.get("lastHarvestDate")
        )

    @staticmethod
    async def get_total_quantity_for_block(block_id: UUID) -> float:
        """Get total harvested quantity for a block (quick calculation)"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"blockId": str(block_id)}},
            {"$group": {"_id": None, "total": {"$sum": "$quantityKg"}}}
        ]

        result = await db.block_harvests.aggregate(pipeline).to_list(length=1)

        if not result:
            return 0.0

        return result[0]["total"]

    @staticmethod
    async def get_harvest_count_for_block(block_id: UUID) -> int:
        """Get number of harvest events for a block"""
        db = farm_db.get_database()
        return await db.block_harvests.count_documents({"blockId": str(block_id)})

    @staticmethod
    async def get_harvests_for_multiple_blocks(
        block_ids: List[str],
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockHarvest], int]:
        """
        Get harvests for multiple blocks (used for physical block + all children).
        Returns combined harvests from all specified block IDs.
        """
        db = farm_db.get_database()

        if not block_ids:
            return [], 0

        # Build query for multiple blocks
        query = {"blockId": {"$in": block_ids}}

        if start_date or end_date:
            query["harvestDate"] = {}
            if start_date:
                query["harvestDate"]["$gte"] = start_date
            if end_date:
                query["harvestDate"]["$lte"] = end_date

        # Get total count
        total = await db.block_harvests.count_documents(query)

        # Get paginated results (most recent first)
        cursor = db.block_harvests.find(query).sort("harvestDate", -1).skip(skip).limit(limit)
        harvest_docs = await cursor.to_list(length=limit)

        harvests = [BlockHarvest(**doc) for doc in harvest_docs]

        return harvests, total

    @staticmethod
    async def get_summary_for_multiple_blocks(block_ids: List[str]) -> BlockHarvestSummary:
        """
        Get combined harvest summary for multiple blocks.
        Used for physical block history (includes all child virtual blocks).
        """
        db = farm_db.get_database()

        if not block_ids:
            return BlockHarvestSummary(
                blockId=UUID("00000000-0000-0000-0000-000000000000"),
                totalHarvests=0,
                totalQuantityKg=0.0,
                qualityAKg=0.0,
                qualityBKg=0.0,
                qualityCKg=0.0,
                averageQualityGrade="N/A",
                firstHarvestDate=None,
                lastHarvestDate=None
            )

        pipeline = [
            {"$match": {"blockId": {"$in": block_ids}}},
            {
                "$group": {
                    "_id": None,
                    "totalHarvests": {"$sum": 1},
                    "totalQuantityKg": {"$sum": "$quantityKg"},
                    "qualityAKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "A"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityBKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "B"]}, "$quantityKg", 0]
                        }
                    },
                    "qualityCKg": {
                        "$sum": {
                            "$cond": [{"$eq": ["$qualityGrade", "C"]}, "$quantityKg", 0]
                        }
                    },
                    "firstHarvestDate": {"$min": "$harvestDate"},
                    "lastHarvestDate": {"$max": "$harvestDate"}
                }
            }
        ]

        result = await db.block_harvests.aggregate(pipeline).to_list(length=1)

        if not result:
            return BlockHarvestSummary(
                blockId=UUID("00000000-0000-0000-0000-000000000000"),
                totalHarvests=0,
                totalQuantityKg=0.0,
                qualityAKg=0.0,
                qualityBKg=0.0,
                qualityCKg=0.0,
                averageQualityGrade="N/A",
                firstHarvestDate=None,
                lastHarvestDate=None
            )

        data = result[0]

        # Calculate average quality grade
        total_kg = data["totalQuantityKg"]
        if total_kg > 0:
            a_percent = (data["qualityAKg"] / total_kg) * 100
            b_percent = (data["qualityBKg"] / total_kg) * 100

            if a_percent >= 60:
                avg_grade = "A"
            elif a_percent + b_percent >= 80:
                avg_grade = "B"
            else:
                avg_grade = "C"
        else:
            avg_grade = "N/A"

        return BlockHarvestSummary(
            blockId=UUID("00000000-0000-0000-0000-000000000000"),  # Placeholder for combined
            totalHarvests=data["totalHarvests"],
            totalQuantityKg=data["totalQuantityKg"],
            qualityAKg=data["qualityAKg"],
            qualityBKg=data["qualityBKg"],
            qualityCKg=data["qualityCKg"],
            averageQualityGrade=avg_grade,
            firstHarvestDate=data.get("firstHarvestDate"),
            lastHarvestDate=data.get("lastHarvestDate")
        )
