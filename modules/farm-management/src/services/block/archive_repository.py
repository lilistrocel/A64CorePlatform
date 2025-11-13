"""
Block Archive Repository - Data Access Layer

Handles all database operations for block cycle archives.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.block_archive import (
    BlockArchive, BlockArchiveAnalytics,
    CropPerformanceComparison
)
from ..database import farm_db

logger = logging.getLogger(__name__)


class ArchiveRepository:
    """Repository for BlockArchive data access"""

    @staticmethod
    async def create(archive: BlockArchive) -> BlockArchive:
        """Create a new archive record"""
        db = farm_db.get_database()

        archive_dict = archive.model_dump()
        archive_dict["archiveId"] = str(archive_dict["archiveId"])
        archive_dict["blockId"] = str(archive_dict["blockId"])
        archive_dict["farmId"] = str(archive_dict["farmId"])
        archive_dict["targetCrop"] = str(archive_dict["targetCrop"])
        archive_dict["archivedBy"] = str(archive_dict["archivedBy"])

        # Convert nested objects
        if archive_dict.get("location"):
            archive_dict["location"] = dict(archive_dict["location"])

        archive_dict["qualityBreakdown"] = dict(archive_dict["qualityBreakdown"])
        archive_dict["alertsSummary"] = dict(archive_dict["alertsSummary"])

        # Convert status changes
        archive_dict["statusChanges"] = [
            {
                "status": change["status"],
                "changedAt": change["changedAt"],
                "changedBy": str(change["changedBy"]),
                "changedByEmail": change["changedByEmail"],
                "notes": change.get("notes")
            } for change in archive_dict["statusChanges"]
        ]

        result = await db.block_archives.insert_one(archive_dict)

        if not result.inserted_id:
            raise Exception("Failed to create archive")

        logger.info(f"[Archive Repository] Created archive: {archive.archiveId} for block {archive.blockId}")
        return archive

    @staticmethod
    async def get_by_id(archive_id: UUID) -> Optional[BlockArchive]:
        """Get archive by ID"""
        db = farm_db.get_database()

        archive_doc = await db.block_archives.find_one({"archiveId": str(archive_id)})

        if not archive_doc:
            return None

        return BlockArchive(**archive_doc)

    @staticmethod
    async def get_by_block(
        block_id: UUID,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[BlockArchive], int]:
        """Get all archived cycles for a block"""
        db = farm_db.get_database()

        query = {"blockId": str(block_id)}

        # Get total count
        total = await db.block_archives.count_documents(query)

        # Get paginated results (most recent first)
        cursor = db.block_archives.find(query).sort("plantedDate", -1).skip(skip).limit(limit)
        archive_docs = await cursor.to_list(length=limit)

        archives = [BlockArchive(**doc) for doc in archive_docs]

        return archives, total

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        crop_id: Optional[UUID] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[BlockArchive], int]:
        """Get all archives for a farm with filters"""
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id)}

        if crop_id:
            query["targetCrop"] = str(crop_id)

        if start_date or end_date:
            query["plantedDate"] = {}
            if start_date:
                query["plantedDate"]["$gte"] = start_date
            if end_date:
                query["plantedDate"]["$lte"] = end_date

        # Get total count
        total = await db.block_archives.count_documents(query)

        # Get paginated results
        cursor = db.block_archives.find(query).sort("plantedDate", -1).skip(skip).limit(limit)
        archive_docs = await cursor.to_list(length=limit)

        archives = [BlockArchive(**doc) for doc in archive_docs]

        return archives, total

    @staticmethod
    async def get_by_crop(
        crop_id: UUID,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[BlockArchive], int]:
        """Get all archives for a specific crop"""
        db = farm_db.get_database()

        query = {"targetCrop": str(crop_id)}

        # Get total count
        total = await db.block_archives.count_documents(query)

        # Get paginated results
        cursor = db.block_archives.find(query).sort("yieldEfficiencyPercent", -1).skip(skip).limit(limit)
        archive_docs = await cursor.to_list(length=limit)

        archives = [BlockArchive(**doc) for doc in archive_docs]

        return archives, total

    @staticmethod
    async def delete(archive_id: UUID) -> bool:
        """Delete an archive (use with caution - historical data)"""
        db = farm_db.get_database()

        result = await db.block_archives.delete_one({"archiveId": str(archive_id)})

        if result.deleted_count == 0:
            return False

        logger.info(f"[Archive Repository] Deleted archive: {archive_id}")
        return True

    @staticmethod
    async def get_performance_analytics(
        farm_id: Optional[UUID] = None,
        block_id: Optional[UUID] = None,
        crop_id: Optional[UUID] = None
    ) -> BlockArchiveAnalytics:
        """Get performance analytics for archived cycles"""
        db = farm_db.get_database()

        # Build match criteria
        match_criteria = {}
        if farm_id:
            match_criteria["farmId"] = str(farm_id)
        if block_id:
            match_criteria["blockId"] = str(block_id)
        if crop_id:
            match_criteria["targetCrop"] = str(crop_id)

        pipeline = [
            {"$match": match_criteria} if match_criteria else {"$match": {}},
            {
                "$group": {
                    "_id": None,
                    "totalCycles": {"$sum": 1},
                    "avgYieldEfficiency": {"$avg": "$yieldEfficiencyPercent"},
                    "avgCycleDuration": {"$avg": "$cycleDurationDays"},
                    "totalYieldKg": {"$sum": "$actualYieldKg"},
                    "bestEfficiency": {"$max": "$yieldEfficiencyPercent"},
                    "worstEfficiency": {"$min": "$yieldEfficiencyPercent"}
                }
            }
        ]

        result = await db.block_archives.aggregate(pipeline).to_list(length=1)

        if not result:
            return BlockArchiveAnalytics(
                totalCycles=0,
                averageYieldEfficiency=0.0,
                bestPerformingCycle=None,
                worstPerformingCycle=None,
                averageCycleDuration=0.0,
                totalYieldKg=0.0
            )

        data = result[0]

        # Get best and worst performing cycles
        best_cycle = None
        worst_cycle = None

        if data["totalCycles"] > 0:
            # Find best performing cycle
            best_doc = await db.block_archives.find_one(
                {**match_criteria, "yieldEfficiencyPercent": data["bestEfficiency"]},
                sort=[("yieldEfficiencyPercent", -1)]
            )
            if best_doc:
                best_cycle = BlockArchive(**best_doc)

            # Find worst performing cycle
            worst_doc = await db.block_archives.find_one(
                {**match_criteria, "yieldEfficiencyPercent": data["worstEfficiency"]},
                sort=[("yieldEfficiencyPercent", 1)]
            )
            if worst_doc:
                worst_cycle = BlockArchive(**worst_doc)

        return BlockArchiveAnalytics(
            totalCycles=data["totalCycles"],
            averageYieldEfficiency=round(data.get("avgYieldEfficiency", 0.0), 2),
            bestPerformingCycle=best_cycle,
            worstPerformingCycle=worst_cycle,
            averageCycleDuration=round(data.get("avgCycleDuration", 0.0), 1),
            totalYieldKg=round(data.get("totalYieldKg", 0.0), 2)
        )

    @staticmethod
    async def get_crop_performance_comparison(
        farm_id: Optional[UUID] = None
    ) -> List[CropPerformanceComparison]:
        """Compare performance across different crops"""
        db = farm_db.get_database()

        # Build match criteria
        match_criteria = {}
        if farm_id:
            match_criteria["farmId"] = str(farm_id)

        pipeline = [
            {"$match": match_criteria} if match_criteria else {"$match": {}},
            {
                "$group": {
                    "_id": {
                        "cropId": "$targetCrop",
                        "cropName": "$targetCropName"
                    },
                    "totalCycles": {"$sum": 1},
                    "avgYieldEfficiency": {"$avg": "$yieldEfficiencyPercent"},
                    "avgYieldKg": {"$avg": "$actualYieldKg"},
                    "avgCycleDuration": {"$avg": "$cycleDurationDays"},
                    "totalYieldKg": {"$sum": "$actualYieldKg"}
                }
            },
            {"$sort": {"avgYieldEfficiency": -1}}
        ]

        results = await db.block_archives.aggregate(pipeline).to_list(length=100)

        comparisons = []
        for data in results:
            comparisons.append(CropPerformanceComparison(
                cropName=data["_id"]["cropName"],
                cropId=UUID(data["_id"]["cropId"]),
                totalCycles=data["totalCycles"],
                averageYieldEfficiency=round(data["avgYieldEfficiency"], 2),
                averageYieldKg=round(data["avgYieldKg"], 2),
                averageCycleDuration=round(data["avgCycleDuration"], 1),
                totalYieldKg=round(data["totalYieldKg"], 2)
            ))

        return comparisons

    @staticmethod
    async def get_top_performing_blocks(
        farm_id: UUID,
        limit: int = 10
    ) -> List[dict]:
        """Get top performing blocks by average yield efficiency"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"farmId": str(farm_id)}},
            {
                "$group": {
                    "_id": {
                        "blockId": "$blockId",
                        "blockCode": "$blockCode"
                    },
                    "cycleCount": {"$sum": 1},
                    "avgEfficiency": {"$avg": "$yieldEfficiencyPercent"},
                    "totalYield": {"$sum": "$actualYieldKg"}
                }
            },
            {"$sort": {"avgEfficiency": -1}},
            {"$limit": limit}
        ]

        results = await db.block_archives.aggregate(pipeline).to_list(length=limit)

        return [
            {
                "blockId": data["_id"]["blockId"],
                "blockCode": data["_id"]["blockCode"],
                "cycleCount": data["cycleCount"],
                "avgEfficiency": round(data["avgEfficiency"], 2),
                "totalYield": round(data["totalYield"], 2)
            }
            for data in results
        ]

    @staticmethod
    async def count_cycles_for_block(block_id: UUID) -> int:
        """Get total number of archived cycles for a block"""
        db = farm_db.get_database()
        return await db.block_archives.count_documents({"blockId": str(block_id)})
