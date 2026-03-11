"""
Mushroom Management Module - Contamination Report Service

Tracks contamination incidents in growing rooms, stored in the
contamination_reports MongoDB collection. Reports can optionally
trigger quarantine of the affected room.
"""

import logging
from datetime import datetime
from typing import List
from uuid import uuid4

from fastapi import HTTPException, status

from ...models.contamination import (
    ContaminationReport,
    ContaminationReportCreate,
    ContaminationResolveRequest,
    ContaminationAction,
)
from ...models.growing_room import RoomPhase
from ..database import mushroom_db

logger = logging.getLogger(__name__)


class ContaminationService:
    """
    Service for managing contamination reports in mushroom growing rooms.

    Creating a report with quarantined=True will also transition the room
    to the QUARANTINED phase automatically.
    """

    # ---------------------------------------------------------------------------
    # Create
    # ---------------------------------------------------------------------------

    @staticmethod
    async def create_report(
        facility_id: str,
        room_id: str,
        data: ContaminationReportCreate,
        current_user
    ) -> ContaminationReport:
        """
        Create a contamination report for a growing room.

        When data.quarantined is True, the room's currentPhase is automatically
        set to 'quarantined' if the VALID_TRANSITIONS table permits it, regardless
        of the current phase (quarantine is a safety override).

        Args:
            facility_id: Parent facility ID.
            room_id: Affected growing room ID.
            data: Validated contamination report payload.
            current_user: Authenticated user who identified the contamination.

        Returns:
            The newly-created ContaminationReport document.

        Raises:
            HTTPException 404: If the room does not exist in the facility.
            HTTPException 500: If the database insert fails.
        """
        db = mushroom_db.get_database()

        # Validate room exists
        room_doc = await db.growing_rooms.find_one(
            {"roomId": room_id, "facilityId": facility_id}
        )
        if not room_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Room '{room_id}' not found in facility '{facility_id}'"
            )

        report = ContaminationReport(
            **data.model_dump(),
            reportId=str(uuid4()),
            roomId=room_id,
            facilityId=facility_id,
            isResolved=False,
            reportedBy=current_user.userId,
            reportedAt=datetime.utcnow(),
            createdAt=datetime.utcnow(),
            updatedAt=datetime.utcnow(),
        )

        doc = report.model_dump()
        try:
            await db.contamination_reports.insert_one(doc)
        except Exception as e:
            logger.error(f"[ContaminationService] insert_one failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create contamination report"
            )

        # Reason: Quarantine takes precedence over normal lifecycle transitions
        # as a safety measure — rooms with critical contamination must be isolated.
        if data.quarantined:
            await db.growing_rooms.update_one(
                {"roomId": room_id},
                {
                    "$set": {
                        "currentPhase": RoomPhase.QUARANTINED.value,
                        "updatedAt": datetime.utcnow(),
                    },
                    "$push": {
                        "phaseHistory": {
                            "fromPhase": room_doc.get("currentPhase"),
                            "toPhase": RoomPhase.QUARANTINED.value,
                            "changedAt": datetime.utcnow().isoformat(),
                            "changedBy": current_user.userId,
                            "notes": (
                                f"Auto-quarantined due to contamination report "
                                f"{report.reportId}: {data.contaminationType}"
                            ),
                        }
                    }
                }
            )
            logger.info(
                f"[ContaminationService] Room {room_id} auto-quarantined "
                f"due to contamination report {report.reportId}"
            )

        logger.info(
            f"[ContaminationService] Created contamination report {report.reportId} "
            f"for room {room_id} type={data.contaminationType} severity={data.severity} "
            f"quarantined={data.quarantined} by user {current_user.userId}"
        )
        return report

    # ---------------------------------------------------------------------------
    # List for a specific room
    # ---------------------------------------------------------------------------

    @staticmethod
    async def list_reports(
        facility_id: str,
        room_id: str
    ) -> List[ContaminationReport]:
        """
        Return all contamination reports for a specific growing room, newest first.

        Args:
            facility_id: Parent facility ID.
            room_id: Growing room ID.

        Returns:
            List of ContaminationReport documents ordered by reportedAt descending.
        """
        db = mushroom_db.get_database()
        cursor = (
            db.contamination_reports
            .find({"roomId": room_id, "facilityId": facility_id})
            .sort("reportedAt", -1)
        )

        reports: List[ContaminationReport] = []
        async for doc in cursor:
            doc.pop("_id", None)
            reports.append(ContaminationReport(**doc))

        return reports

    # ---------------------------------------------------------------------------
    # Resolve a report
    # ---------------------------------------------------------------------------

    @staticmethod
    async def resolve_report(
        report_id: str,
        data: ContaminationResolveRequest,
        current_user
    ) -> ContaminationReport:
        """
        Mark a contamination report as resolved.

        Updates isResolved, resolvedAt, resolvedBy, resolutionNotes, and
        optionally actionTaken on the report document.

        Args:
            report_id: UUID string of the contamination report.
            data: Resolution data (notes and optional updated action).
            current_user: Authenticated user resolving the incident.

        Returns:
            Updated ContaminationReport document.

        Raises:
            HTTPException 404: If the report does not exist.
            HTTPException 409: If the report is already resolved.
        """
        db = mushroom_db.get_database()

        doc = await db.contamination_reports.find_one({"reportId": report_id})
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Contamination report '{report_id}' not found"
            )

        if doc.get("isResolved", False):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Report '{report_id}' is already resolved"
            )

        resolved_at = datetime.utcnow()
        update_fields: dict = {
            "isResolved": True,
            "resolvedAt": resolved_at,
            "resolvedBy": current_user.userId,
            "updatedAt": resolved_at,
        }
        if data.resolutionNotes is not None:
            update_fields["resolutionNotes"] = data.resolutionNotes
        if data.actionTaken is not None:
            update_fields["actionTaken"] = data.actionTaken.value

        await db.contamination_reports.update_one(
            {"reportId": report_id},
            {"$set": update_fields}
        )

        logger.info(
            f"[ContaminationService] Resolved report {report_id} "
            f"by user {current_user.userId}"
        )

        # Fetch and return the updated document
        updated_doc = await db.contamination_reports.find_one({"reportId": report_id})
        updated_doc.pop("_id", None)
        return ContaminationReport(**updated_doc)
