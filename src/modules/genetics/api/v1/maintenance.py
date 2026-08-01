"""
Genetics Repo Module - Maintenance API Routes (T-809)

Org-wide database hygiene: find and remove accessions, propagation events
and observations whose ``lineId`` points at a line that no longer exists.
Distinct from the line-scoped cascade purge on ``lines.py`` — see
``MaintenanceService``'s module docstring for the full reasoning, in
particular the null-lineId-is-not-an-orphan rule.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, Query

from ...services.database import genetics_db
from ...services.maintenance.maintenance_service import MaintenanceService
from ...utils.responses import SuccessResponse

from ...middleware.auth import CurrentUser, require_permission

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/orphans",
    response_model=SuccessResponse[dict],
    summary="Find orphaned genetics records",
    description=(
        "Read-only. Finds accessions, propagation events and observations "
        "whose lineId (for propagation events: every referenced lineId) "
        "points at a genetic line that no longer exists — leftovers from "
        "before this feature existed, or from a line removed by some other "
        "path. A null/absent lineId is NOT an orphan and is never reported "
        "here. Deletes nothing; requires genetics.delete (curation tier)."
    ),
)
async def get_orphans(
    current_user: CurrentUser = Depends(require_permission("genetics.delete")),
) -> SuccessResponse[dict]:
    return SuccessResponse(data=await MaintenanceService.find_orphans())


@router.delete(
    "/orphans",
    response_model=SuccessResponse[dict],
    summary="Delete orphaned genetics records",
    description=(
        "Removes exactly what GET /orphans reports — by explicit id list, "
        "never a broad filter. super_admin only. Add ?dryRun=true to preview "
        "(same response shape, deletes nothing). A real delete is written to "
        "admin_audit_log with the full pre-deletion snapshot."
    ),
)
async def delete_orphans(
    dryRun: bool = Query(False, description="Preview only; deletes nothing."),
    current_user: CurrentUser = Depends(require_permission("genetics.maintenance")),
) -> SuccessResponse[dict]:
    result = await MaintenanceService.delete_orphans(current_user, dry_run=dryRun)

    if not dryRun:
        db = genetics_db.get_database()
        audit_entry: Dict[str, Any] = {
            "action": "genetics.maintenance.orphans_deleted",
            "performedBy": current_user.userId,
            "performedByEmail": getattr(current_user, "email", None),
            "performedByRole": current_user.role,
            "timestamp": datetime.now(tz=timezone.utc),
            "details": {"deleted": result},
        }
        await db.admin_audit_log.insert_one(audit_entry)

    message = (
        f"Would remove {result['counts']['accessions']} orphaned accessions, "
        f"{result['counts']['propagationEvents']} propagation events, "
        f"{result['counts']['observations']} observations (dry run)"
        if dryRun
        else (
            f"Removed {result['counts']['accessions']} orphaned accessions, "
            f"{result['counts']['propagationEvents']} propagation events, "
            f"{result['counts']['observations']} observations"
        )
    )
    return SuccessResponse(data=result, message=message)
