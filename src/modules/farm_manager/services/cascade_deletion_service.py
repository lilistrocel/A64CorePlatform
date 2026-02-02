"""
Cascade Deletion Service

Handles complete deletion of farms and blocks with full data archival.
When a farm or block is deleted:
1. All related data is moved to deleted_* collections
2. Original data is removed from active collections
3. AI Analytics will no longer see this data

Collections:
- Active: farms, blocks, block_archives, block_harvests, alerts, farm_tasks
- Deleted: deleted_farms, deleted_blocks, deleted_block_archives, deleted_block_harvests
"""

from datetime import datetime
from typing import Dict, Any, Optional, List
from uuid import UUID
import logging

from ..services.database import farm_db

logger = logging.getLogger(__name__)


class CascadeDeletionService:
    """
    Service for cascade deletion of farms and blocks.

    This service ensures that when a farm or block is deleted:
    1. All historical data is preserved in deleted_* collections
    2. Active collections remain clean for analytics
    3. Full audit trail is maintained
    """

    @staticmethod
    async def delete_block_with_cascade(
        block_id: UUID,
        user_id: UUID,
        user_email: str,
        reason: Optional[str] = None,
        deleted_with_farm: bool = False
    ) -> Dict[str, Any]:
        """
        Delete a block and move all its data to deleted collections.

        Args:
            block_id: Block to delete
            user_id: User performing deletion
            user_email: Email of user
            reason: Optional deletion reason
            deleted_with_farm: Whether this is part of farm deletion

        Returns:
            Dict with deletion statistics
        """
        db = farm_db.get_database()
        block_id_str = str(block_id)

        logger.info(f"[Cascade Delete] Starting block deletion: {block_id}")

        # 1. Get block data
        block = await db.blocks.find_one({"blockId": block_id_str})
        if not block:
            logger.warning(f"[Cascade Delete] Block not found: {block_id}")
            return {"success": False, "error": "Block not found"}

        # Get farm info
        farm = await db.farms.find_one({"farmId": block.get("farmId")})
        farm_name = farm.get("name", "Unknown Farm") if farm else "Unknown Farm"

        # 1b. Delete virtual children first (if this is a physical block with children)
        child_block_ids = block.get("childBlockIds", [])
        virtual_children_deleted = 0
        if child_block_ids:
            logger.info(f"[Cascade Delete] Block {block_id} has {len(child_block_ids)} virtual children to delete")
            for child_id in child_block_ids:
                try:
                    child_result = await CascadeDeletionService.delete_block_with_cascade(
                        block_id=UUID(child_id),
                        user_id=user_id,
                        user_email=user_email,
                        reason=f"Deleted with parent block: {reason}" if reason else "Deleted with parent block",
                        deleted_with_farm=deleted_with_farm
                    )
                    if child_result.get("success"):
                        virtual_children_deleted += 1
                except Exception as e:
                    logger.error(f"[Cascade Delete] Failed to delete child block {child_id}: {e}")

            logger.info(f"[Cascade Delete] Deleted {virtual_children_deleted} virtual children")

        # Also find any orphaned virtual blocks that reference this as parent but aren't in childBlockIds
        orphaned_children = await db.blocks.find({"parentBlockId": block_id_str}).to_list(None)
        for orphan in orphaned_children:
            orphan_id = orphan.get("blockId")
            if orphan_id not in child_block_ids:
                try:
                    orphan_result = await CascadeDeletionService.delete_block_with_cascade(
                        block_id=UUID(orphan_id),
                        user_id=user_id,
                        user_email=user_email,
                        reason=f"Deleted with parent block: {reason}" if reason else "Deleted with parent block",
                        deleted_with_farm=deleted_with_farm
                    )
                    if orphan_result.get("success"):
                        virtual_children_deleted += 1
                except Exception as e:
                    logger.error(f"[Cascade Delete] Failed to delete orphaned child block {orphan_id}: {e}")

        # 2. Count related records
        archives_count = await db.block_archives.count_documents({"blockId": block_id_str})
        harvests_count = await db.block_harvests.count_documents({"blockId": block_id_str})
        alerts_count = await db.alerts.count_documents({"blockId": block_id_str})
        tasks_count = await db.farm_tasks.count_documents({"blockId": block_id_str})

        logger.info(
            f"[Cascade Delete] Block {block_id} has: "
            f"{archives_count} archives, {harvests_count} harvests, "
            f"{alerts_count} alerts, {tasks_count} tasks"
        )

        # 3. Calculate lifetime statistics
        total_yield = 0.0
        total_cycles = archives_count
        efficiency_sum = 0.0

        async for archive in db.block_archives.find({"blockId": block_id_str}):
            total_yield += archive.get("actualYieldKg", 0)
            efficiency_sum += archive.get("yieldEfficiencyPercent", 0)

        avg_efficiency = efficiency_sum / total_cycles if total_cycles > 0 else 0

        # 4. Create deleted block record
        deleted_block = {
            "blockId": block_id_str,
            "blockCode": block.get("blockCode"),
            "name": block.get("name"),
            "farmId": block.get("farmId"),
            "farmName": farm_name,
            "blockType": block.get("blockType", "openfield"),
            "maxPlants": block.get("maxPlants", 0),
            "actualPlantCount": block.get("actualPlantCount"),
            "area": block.get("area"),
            "areaUnit": block.get("areaUnit", "hectares"),
            "location": block.get("location"),
            "lastCrop": block.get("targetCrop"),
            "lastCropName": block.get("targetCropName"),
            "lastPlantedDate": block.get("plantedDate"),
            "lastHarvestDate": block.get("harvestCompletedDate"),
            "lastState": block.get("state", "empty"),
            "statusChanges": block.get("statusChanges", []),
            "totalYieldKg": total_yield,
            "totalCycles": total_cycles,
            "avgYieldEfficiency": round(avg_efficiency, 2),
            "createdAt": block.get("createdAt", datetime.utcnow()),
            "updatedAt": block.get("updatedAt", datetime.utcnow()),
            "deletedAt": datetime.utcnow(),
            "deletedBy": str(user_id),
            "deletedByEmail": user_email,
            "deletedWithFarm": deleted_with_farm,
            "deletionReason": reason
        }

        await db.deleted_blocks.insert_one(deleted_block)
        logger.info(f"[Cascade Delete] Created deleted_blocks record for {block_id}")

        # 5. Move block_archives to deleted_block_archives
        if archives_count > 0:
            archives = await db.block_archives.find({"blockId": block_id_str}).to_list(None)
            for archive in archives:
                archive["movedToDeletedAt"] = datetime.utcnow()
                archive["movedReason"] = "farm_deleted" if deleted_with_farm else "block_deleted"
                archive["originalCollection"] = "block_archives"

            await db.deleted_block_archives.insert_many(archives)
            await db.block_archives.delete_many({"blockId": block_id_str})
            logger.info(f"[Cascade Delete] Moved {archives_count} archives")

        # 6. Move block_harvests to deleted_block_harvests
        if harvests_count > 0:
            harvests = await db.block_harvests.find({"blockId": block_id_str}).to_list(None)
            for harvest in harvests:
                harvest["movedToDeletedAt"] = datetime.utcnow()
                harvest["movedReason"] = "farm_deleted" if deleted_with_farm else "block_deleted"

            await db.deleted_block_harvests.insert_many(harvests)
            await db.block_harvests.delete_many({"blockId": block_id_str})
            logger.info(f"[Cascade Delete] Moved {harvests_count} harvests")

        # 7. Delete alerts and tasks (these don't need preservation)
        if alerts_count > 0:
            await db.alerts.delete_many({"blockId": block_id_str})
            logger.info(f"[Cascade Delete] Deleted {alerts_count} alerts")

        if tasks_count > 0:
            await db.farm_tasks.delete_many({"blockId": block_id_str})
            logger.info(f"[Cascade Delete] Deleted {tasks_count} tasks")

        # 8. Delete the block itself
        await db.blocks.delete_one({"blockId": block_id_str})
        logger.info(f"[Cascade Delete] Deleted block: {block_id}")

        return {
            "success": True,
            "blockId": block_id_str,
            "statistics": {
                "virtualChildrenDeleted": virtual_children_deleted,
                "archivesMoved": archives_count,
                "harvestsMoved": harvests_count,
                "alertsDeleted": alerts_count,
                "tasksDeleted": tasks_count,
                "totalYieldKg": total_yield,
                "totalCycles": total_cycles
            }
        }

    @staticmethod
    async def delete_farm_with_cascade(
        farm_id: UUID,
        user_id: UUID,
        user_email: str,
        reason: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Delete a farm and ALL its blocks with full data archival.

        Args:
            farm_id: Farm to delete
            user_id: User performing deletion
            user_email: Email of user
            reason: Optional deletion reason

        Returns:
            Dict with deletion statistics
        """
        db = farm_db.get_database()
        farm_id_str = str(farm_id)

        logger.info(f"[Cascade Delete] Starting farm deletion: {farm_id}")

        # 1. Get farm data
        farm = await db.farms.find_one({"farmId": farm_id_str})
        if not farm:
            logger.warning(f"[Cascade Delete] Farm not found: {farm_id}")
            return {"success": False, "error": "Farm not found"}

        # 2. Get all blocks for this farm
        blocks = await db.blocks.find({"farmId": farm_id_str}).to_list(None)
        block_count = len(blocks)

        logger.info(f"[Cascade Delete] Farm {farm_id} has {block_count} blocks")

        # 3. Delete each block with cascade
        total_stats = {
            "blocksMoved": 0,
            "virtualChildrenDeleted": 0,
            "archivesMoved": 0,
            "harvestsMoved": 0,
            "alertsDeleted": 0,
            "tasksDeleted": 0,
            "totalYieldKg": 0.0,
            "totalCycles": 0
        }

        for block in blocks:
            block_id = UUID(block["blockId"])
            result = await CascadeDeletionService.delete_block_with_cascade(
                block_id=block_id,
                user_id=user_id,
                user_email=user_email,
                reason=f"Deleted with farm: {reason}" if reason else "Deleted with farm",
                deleted_with_farm=True
            )

            if result.get("success"):
                stats = result.get("statistics", {})
                total_stats["blocksMoved"] += 1
                total_stats["virtualChildrenDeleted"] += stats.get("virtualChildrenDeleted", 0)
                total_stats["archivesMoved"] += stats.get("archivesMoved", 0)
                total_stats["harvestsMoved"] += stats.get("harvestsMoved", 0)
                total_stats["alertsDeleted"] += stats.get("alertsDeleted", 0)
                total_stats["tasksDeleted"] += stats.get("tasksDeleted", 0)
                total_stats["totalYieldKg"] += stats.get("totalYieldKg", 0)
                total_stats["totalCycles"] += stats.get("totalCycles", 0)

        # 4. Count archives directly linked to farm (if any orphaned)
        farm_archives = await db.block_archives.count_documents({"farmId": farm_id_str})
        if farm_archives > 0:
            archives = await db.block_archives.find({"farmId": farm_id_str}).to_list(None)
            for archive in archives:
                archive["movedToDeletedAt"] = datetime.utcnow()
                archive["movedReason"] = "farm_deleted"
                archive["originalCollection"] = "block_archives"

            await db.deleted_block_archives.insert_many(archives)
            await db.block_archives.delete_many({"farmId": farm_id_str})
            total_stats["archivesMoved"] += farm_archives
            logger.info(f"[Cascade Delete] Moved {farm_archives} orphaned farm archives")

        # 5. Create deleted farm record
        deleted_farm = {
            "farmId": farm_id_str,
            "name": farm.get("name"),
            "description": farm.get("description"),
            "owner": farm.get("owner"),
            "location": farm.get("location"),
            "totalArea": farm.get("totalArea"),
            "areaUnit": farm.get("areaUnit", "hectares"),
            "numberOfStaff": farm.get("numberOfStaff"),
            "managerId": farm.get("managerId"),
            "managerEmail": farm.get("managerEmail"),
            "isActive": False,
            "createdAt": farm.get("createdAt", datetime.utcnow()),
            "updatedAt": farm.get("updatedAt", datetime.utcnow()),
            "deletedAt": datetime.utcnow(),
            "deletedBy": str(user_id),
            "deletedByEmail": user_email,
            "deletionReason": reason,
            "blockCount": block_count,
            "archiveCount": total_stats["archivesMoved"],
            "harvestCount": total_stats["harvestsMoved"]
        }

        await db.deleted_farms.insert_one(deleted_farm)
        logger.info(f"[Cascade Delete] Created deleted_farms record for {farm_id}")

        # 6. Delete the farm itself
        await db.farms.delete_one({"farmId": farm_id_str})
        logger.info(f"[Cascade Delete] Deleted farm: {farm_id}")

        return {
            "success": True,
            "farmId": farm_id_str,
            "farmName": farm.get("name"),
            "statistics": total_stats
        }

    @staticmethod
    async def cleanup_orphaned_data(user_id: UUID, user_email: str) -> Dict[str, Any]:
        """
        Find and archive any orphaned data (archives/harvests with no parent block/farm).

        This is a maintenance operation to clean up data from previous deletions
        that didn't use cascade deletion.

        Args:
            user_id: User performing cleanup
            user_email: Email of user

        Returns:
            Dict with cleanup statistics
        """
        db = farm_db.get_database()

        logger.info("[Cascade Delete] Starting orphaned data cleanup")

        # Get all valid farm and block IDs
        valid_farm_ids = set()
        valid_block_ids = set()

        async for farm in db.farms.find({}, {"farmId": 1}):
            valid_farm_ids.add(farm["farmId"])

        async for block in db.blocks.find({}, {"blockId": 1}):
            valid_block_ids.add(block["blockId"])

        logger.info(f"[Cleanup] Found {len(valid_farm_ids)} farms, {len(valid_block_ids)} blocks")

        stats = {
            "orphanedArchivesMoved": 0,
            "orphanedHarvestsMoved": 0,
            "orphanedAlertsCleaned": 0,
            "orphanedTasksCleaned": 0
        }

        # 1. Find orphaned block_archives (farmId not in valid farms OR blockId not in valid blocks)
        orphaned_archives = []
        async for archive in db.block_archives.find():
            farm_id = archive.get("farmId")
            block_id = archive.get("blockId")

            if farm_id not in valid_farm_ids or block_id not in valid_block_ids:
                archive["movedToDeletedAt"] = datetime.utcnow()
                archive["movedReason"] = "orphaned_cleanup"
                archive["originalCollection"] = "block_archives"
                orphaned_archives.append(archive)

        if orphaned_archives:
            await db.deleted_block_archives.insert_many(orphaned_archives)
            archive_ids = [a["_id"] for a in orphaned_archives]
            await db.block_archives.delete_many({"_id": {"$in": archive_ids}})
            stats["orphanedArchivesMoved"] = len(orphaned_archives)
            logger.info(f"[Cleanup] Moved {len(orphaned_archives)} orphaned archives")

        # 2. Find orphaned block_harvests
        orphaned_harvests = []
        async for harvest in db.block_harvests.find():
            farm_id = harvest.get("farmId")
            block_id = harvest.get("blockId")

            if farm_id not in valid_farm_ids or block_id not in valid_block_ids:
                harvest["movedToDeletedAt"] = datetime.utcnow()
                harvest["movedReason"] = "orphaned_cleanup"
                orphaned_harvests.append(harvest)

        if orphaned_harvests:
            await db.deleted_block_harvests.insert_many(orphaned_harvests)
            harvest_ids = [h["_id"] for h in orphaned_harvests]
            await db.block_harvests.delete_many({"_id": {"$in": harvest_ids}})
            stats["orphanedHarvestsMoved"] = len(orphaned_harvests)
            logger.info(f"[Cleanup] Moved {len(orphaned_harvests)} orphaned harvests")

        # 3. Delete orphaned alerts (don't need preservation)
        result = await db.alerts.delete_many({
            "$or": [
                {"farmId": {"$nin": list(valid_farm_ids)}},
                {"blockId": {"$nin": list(valid_block_ids)}}
            ]
        })
        stats["orphanedAlertsCleaned"] = result.deleted_count

        # 4. Delete orphaned tasks
        result = await db.farm_tasks.delete_many({
            "$or": [
                {"farmId": {"$nin": list(valid_farm_ids)}},
                {"blockId": {"$nin": list(valid_block_ids)}}
            ]
        })
        stats["orphanedTasksCleaned"] = result.deleted_count

        logger.info(f"[Cleanup] Complete: {stats}")

        return {
            "success": True,
            "cleanedBy": user_email,
            "cleanedAt": datetime.utcnow().isoformat(),
            "statistics": stats
        }
