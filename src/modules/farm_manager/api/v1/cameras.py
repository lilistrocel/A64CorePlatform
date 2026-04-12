"""
Camera API Routes

Endpoints for listing cameras, browsing cached snapshots, triggering
captures, and serving snapshot images from local storage.
"""

import asyncio
import logging
from pathlib import Path
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse

from ...middleware.auth import get_current_active_user, CurrentUser, require_permission
from ...services.sensehub.cache_query_service import SenseHubCacheQueryService
from ...services.sensehub.sensehub_connection_service import SenseHubConnectionService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/farms/{farm_id}/blocks/{block_id}/cameras",
    tags=["cameras"],
)


# =============================================================================
# List cameras (live MCP with cache fallback)
# =============================================================================

@router.get("/", summary="List cameras for a block")
async def list_cameras(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """
    List cameras connected to the block's SenseHub.

    Makes a live MCP call. If the hub is unreachable, returns an empty list.
    """
    try:
        mcp_client = await SenseHubConnectionService.get_mcp_client(farm_id, block_id)
        cameras = await asyncio.wait_for(mcp_client.get_cameras(), timeout=10.0)
        return {"cameras": cameras if isinstance(cameras, list) else [], "live": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.debug(f"[Cameras] Live MCP call failed for {block_id}: {exc}")
        return {"cameras": [], "live": False, "error": "Hub unreachable"}


# =============================================================================
# Trigger immediate capture
# =============================================================================

@router.post("/{camera_id}/capture", summary="Trigger immediate snapshot capture")
async def capture_snapshot(
    farm_id: UUID,
    block_id: UUID,
    camera_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Trigger an immediate snapshot capture on a specific camera."""
    try:
        mcp_client = await SenseHubConnectionService.get_mcp_client(farm_id, block_id)
        result = await asyncio.wait_for(
            mcp_client.capture_camera_snapshot(camera_id), timeout=15.0
        )
        return result
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to trigger capture: {exc}",
        )


# =============================================================================
# List cached snapshots
# =============================================================================

@router.get("/{camera_id}/snapshots", summary="List cached snapshots for a camera")
async def list_snapshots(
    farm_id: UUID,
    block_id: UUID,
    camera_id: int,
    limit: int = Query(20, ge=1, le=100),
    date_from: Optional[str] = Query(None, alias="from"),
    date_to: Optional[str] = Query(None, alias="to"),
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return cached snapshot metadata for a camera, sorted newest first."""
    snapshots = await SenseHubCacheQueryService.get_snapshots(
        block_id=str(block_id),
        camera_id=camera_id,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
    )
    return {"snapshots": snapshots, "count": len(snapshots)}


# =============================================================================
# Latest snapshot per camera
# =============================================================================

@router.get("/snapshots/latest", summary="Get most recent snapshot per camera")
async def latest_snapshots(
    farm_id: UUID,
    block_id: UUID,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Return the most recent cached snapshot for each camera on the block."""
    snapshots = await SenseHubCacheQueryService.get_latest_snapshots(str(block_id))
    return {"snapshots": snapshots, "count": len(snapshots)}


# =============================================================================
# Serve snapshot image
# =============================================================================

@router.get(
    "/snapshots/{snapshot_id}/image",
    summary="Serve a snapshot image file",
    responses={200: {"content": {"image/jpeg": {}}}},
)
async def serve_snapshot_image(
    farm_id: UUID,
    block_id: UUID,
    snapshot_id: int,
    current_user: CurrentUser = Depends(get_current_active_user),
):
    """Serve a cached snapshot JPEG from local storage."""
    doc = await SenseHubCacheQueryService.get_snapshot_by_id(
        str(block_id), snapshot_id
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    local_path = Path(doc.get("localPath", ""))
    if not local_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Snapshot file not found on disk",
        )

    return FileResponse(
        path=str(local_path),
        media_type="image/jpeg",
        filename=doc.get("filename", f"snapshot_{snapshot_id}.jpg"),
    )
