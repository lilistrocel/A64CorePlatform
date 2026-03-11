"""
Mushroom Management Module - Environment Log Service

Records and retrieves climate readings (temperature, humidity, CO2) for
growing rooms, stored in the room_environment_logs MongoDB collection.
"""

import logging
from datetime import datetime
from typing import List, Optional
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.environment import EnvironmentLog, EnvironmentLogCreate
from ...models.growing_room import GrowingRoom
from ..database import mushroom_db

logger = logging.getLogger(__name__)


class EnvironmentService:
    """
    Service for managing environment logs for growing rooms.

    Each log entry captures one point-in-time reading from sensors or manual
    entry. The service also denormalises the room's current phase for easier
    retrospective analysis.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_log(
        facility_id: str,
        room_id: str,
        data: EnvironmentLogCreate,
        current_user
    ) -> EnvironmentLog:
        """
        Create an environment reading log entry for a growing room.

        Automatically captures the room's currentPhase at the time of recording
        and denormalises it into the log document.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.
            data: Validated environment reading payload.
            current_user: Authenticated user or sensor that performed the reading.

        Returns:
            The newly-created EnvironmentLog document.

        Raises:
            HTTPException 404: If the room does not exist in the facility.
            HTTPException 500: If the database insert fails.
        """
        db = mushroom_db.get_database()

        # Validate room exists and fetch currentPhase for denormalisation
        room_doc = await db.growing_rooms.find_one(
            {"roomId": room_id, "facilityId": facility_id},
            {"currentPhase": 1}
        )
        if not room_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room '{room_id}' not found in facility '{facility_id}'"
            )

        log = EnvironmentLog(
            **data.model_dump(),
            logId=str(uuid4()),
            roomId=room_id,
            facilityId=facility_id,
            currentPhase=room_doc.get("currentPhase"),
            recordedBy=current_user.userId,
            recordedAt=datetime.utcnow(),
            createdAt=datetime.utcnow(),
        )

        doc = log.model_dump()
        try:
            await db.room_environment_logs.insert_one(doc)
        except Exception as e:
            logger.error(f"[EnvironmentService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create environment log"
            )

        logger.info(
            f"[EnvironmentService] Logged environment for room {room_id} "
            f"(temp={data.temperature}, humidity={data.humidity}, co2={data.co2Level}) "
            f"by user {current_user.userId}"
        )
        return log

    # ---------------------------------------------------------------------------
    # List recent logs
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_logs(
        facility_id: str,
        room_id: str,
        limit: int = 50
    ) -> List[EnvironmentLog]:
        """
        Return the most recent environment logs for a growing room.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.
            limit: Maximum number of recent records to return (default 50).

        Returns:
            List of EnvironmentLog documents ordered by recordedAt descending.
        """
        db = mushroom_db.get_database()
        cursor = (
            db.room_environment_logs
            .find({"roomId": room_id, "facilityId": facility_id})
            .sort("recordedAt", -1)
            .limit(limit)
        )

        logs: List[EnvironmentLog] = []
        async for doc in cursor:
            doc.pop("_id", None)
            logs.append(EnvironmentLog(**doc))

        return logs

    # ---------------------------------------------------------------------------
    # Latest single reading
    # ---------------------------------------------------------------------------

    @staticmethod
    async def get_latest(
        facility_id: str,
        room_id: str
    ) -> Optional[EnvironmentLog]:
        """
        Return the single most recent environment log for a growing room.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.

        Returns:
            The most recent EnvironmentLog, or None if no readings exist.
        """
        db = mushroom_db.get_database()
        doc = await db.room_environment_logs.find_one(
            {"roomId": room_id, "facilityId": facility_id},
            sort=[("recordedAt", -1)]
        )

        if not doc:
            return None

        doc.pop("_id", None)
        return EnvironmentLog(**doc)
