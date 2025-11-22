"""
Block Alert Repository - Data Access Layer

Handles all database operations for block alerts.
"""

from typing import List, Optional, Tuple
from uuid import UUID
from datetime import datetime
import logging

from ...models.alert import (
    Alert, AlertCreate, AlertResolve,
    AlertStatus, AlertSeverity, AlertType
)
from ..database import farm_db

logger = logging.getLogger(__name__)


class AlertRepository:
    """Repository for Alert data access"""

    @staticmethod
    async def create(alert_data: AlertCreate, user_id: UUID, user_email: str) -> Alert:
        """Create a new alert"""
        db = farm_db.get_database()

        # Get farm ID from block
        block = await db.blocks.find_one({"blockId": str(alert_data.blockId)})
        if not block:
            raise Exception(f"Block not found: {alert_data.blockId}")

        farm_id = block["farmId"]

        # Create alert document
        alert = Alert(
            **alert_data.model_dump(),
            farmId=UUID(farm_id),
            createdBy=user_id,
            createdByEmail=user_email
        )

        alert_dict = alert.model_dump()
        alert_dict["alertId"] = str(alert_dict["alertId"])
        alert_dict["blockId"] = str(alert_dict["blockId"])
        alert_dict["farmId"] = str(alert_dict["farmId"])
        alert_dict["createdBy"] = str(alert_dict["createdBy"])

        result = await db.block_alerts.insert_one(alert_dict)

        if not result.inserted_id:
            raise Exception("Failed to create alert")

        logger.info(f"[Alert Repository] Created alert: {alert.alertId} for block {alert.blockId}")
        return alert

    @staticmethod
    async def get_by_id(alert_id: UUID) -> Optional[Alert]:
        """Get alert by ID"""
        db = farm_db.get_database()

        alert_doc = await db.block_alerts.find_one({"alertId": str(alert_id)})

        if not alert_doc:
            return None

        return Alert(**alert_doc)

    @staticmethod
    async def get_by_block(
        block_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None
    ) -> Tuple[List[Alert], int]:
        """Get alerts for a block with filters"""
        db = farm_db.get_database()

        # Build query
        query = {"blockId": str(block_id)}

        if status:
            query["status"] = status.value

        if severity:
            query["severity"] = severity.value

        # Get total count
        total = await db.block_alerts.count_documents(query)

        # Get paginated results (most recent first)
        cursor = db.block_alerts.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        alert_docs = await cursor.to_list(length=limit)

        alerts = [Alert(**doc) for doc in alert_docs]

        return alerts, total

    @staticmethod
    async def get_by_farm(
        farm_id: UUID,
        skip: int = 0,
        limit: int = 100,
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None
    ) -> Tuple[List[Alert], int]:
        """Get all alerts for a farm with filters"""
        db = farm_db.get_database()

        # Build query
        query = {"farmId": str(farm_id)}

        if status:
            query["status"] = status.value

        if severity:
            query["severity"] = severity.value

        # Get total count
        total = await db.block_alerts.count_documents(query)

        # Get paginated results
        cursor = db.block_alerts.find(query).sort("createdAt", -1).skip(skip).limit(limit)
        alert_docs = await cursor.to_list(length=limit)

        alerts = [Alert(**doc) for doc in alert_docs]

        return alerts, total

    @staticmethod
    async def get_active_alerts_by_block(block_id: UUID) -> List[Alert]:
        """Get all active alerts for a block"""
        db = farm_db.get_database()

        cursor = db.block_alerts.find({
            "blockId": str(block_id),
            "status": AlertStatus.ACTIVE.value
        }).sort("createdAt", -1)

        alert_docs = await cursor.to_list(length=None)

        return [Alert(**doc) for doc in alert_docs]

    @staticmethod
    async def resolve(
        alert_id: UUID,
        user_id: UUID,
        user_email: str,
        resolution_notes: str
    ) -> Optional[Alert]:
        """Resolve an alert"""
        db = farm_db.get_database()

        update_dict = {
            "status": AlertStatus.RESOLVED.value,
            "resolvedBy": str(user_id),
            "resolvedByEmail": user_email,
            "resolvedAt": datetime.utcnow(),
            "resolutionNotes": resolution_notes
        }

        result = await db.block_alerts.update_one(
            {"alertId": str(alert_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Alert Repository] Resolved alert: {alert_id}")
        return await AlertRepository.get_by_id(alert_id)

    @staticmethod
    async def dismiss(alert_id: UUID, user_id: UUID, user_email: str) -> Optional[Alert]:
        """Dismiss an alert without resolution"""
        db = farm_db.get_database()

        update_dict = {
            "status": AlertStatus.DISMISSED.value,
            "resolvedBy": str(user_id),
            "resolvedByEmail": user_email,
            "resolvedAt": datetime.utcnow()
        }

        result = await db.block_alerts.update_one(
            {"alertId": str(alert_id)},
            {"$set": update_dict}
        )

        if result.matched_count == 0:
            return None

        logger.info(f"[Alert Repository] Dismissed alert: {alert_id}")
        return await AlertRepository.get_by_id(alert_id)

    @staticmethod
    async def delete(alert_id: UUID) -> bool:
        """Delete an alert"""
        db = farm_db.get_database()

        result = await db.block_alerts.delete_one({"alertId": str(alert_id)})

        if result.deleted_count == 0:
            return False

        logger.info(f"[Alert Repository] Deleted alert: {alert_id}")
        return True

    @staticmethod
    async def get_alert_summary_for_block(block_id: UUID) -> dict:
        """Get alert summary statistics for a block"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"blockId": str(block_id)}},
            {
                "$group": {
                    "_id": None,
                    "totalAlerts": {"$sum": 1},
                    "activeAlerts": {
                        "$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}
                    },
                    "resolvedAlerts": {
                        "$sum": {"$cond": [{"$eq": ["$status", "resolved"]}, 1, 0]}
                    },
                    "dismissedAlerts": {
                        "$sum": {"$cond": [{"$eq": ["$status", "dismissed"]}, 1, 0]}
                    },
                    "criticalAlerts": {
                        "$sum": {"$cond": [{"$eq": ["$severity", "critical"]}, 1, 0]}
                    },
                    "highAlerts": {
                        "$sum": {"$cond": [{"$eq": ["$severity", "high"]}, 1, 0]}
                    }
                }
            }
        ]

        result = await db.block_alerts.aggregate(pipeline).to_list(length=1)

        if not result:
            return {
                "totalAlerts": 0,
                "activeAlerts": 0,
                "resolvedAlerts": 0,
                "dismissedAlerts": 0,
                "criticalAlerts": 0,
                "highAlerts": 0
            }

        return result[0]

    @staticmethod
    async def calculate_average_resolution_time(block_id: UUID) -> Optional[float]:
        """Calculate average resolution time in hours for resolved alerts"""
        db = farm_db.get_database()

        pipeline = [
            {
                "$match": {
                    "blockId": str(block_id),
                    "status": AlertStatus.RESOLVED.value,
                    "resolvedAt": {"$exists": True}
                }
            },
            {
                "$project": {
                    "resolutionTimeMs": {
                        "$subtract": ["$resolvedAt", "$createdAt"]
                    }
                }
            },
            {
                "$group": {
                    "_id": None,
                    "avgResolutionTimeMs": {"$avg": "$resolutionTimeMs"}
                }
            }
        ]

        result = await db.block_alerts.aggregate(pipeline).to_list(length=1)

        if not result:
            return None

        # Convert milliseconds to hours
        avg_ms = result[0]["avgResolutionTimeMs"]
        return round(avg_ms / (1000 * 60 * 60), 2)  # ms to hours

    @staticmethod
    async def get_alerts_count_by_status(block_id: UUID) -> dict:
        """Get count of alerts by status for a block"""
        db = farm_db.get_database()

        pipeline = [
            {"$match": {"blockId": str(block_id)}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]

        result = await db.block_alerts.aggregate(pipeline).to_list(length=10)

        counts = {
            "active": 0,
            "resolved": 0,
            "dismissed": 0
        }

        for item in result:
            status = item["_id"]
            count = item["count"]
            if status in counts:
                counts[status] = count

        return counts
