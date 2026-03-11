"""
Mushroom Management Module - Contamination Report API Routes

Endpoints for reporting and resolving contamination incidents in growing rooms.
"""

import logging
from typing import List
from fastapi import APIRouter, Depends, status

from ...models.contamination import (
    ContaminationReport,
    ContaminationReportCreate,
    ContaminationResolveRequest,
)
from ...services.contamination.contamination_service import ContaminationService
from ...utils.responses import SuccessResponse

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    require_permission,
    CurrentUser,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# POST /facilities/{facility_id}/rooms/{room_id}/contamination
# ---------------------------------------------------------------------------

@router.post(
    "/facilities/{facility_id}/rooms/{room_id}/contamination",
    response_model=SuccessResponse[ContaminationReport],
    status_code=status.HTTP_201_CREATED,
    summary="Report a contamination incident",
    description=(
        "Create a contamination report for a growing room. "
        "Setting quarantined=true automatically transitions the room to 'quarantined' phase."
    ),
)
async def create_report(
    facility_id: str,
    room_id: str,
    report_data: ContaminationReportCreate,
    current_user: CurrentUser = Depends(require_permission("farm.operate")),
) -> SuccessResponse[ContaminationReport]:
    """
    Report a contamination incident in a growing room.

    When quarantined=True, the room's phase is immediately set to QUARANTINED
    as a safety override regardless of the current lifecycle state.
    """
    report = await ContaminationService.create_report(
        facility_id=facility_id,
        room_id=room_id,
        data=report_data,
        current_user=current_user,
    )
    return SuccessResponse(data=report, message="Contamination report created successfully")


# ---------------------------------------------------------------------------
# GET /facilities/{facility_id}/rooms/{room_id}/contamination
# ---------------------------------------------------------------------------

@router.get(
    "/facilities/{facility_id}/rooms/{room_id}/contamination",
    response_model=SuccessResponse[List[ContaminationReport]],
    summary="List contamination reports",
    description="Return all contamination reports for a growing room, newest first.",
)
async def list_reports(
    facility_id: str,
    room_id: str,
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse[List[ContaminationReport]]:
    """
    Return all contamination reports for a room, ordered by reportedAt descending.
    """
    reports = await ContaminationService.list_reports(
        facility_id=facility_id,
        room_id=room_id,
    )
    return SuccessResponse(data=reports)


# ---------------------------------------------------------------------------
# PATCH /contamination/{report_id}/resolve
# ---------------------------------------------------------------------------

@router.patch(
    "/contamination/{report_id}/resolve",
    response_model=SuccessResponse[ContaminationReport],
    summary="Resolve a contamination report",
    description=(
        "Mark a contamination report as resolved. "
        "Records who resolved it and when, along with resolution notes."
    ),
)
async def resolve_report(
    report_id: str,
    resolve_data: ContaminationResolveRequest,
    current_user: CurrentUser = Depends(require_permission("farm.manage")),
) -> SuccessResponse[ContaminationReport]:
    """
    Resolve a contamination report.

    Updates isResolved, resolvedAt, resolvedBy, and resolutionNotes.
    Returns 409 if the report is already resolved.
    """
    report = await ContaminationService.resolve_report(
        report_id=report_id,
        data=resolve_data,
        current_user=current_user,
    )
    return SuccessResponse(data=report, message="Contamination report resolved successfully")
