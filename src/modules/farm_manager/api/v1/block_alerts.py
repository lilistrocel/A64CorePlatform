"""
Block Alert API Routes

Endpoints for managing alerts and block status integration.
"""

from fastapi import APIRouter, Depends, Query, status
from typing import Optional, List
from uuid import UUID

from ...models.alert import (
    Alert, AlertCreate, AlertResolve,
    AlertStatus, AlertSeverity
)
from ...services.block.alert_service import AlertService
from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...utils.responses import SuccessResponse, PaginatedResponse, PaginationMeta

router = APIRouter(prefix="/farms/{farm_id}/blocks/{block_id}/alerts", tags=["block-alerts"])


@router.post(
    "",
    response_model=SuccessResponse[Alert],
    status_code=status.HTTP_201_CREATED,
    summary="Create an alert"
)
async def create_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_data: AlertCreate,
    changeBlockStatus: bool = Query(True, description="Whether to change block status to ALERT"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Create a new alert for a block.

    **Anyone can create alerts** - no special permission required.

    **Automatic Features**:
    - If `changeBlockStatus=true` (default), block status changes to ALERT
    - Previous status is saved and can be restored when alert is resolved
    - Multiple alerts can exist for a block simultaneously

    **Validations**:
    - Block must exist
    - Alert title and description are required
    - Severity must be: low, medium, high, or critical
    """
    # Verify blockId in alert_data matches URL parameter
    if alert_data.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Block ID in request body must match URL parameter"
        )

    alert = await AlertService.create_alert(
        alert_data,
        current_user.userId,
        current_user.email,
        change_block_status=changeBlockStatus
    )

    return SuccessResponse(
        data=alert,
        message="Alert created successfully"
    )


@router.get(
    "",
    response_model=PaginatedResponse[Alert],
    summary="List alerts for a block"
)
async def list_block_alerts(
    farm_id: UUID,
    block_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[AlertStatus] = Query(None, alias="status", description="Filter by status"),
    severity: Optional[AlertSeverity] = Query(None, description="Filter by severity"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of alerts for a block with pagination.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `status`: Filter by alert status (active, resolved, dismissed)
    - `severity`: Filter by severity (low, medium, high, critical)
    """
    alerts, total, total_pages = await AlertService.list_alerts_by_block(
        block_id,
        page=page,
        per_page=perPage,
        status=status_filter,
        severity=severity
    )

    return PaginatedResponse(
        data=alerts,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )


@router.get(
    "/active",
    response_model=SuccessResponse[List[Alert]],
    summary="Get active alerts for a block"
)
async def get_active_alerts(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get all currently active alerts for a block.

    Useful for dashboard displays and quick checks.
    """
    active_alerts = await AlertService.get_active_alerts_for_block(block_id)

    return SuccessResponse(data=active_alerts)


@router.get(
    "/summary",
    response_model=SuccessResponse[dict],
    summary="Get alert summary for a block"
)
async def get_alert_summary(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get comprehensive alert summary for a block.

    Returns:
    - Total alerts count
    - Active alerts count
    - Resolved alerts count
    - Critical alerts count
    - Status breakdown (active/resolved/dismissed counts)
    """
    summary = await AlertService.get_alert_summary(block_id)

    return SuccessResponse(data=summary)


@router.get(
    "/{alert_id}",
    response_model=SuccessResponse[Alert],
    summary="Get alert by ID"
)
async def get_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get a specific alert by ID.
    """
    alert = await AlertService.get_alert(alert_id)

    # Verify alert belongs to the specified block
    if alert.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found in this block"
        )

    return SuccessResponse(data=alert)


@router.post(
    "/{alert_id}/resolve",
    response_model=SuccessResponse[Alert],
    summary="Resolve an alert"
)
async def resolve_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_id: UUID,
    resolution_data: AlertResolve,
    restoreBlockStatus: bool = Query(True, description="Whether to restore block to previousStatus"),
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Resolve an alert with resolution notes.

    Requires **farm.operate** permission.

    **Automatic Features**:
    - If `restoreBlockStatus=true` (default) and no other active alerts exist,
      block status is restored to previousStatus
    - Resolution timestamp and user are recorded
    - Alert status changes to 'resolved'

    **Requirements**:
    - Alert must be in 'active' status
    - Resolution notes are required
    """
    alert = await AlertService.get_alert(alert_id)

    # Verify alert belongs to the specified block
    if alert.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found in this block"
        )

    resolved_alert = await AlertService.resolve_alert(
        alert_id,
        resolution_data,
        current_user.userId,
        current_user.email,
        restore_block_status=restoreBlockStatus
    )

    return SuccessResponse(
        data=resolved_alert,
        message="Alert resolved successfully"
    )


@router.post(
    "/{alert_id}/dismiss",
    response_model=SuccessResponse[Alert],
    summary="Dismiss an alert"
)
async def dismiss_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.operate"))
):
    """
    Dismiss an alert without resolution notes.

    Requires **farm.operate** permission.

    Use this when the alert is no longer relevant but doesn't need formal resolution.

    **Requirements**:
    - Alert must be in 'active' status
    """
    alert = await AlertService.get_alert(alert_id)

    # Verify alert belongs to the specified block
    if alert.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found in this block"
        )

    dismissed_alert = await AlertService.dismiss_alert(
        alert_id,
        current_user.userId,
        current_user.email
    )

    return SuccessResponse(
        data=dismissed_alert,
        message="Alert dismissed successfully"
    )


@router.delete(
    "/{alert_id}",
    response_model=SuccessResponse[dict],
    summary="Delete an alert"
)
async def delete_alert(
    farm_id: UUID,
    block_id: UUID,
    alert_id: UUID,
    current_user: CurrentUser = Depends(require_permission("farm.manage"))
):
    """
    Delete an alert permanently.

    Requires **farm.manage** permission.

    **Use with caution**: This is a permanent deletion. Consider dismissing instead.
    """
    alert = await AlertService.get_alert(alert_id)

    # Verify alert belongs to the specified block
    if alert.blockId != block_id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found in this block"
        )

    await AlertService.delete_alert(alert_id)

    return SuccessResponse(
        data={"alertId": str(alert_id)},
        message="Alert deleted successfully"
    )


# Farm-level alert endpoints
farm_router = APIRouter(prefix="/farms/{farm_id}/alerts", tags=["farm-alerts"])


@farm_router.get(
    "",
    response_model=PaginatedResponse[Alert],
    summary="List all alerts in a farm"
)
async def list_farm_alerts(
    farm_id: UUID,
    page: int = Query(1, ge=1, description="Page number"),
    perPage: int = Query(20, ge=1, le=100, description="Items per page"),
    status_filter: Optional[AlertStatus] = Query(None, alias="status", description="Filter by status"),
    severity: Optional[AlertSeverity] = Query(None, description="Filter by severity"),
    current_user: CurrentUser = Depends(get_current_active_user)
):
    """
    Get list of all alerts across all blocks in a farm.

    **Query Parameters**:
    - `page`: Page number (default: 1)
    - `perPage`: Items per page (default: 20, max: 100)
    - `status`: Filter by alert status (active, resolved, dismissed)
    - `severity`: Filter by severity (low, medium, high, critical)
    """
    alerts, total, total_pages = await AlertService.list_alerts_by_farm(
        farm_id,
        page=page,
        per_page=perPage,
        status=status_filter,
        severity=severity
    )

    return PaginatedResponse(
        data=alerts,
        meta=PaginationMeta(
            total=total,
            page=page,
            perPage=perPage,
            totalPages=total_pages
        )
    )
