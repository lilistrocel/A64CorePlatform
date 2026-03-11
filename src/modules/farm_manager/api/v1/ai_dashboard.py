"""
Farm Management Module - AI Dashboard API Endpoints

Exposes read access to automated farm inspection reports and a
manual trigger for admins. The underlying service is
AIDashboardService, which runs multi-step data collection followed
by an AI summary generation pass.

Endpoints:
  GET  /ai-dashboard/latest     - Retrieve the most recent completed report
  GET  /ai-dashboard/reports    - Paginated report history
  POST /ai-dashboard/generate   - Manually trigger a new inspection (admin only)
"""

import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, status

from ...middleware.auth import CurrentUser, get_current_active_user, require_permission
from ...services.ai_dashboard.service import AIDashboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-dashboard", tags=["ai-dashboard"])


# ---------------------------------------------------------------------------
# GET /latest
# ---------------------------------------------------------------------------


@router.get(
    "/latest",
    summary="Get latest AI dashboard report",
    description=(
        "Returns the most recent completed or generation-failed inspection "
        "report. Returns 404 if no reports have been generated yet."
    ),
)
async def get_latest_report(
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Retrieve the most recent AI Dashboard report.

    Any authenticated user may call this endpoint. The report contains
    the raw inspection data collected across all farms and the AI-generated
    executive summary with recommendations.

    Returns:
        Envelope with the latest DashboardReport or 404 if none exists.

    Raises:
        HTTPException 404: No reports have been generated yet.
        HTTPException 500: Unexpected service error.
    """
    try:
        service = AIDashboardService()
        report = await service.get_latest()
    except Exception as exc:
        logger.error(
            f"[ai_dashboard] get_latest failed for user={current_user.userId}: {exc}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve latest AI dashboard report",
        )

    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No AI dashboard reports found",
        )

    return {
        "data": report.model_dump(mode="json"),
        "message": "Latest AI dashboard report",
    }


# ---------------------------------------------------------------------------
# GET /reports
# ---------------------------------------------------------------------------


@router.get(
    "/reports",
    summary="List AI dashboard reports",
    description=(
        "Returns a paginated list of all AI Dashboard inspection reports "
        "ordered by most recent first. Use skip and limit for pagination."
    ),
)
async def list_reports(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(
        10,
        ge=1,
        le=50,
        description="Maximum number of records to return (max 50)",
    ),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> Dict[str, Any]:
    """
    Retrieve a paginated list of AI Dashboard reports.

    Any authenticated user may call this endpoint.

    Args:
        skip: Number of records to skip (default 0).
        limit: Maximum number of records to return, capped at 50 (default 10).
        current_user: Authenticated user from JWT dependency.

    Returns:
        Envelope with list of serialised DashboardReport objects and
        pagination metadata.

    Raises:
        HTTPException 500: Unexpected service error.
    """
    try:
        service = AIDashboardService()
        reports, total = await service.get_reports(skip=skip, limit=limit)
    except Exception as exc:
        logger.error(
            f"[ai_dashboard] list_reports failed for user={current_user.userId}: {exc}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve AI dashboard reports",
        )

    report_list: List[Dict[str, Any]] = [
        r.model_dump(mode="json") for r in reports
    ]

    return {
        "data": report_list,
        "meta": {
            "total": total,
            "skip": skip,
            "limit": limit,
        },
        "message": "AI dashboard reports",
    }


# ---------------------------------------------------------------------------
# POST /generate
# ---------------------------------------------------------------------------


@router.post(
    "/generate",
    summary="Manually trigger an AI dashboard inspection",
    description=(
        "Runs a full farm inspection synchronously and returns the completed "
        "report. This may take 30-60 seconds depending on farm count and "
        "AI response time. Restricted to admin and super_admin roles."
    ),
    status_code=status.HTTP_200_OK,
)
async def generate_report(
    current_user: CurrentUser = Depends(require_permission("admin")),
) -> Dict[str, Any]:
    """
    Trigger a manual AI Dashboard inspection.

    Runs data collection across all farms followed by AI summary generation.
    The call is synchronous — the response is only returned once the full
    inspection completes (or fails).

    Only admin and super_admin roles may trigger manual inspections.

    Args:
        current_user: Authenticated admin user from JWT dependency.

    Returns:
        Envelope with the completed DashboardReport.

    Raises:
        HTTPException 500: If the inspection itself throws an unexpected error.
    """
    triggered_by = f"manual:{current_user.email}"

    logger.info(
        f"[ai_dashboard] Manual inspection triggered by {current_user.email} "
        f"(userId={current_user.userId})"
    )

    try:
        service = AIDashboardService()
        report = await service.run_inspection(triggered_by=triggered_by)
    except Exception as exc:
        logger.error(
            f"[ai_dashboard] Manual inspection failed "
            f"(triggeredBy={triggered_by}): {exc}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI dashboard inspection failed: {str(exc)}",
        )

    return {
        "data": report.model_dump(mode="json"),
        "message": "AI dashboard inspection completed",
    }
