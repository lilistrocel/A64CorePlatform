"""
SenseHub Cache Query Service

Stateless query layer for reading cached SenseHub data from MongoDB.
Used by API endpoints and AI tool fallback when live SenseHub is unavailable.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from ..database import farm_db

logger = logging.getLogger(__name__)


class SenseHubCacheQueryService:
    """Stateless queries against the sensehub_*_cache collections."""

    # =========================================================================
    # Equipment
    # =========================================================================

    @staticmethod
    async def get_equipment(
        block_id: str,
        equipment_type: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get cached equipment for a block.

        Args:
            block_id: Block UUID string.
            equipment_type: Optional filter by equipment type.

        Returns:
            List of equipment documents.
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {"blockId": block_id}
        if equipment_type:
            query["type"] = equipment_type

        cursor = db["sensehub_equipment_cache"].find(
            query, {"_id": 0}
        ).sort("name", 1)
        return await cursor.to_list(length=500)

    @staticmethod
    async def get_equipment_as_list(block_id: str) -> List[Dict[str, Any]]:
        """
        Return cached equipment in the same shape as live SenseHub response.
        Used for seamless fallback in proxy endpoints and AI tools.
        """
        docs = await SenseHubCacheQueryService.get_equipment(block_id)
        result = []
        for doc in docs:
            item = {
                "id": doc.get("equipmentId"),
                "name": doc.get("name"),
                "type": doc.get("type"),
                "zone": doc.get("zone"),
                "status": doc.get("status"),
                "last_reading": doc.get("lastReading"),
                "_cached": True,
                "_syncedAt": doc.get("syncedAt").isoformat() if isinstance(doc.get("syncedAt"), datetime) else doc.get("syncedAt"),
            }
            # Merge extra metadata back in
            if doc.get("metadata"):
                item.update(doc["metadata"])
            result.append(item)
        return result

    # =========================================================================
    # Alerts
    # =========================================================================

    @staticmethod
    async def get_alerts(
        block_id: str,
        severity: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get cached alerts for a block.

        Args:
            block_id: Block UUID string.
            severity: Optional severity filter.

        Returns:
            List of alert documents.
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {"blockId": block_id}
        if severity:
            query["severity"] = severity

        cursor = db["sensehub_alerts_cache"].find(
            query, {"_id": 0}
        ).sort("syncedAt", -1)
        return await cursor.to_list(length=500)

    @staticmethod
    async def get_alerts_as_list(block_id: str, severity: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Return cached alerts in the same shape as live SenseHub response.
        """
        docs = await SenseHubCacheQueryService.get_alerts(block_id, severity)
        result = []
        for doc in docs:
            item = {
                "id": doc.get("alertId"),
                "severity": doc.get("severity"),
                "message": doc.get("message"),
                "acknowledged": doc.get("acknowledged", False),
                "_cached": True,
                "_syncedAt": doc.get("syncedAt").isoformat() if isinstance(doc.get("syncedAt"), datetime) else doc.get("syncedAt"),
            }
            if doc.get("alertData"):
                item.update(doc["alertData"])
            result.append(item)
        return result

    # =========================================================================
    # Lab Data
    # =========================================================================

    @staticmethod
    async def get_lab_latest(
        block_id: str,
        zone_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get the latest lab reading per nutrient for a block.

        Uses aggregation to pick the most recent reading per nutrient+zone.
        """
        db = farm_db.get_database()

        match_stage: Dict[str, Any] = {"blockId": block_id}
        if zone_id:
            match_stage["zone"] = zone_id

        pipeline = [
            {"$match": match_stage},
            {"$sort": {"timestamp": -1}},
            {
                "$group": {
                    "_id": {"nutrient": "$nutrient", "zone": "$zone"},
                    "value": {"$first": "$value"},
                    "unit": {"$first": "$unit"},
                    "timestamp": {"$first": "$timestamp"},
                    "syncedAt": {"$first": "$syncedAt"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "nutrient": "$_id.nutrient",
                    "zone": "$_id.zone",
                    "value": 1,
                    "unit": 1,
                    "timestamp": 1,
                    "syncedAt": 1,
                    "_cached": {"$literal": True},
                }
            },
            {"$sort": {"nutrient": 1, "zone": 1}},
        ]

        return await db["sensehub_lab_cache"].aggregate(pipeline).to_list(length=200)

    @staticmethod
    async def get_lab_readings(
        block_id: str,
        nutrient: Optional[str] = None,
        zone_id: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
    ) -> Dict[str, Any]:
        """
        Get historical lab readings with optional filters.
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {"blockId": block_id}

        if nutrient:
            query["nutrient"] = nutrient
        if zone_id:
            query["zone"] = zone_id
        if from_date or to_date:
            ts_filter: Dict[str, str] = {}
            if from_date:
                ts_filter["$gte"] = from_date
            if to_date:
                ts_filter["$lte"] = to_date
            query["timestamp"] = ts_filter

        total = await db["sensehub_lab_cache"].count_documents(query)
        cursor = (
            db["sensehub_lab_cache"]
            .find(query, {"_id": 0})
            .sort("timestamp", -1)
            .limit(limit)
        )
        readings = await cursor.to_list(length=limit)

        # Add _cached flag
        for r in readings:
            r["_cached"] = True

        return {
            "readings": readings,
            "total": total,
            "limit": limit,
            "offset": 0,
            "_cached": True,
        }

    # =========================================================================
    # Snapshots
    # =========================================================================

    @staticmethod
    async def get_snapshots(
        block_id: str,
        camera_id: Optional[int] = None,
        limit: int = 20,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Get cached snapshots for a block, optionally filtered by camera and date.
        """
        db = farm_db.get_database()
        query: Dict[str, Any] = {"blockId": block_id}

        if camera_id is not None:
            query["cameraId"] = camera_id

        if date_from or date_to:
            dt_filter: Dict[str, Any] = {}
            if date_from:
                try:
                    dt_filter["$gte"] = datetime.fromisoformat(date_from)
                except ValueError:
                    pass
            if date_to:
                try:
                    dt_filter["$lte"] = datetime.fromisoformat(date_to)
                except ValueError:
                    pass
            if dt_filter:
                query["capturedAt"] = dt_filter

        cursor = (
            db["sensehub_snapshots_cache"]
            .find(query, {"_id": 0})
            .sort("capturedAt", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)

        # Serialize datetimes
        for doc in docs:
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()

        return docs

    @staticmethod
    async def get_snapshot_by_id(
        block_id: str, snapshot_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get a single snapshot by its snapshotId."""
        db = farm_db.get_database()
        doc = await db["sensehub_snapshots_cache"].find_one(
            {"blockId": block_id, "snapshotId": snapshot_id},
            {"_id": 0},
        )
        if doc:
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()
        return doc

    @staticmethod
    async def get_latest_snapshots(block_id: str) -> List[Dict[str, Any]]:
        """Get the most recent snapshot per camera for a block."""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"blockId": block_id}},
            {"$sort": {"capturedAt": -1}},
            {
                "$group": {
                    "_id": "$cameraId",
                    "cameraName": {"$first": "$cameraName"},
                    "snapshotId": {"$first": "$snapshotId"},
                    "filename": {"$first": "$filename"},
                    "localPath": {"$first": "$localPath"},
                    "fileSize": {"$first": "$fileSize"},
                    "capturedAt": {"$first": "$capturedAt"},
                    "syncedAt": {"$first": "$syncedAt"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "cameraId": "$_id",
                    "cameraName": 1,
                    "snapshotId": 1,
                    "filename": 1,
                    "localPath": 1,
                    "fileSize": 1,
                    "capturedAt": 1,
                    "syncedAt": 1,
                }
            },
            {"$sort": {"cameraId": 1}},
        ]

        docs = await db["sensehub_snapshots_cache"].aggregate(pipeline).to_list(length=50)

        for doc in docs:
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()

        return docs

    # =========================================================================
    # Sync history
    # =========================================================================

    @staticmethod
    async def get_sync_history(limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent sync log entries."""
        db = farm_db.get_database()
        cursor = (
            db["sensehub_sync_log"]
            .find({}, {"_id": 0})
            .sort("startedAt", -1)
            .limit(limit)
        )
        docs = await cursor.to_list(length=limit)

        # Serialize datetimes
        for doc in docs:
            for key, val in list(doc.items()):
                if isinstance(val, datetime):
                    doc[key] = val.isoformat()

        return docs

    # =========================================================================
    # Stats
    # =========================================================================

    @staticmethod
    async def get_cache_stats() -> Dict[str, Any]:
        """Get cache collection statistics."""
        db = farm_db.get_database()

        eq_count = await db["sensehub_equipment_cache"].count_documents({})
        alert_count = await db["sensehub_alerts_cache"].count_documents({})
        lab_count = await db["sensehub_lab_cache"].count_documents({})
        snap_count = await db["sensehub_snapshots_cache"].count_documents({})
        sync_count = await db["sensehub_sync_log"].count_documents({})

        # Get last sync entry
        last_sync = await db["sensehub_sync_log"].find_one(
            {}, {"_id": 0}, sort=[("startedAt", -1)]
        )
        if last_sync:
            for key, val in list(last_sync.items()):
                if isinstance(val, datetime):
                    last_sync[key] = val.isoformat()

        return {
            "equipment": eq_count,
            "alerts": alert_count,
            "labReadings": lab_count,
            "snapshots": snap_count,
            "syncLogEntries": sync_count,
            "lastSync": last_sync,
        }
