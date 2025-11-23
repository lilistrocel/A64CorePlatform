"""
Block History Repository - Data Access Layer

Handles all database operations for block history archives.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.block_history import BlockHistoryArchive, BlockHistoryCreate
from ..database import farm_db

logger = logging.getLogger(__name__)


class BlockHistoryRepository:
    """Repository for BlockHistory data access"""

    @staticmethod
    async def create(history: BlockHistoryArchive) -> BlockHistoryArchive:
        """
        Archive a completed block cycle

        Args:
            history: BlockHistoryArchive model

        Returns:
            Created BlockHistoryArchive
        """
        db = farm_db.get_database()

        # Convert UUIDs to strings for MongoDB
        history_dict = history.model_dump()
        history_dict["historyId"] = str(history_dict["historyId"])
        history_dict["archivedBy"] = str(history_dict["archivedBy"])
        history_dict["blockId"] = str(history_dict["blockId"])
        history_dict["farmId"] = str(history_dict["farmId"])
        history_dict["targetCrop"] = str(history_dict["targetCrop"])

        # Convert nested UUID fields
        if history_dict.get("statusChanges"):
            for change in history_dict["statusChanges"]:
                change["changedBy"] = str(change["changedBy"])

        result = await db.block_history.insert_one(history_dict)

        if not result.inserted_id:
            raise Exception("Failed to create block history")

        logger.info(f"Archived block cycle: {history.blockCode} - {history.targetCropName} "
                   f"({history.cycleDurationDays} days, {history.kpi.yieldEfficiencyPercent:.1f}% efficiency)")

        return history

    @staticmethod
    async def get_by_id(history_id: UUID) -> Optional[BlockHistoryArchive]:
        """Get block history by ID"""
        db = farm_db.get_database()

        history_doc = await db.block_history.find_one({"historyId": str(history_id)})
        if not history_doc:
            return None

        # Remove MongoDB _id
        history_doc.pop("_id", None)

        return BlockHistoryArchive(**history_doc)

    @staticmethod
    async def get_by_block_id(
        block_id: UUID,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[BlockHistoryArchive], int]:
        """
        Get all historical cycles for a specific block

        Args:
            block_id: Block UUID
            page: Page number (1-indexed)
            per_page: Results per page

        Returns:
            Tuple of (list of history records, total count)
        """
        db = farm_db.get_database()

        # Build query
        query = {"blockId": str(block_id)}

        # Get total count
        total = await db.block_history.count_documents(query)

        # Get paginated results
        skip = (page - 1) * per_page
        cursor = db.block_history.find(query).sort("archivedAt", -1).skip(skip).limit(per_page)

        history_docs = await cursor.to_list(length=per_page)

        # Remove MongoDB _id from each document
        for doc in history_docs:
            doc.pop("_id", None)

        history_list = [BlockHistoryArchive(**doc) for doc in history_docs]

        return history_list, total

    @staticmethod
    async def get_by_farm_id(
        farm_id: UUID,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[BlockHistoryArchive], int]:
        """
        Get all block history for a farm

        Args:
            farm_id: Farm UUID
            page: Page number (1-indexed)
            per_page: Results per page

        Returns:
            Tuple of (list of history records, total count)
        """
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id)}

        # Get total count
        total = await db.block_history.count_documents(query)

        # Get paginated results
        skip = (page - 1) * per_page
        cursor = db.block_history.find(query).sort("archivedAt", -1).skip(skip).limit(per_page)

        history_docs = await cursor.to_list(length=per_page)

        # Remove MongoDB _id from each document
        for doc in history_docs:
            doc.pop("_id", None)

        history_list = [BlockHistoryArchive(**doc) for doc in history_docs]

        return history_list, total

    @staticmethod
    async def get_by_crop(
        target_crop: UUID,
        page: int = 1,
        per_page: int = 50
    ) -> Tuple[List[BlockHistoryArchive], int]:
        """
        Get all block history for a specific crop

        Args:
            target_crop: Plant data UUID
            page: Page number (1-indexed)
            per_page: Results per page

        Returns:
            Tuple of (list of history records, total count)
        """
        db = farm_db.get_database()

        # Build query
        query = {"targetCrop": str(target_crop)}

        # Get total count
        total = await db.block_history.count_documents(query)

        # Get paginated results
        skip = (page - 1) * per_page
        cursor = db.block_history.find(query).sort("archivedAt", -1).skip(skip).limit(per_page)

        history_docs = await cursor.to_list(length=per_page)

        # Remove MongoDB _id from each document
        for doc in history_docs:
            doc.pop("_id", None)

        history_list = [BlockHistoryArchive(**doc) for doc in history_docs]

        return history_list, total

    @staticmethod
    async def get_performance_statistics(farm_id: UUID) -> dict:
        """
        Get aggregated performance statistics for a farm

        Args:
            farm_id: Farm UUID

        Returns:
            Dictionary with performance stats
        """
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"farmId": str(farm_id)}},
            {"$group": {
                "_id": None,
                "totalCycles": {"$sum": 1},
                "avgYieldEfficiency": {"$avg": "$kpi.yieldEfficiencyPercent"},
                "avgCycleDuration": {"$avg": "$cycleDurationDays"},
                "totalYieldKg": {"$sum": "$kpi.actualYieldKg"},
                "avgOverallOffset": {"$avg": "$overallOffsetDays"},
                "performanceCategories": {
                    "$push": "$performanceCategory"
                }
            }}
        ]

        result = await db.block_history.aggregate(pipeline).to_list(length=1)

        if not result:
            return {
                "totalCycles": 0,
                "avgYieldEfficiency": 0.0,
                "avgCycleDuration": 0.0,
                "totalYieldKg": 0.0,
                "avgOverallOffset": 0.0,
                "performanceCategoryBreakdown": {}
            }

        stats = result[0]

        # Count performance categories
        category_counts = {}
        for category in stats.get("performanceCategories", []):
            category_counts[category] = category_counts.get(category, 0) + 1

        return {
            "totalCycles": stats.get("totalCycles", 0),
            "avgYieldEfficiency": round(stats.get("avgYieldEfficiency", 0.0), 2),
            "avgCycleDuration": round(stats.get("avgCycleDuration", 0.0), 1),
            "totalYieldKg": round(stats.get("totalYieldKg", 0.0), 2),
            "avgOverallOffset": round(stats.get("avgOverallOffset", 0.0), 1),
            "performanceCategoryBreakdown": category_counts
        }
