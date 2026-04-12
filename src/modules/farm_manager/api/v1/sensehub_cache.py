"""
SenseHub Cache API Routes

Endpoints for querying cached SenseHub data and managing the sync service.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from uuid import UUID
import logging

from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...services.sensehub.cache_query_service import SenseHubCacheQueryService
from ...services.sensehub.sync_service import SenseHubSyncService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/sensehub-cache",
    tags=["sensehub-cache"],
)


# =============================================================================
# Sync Status & Management
# =============================================================================

@router.get("/status", summary="Get SenseHub sync service status")
async def get_sync_status(
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return sync service status: last sync time, running state, cache stats."""
    service = SenseHubSyncService.get_instance()
    status = service.get_status()

    cache_stats = await SenseHubCacheQueryService.get_cache_stats()

    return {
        **status,
        "cacheStats": cache_stats,
    }


@router.get("/history", summary="Get recent sync log entries")
async def get_sync_history(
    limit: int = Query(10, ge=1, le=50),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return recent sync log entries."""
    return await SenseHubCacheQueryService.get_sync_history(limit=limit)


@router.post("/sync", summary="Trigger manual SenseHub sync")
async def trigger_manual_sync(
    current_user: CurrentUser = Depends(require_permission("admin")),
):
    """
    Trigger an immediate SenseHub data sync. Admin-only.

    This runs synchronously and may take several minutes depending on
    the number of IoT-connected blocks.
    """
    service = SenseHubSyncService.get_instance()

    if service._db is None:
        raise HTTPException(
            status_code=503,
            detail="Sync service not initialized",
        )

    result = await service.run_sync()

    # Remove MongoDB _id and serialize datetimes
    result.pop("_id", None)
    for key in ("startedAt", "completedAt"):
        if hasattr(result.get(key), "isoformat"):
            result[key] = result[key].isoformat()

    return result


# =============================================================================
# Cached Equipment
# =============================================================================

@router.get(
    "/blocks/{block_id}/equipment",
    summary="Get cached equipment for a block",
)
async def get_cached_equipment(
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return cached equipment data for a block."""
    data = await SenseHubCacheQueryService.get_equipment(str(block_id))
    if not data:
        raise HTTPException(
            status_code=404,
            detail="No cached equipment data for this block",
        )
    return data


# =============================================================================
# Cached Lab Data
# =============================================================================

@router.get(
    "/blocks/{block_id}/lab/latest",
    summary="Get latest cached lab readings per nutrient",
)
async def get_cached_lab_latest(
    block_id: UUID,
    zone_id: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return the most recent cached lab reading for each nutrient."""
    return await SenseHubCacheQueryService.get_lab_latest(
        str(block_id), zone_id=zone_id
    )


@router.get(
    "/blocks/{block_id}/lab/readings",
    summary="Get historical cached lab readings",
)
async def get_cached_lab_readings(
    block_id: UUID,
    nutrient: Optional[str] = Query(None),
    zone_id: Optional[str] = Query(None),
    from_dt: Optional[str] = Query(None, alias="from"),
    to_dt: Optional[str] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=500),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return historical cached lab readings with optional filters."""
    return await SenseHubCacheQueryService.get_lab_readings(
        str(block_id),
        nutrient=nutrient,
        zone_id=zone_id,
        from_date=from_dt,
        to_date=to_dt,
        limit=limit,
    )


# =============================================================================
# Cached Alerts
# =============================================================================

@router.get(
    "/blocks/{block_id}/alerts",
    summary="Get cached alerts for a block",
)
async def get_cached_alerts(
    block_id: UUID,
    severity: Optional[str] = Query(None),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return cached alerts for a block."""
    return await SenseHubCacheQueryService.get_alerts(
        str(block_id), severity=severity
    )
