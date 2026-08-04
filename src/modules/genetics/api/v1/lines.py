"""
Genetics Repo Module - Line API Routes

CRUD for genetic lines — the named identities behind the physical material.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, Field

from ...models.line import Line, LineCreate, LineUpdate, LineWithStats
from ...services.database import genetics_db
from ...services.line.line_service import LineService
from ...utils.responses import PaginatedResponse, SuccessResponse, paginate

from ...middleware.auth import (
    CurrentUser,
    require_permission,
    require_super_admin_for,
    require_view,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class LinkedProfileCounts(BaseModel):
    """How many genetic lines carry each growing profile."""

    strains: Dict[str, int] = Field(
        default_factory=dict, description="mushroom_strains strainId -> line count"
    )
    plants: Dict[str, int] = Field(
        default_factory=dict, description="plant_data plantDataId -> line count"
    )


class CascadePurgeConfirm(BaseModel):
    """Body for a confirmed cascade purge.

    ``confirm`` is optional at the model level only because a ``dryRun``
    request legitimately omits it — ``LineService.cascade_purge_line``
    enforces the exact-match requirement itself, and only when
    ``dry_run`` is false. Do not read the optionality here as "confirm is
    optional for a real cascade delete" — it is not.
    """

    confirm: Optional[str] = Field(
        None,
        description=(
            "Must exactly equal the line's code to perform a real cascade "
            "delete. Not required when dryRun=true."
        ),
    )


@router.post(
    "",
    response_model=SuccessResponse[Line],
    status_code=status.HTTP_201_CREATED,
    summary="Create a genetic line",
    description="Register a new named genetic identity (strain, variety or bloodline).",
)
async def create_line(
    payload: LineCreate,
    current_user: CurrentUser = Depends(require_permission("genetics.line.manage")),
) -> SuccessResponse[Line]:
    line = await LineService.create_line(payload, current_user)
    return SuccessResponse(data=line, message="Genetic line created successfully")


@router.get(
    "",
    # LineWithStats, not Line — the response model filters unknown fields, so
    # declaring Line here would silently strip the accession rollups the
    # service computes and the repo cards depend on.
    response_model=PaginatedResponse[LineWithStats],
    summary="List genetic lines",
    description="Paginated list of genetic lines with accession rollups.",
)
async def list_lines(
    page: int = Query(1, ge=1),
    perPage: int = Query(20, ge=1, le=100),
    kind: Optional[str] = Query(None, description="plant, fungus, animal or other"),
    search: Optional[str] = Query(
        None, description="Match name, code or scientific name"
    ),
    tag: Optional[str] = Query(None),
    parentLineId: Optional[str] = Query(
        None, description="Only lines derived from this line"
    ),
    linkedStrainId: Optional[str] = Query(
        None, description="Only lines linked to this mushroom_strains growing profile"
    ),
    linkedPlantDataId: Optional[str] = Query(
        None, description="Only lines linked to this plant_data growing profile"
    ),
    activeOnly: bool = Query(False),
    withStats: bool = Query(True, description="Include accession rollups"),
    current_user: CurrentUser = Depends(require_view),
) -> PaginatedResponse[LineWithStats]:
    lines, total = await LineService.list_lines(
        skip=(page - 1) * perPage,
        limit=perPage,
        kind=kind,
        search=search,
        tag=tag,
        parent_line_id=parentLineId,
        linked_strain_id=linkedStrainId,
        linked_plant_data_id=linkedPlantDataId,
        active_only=activeOnly,
        with_stats=withStats,
    )
    return PaginatedResponse(data=lines, meta=paginate(total, page, perPage))


@router.get(
    # Declared before /{line_id} so the literal path is not swallowed by the
    # path-parameter route.
    "/linked-counts",
    response_model=SuccessResponse[LinkedProfileCounts],
    summary="Count genetic lines per linked growing profile",
    description=(
        "Reverse link for the Strain Library and Plant Library: how many genetic "
        "lines carry each growing profile. Returned as two id->count maps so a "
        "library page can annotate every row from a single request."
    ),
)
async def get_linked_counts(
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[LinkedProfileCounts]:
    counts = await LineService.count_by_linked_profile()
    return SuccessResponse(data=LinkedProfileCounts(**counts))


@router.get(
    "/{line_id}",
    response_model=SuccessResponse[LineWithStats],
    summary="Get a genetic line",
    description="Retrieve one line with its accession rollups.",
)
async def get_line(
    line_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[LineWithStats]:
    line = await LineService.get_line_with_stats(line_id)
    return SuccessResponse(data=line)


@router.patch(
    "/{line_id}",
    response_model=SuccessResponse[Line],
    summary="Update a genetic line",
    description="Partially update a line. Only supplied fields change.",
)
async def update_line(
    line_id: str,
    payload: LineUpdate,
    current_user: CurrentUser = Depends(require_permission("genetics.line.manage")),
) -> SuccessResponse[Line]:
    line = await LineService.update_line(line_id, payload)
    return SuccessResponse(data=line, message="Genetic line updated successfully")


@router.delete(
    "/{line_id}",
    response_model=SuccessResponse[Line],
    summary="Deactivate a genetic line",
    description=(
        "Soft-delete a line that HAS material on it (accessions, propagation "
        "history, observations, ...) — sets isActive: false and keeps the "
        "document so traceability chains stay unbroken. For a line that never "
        "accumulated any material (a typo, a duplicate, a test), use "
        "DELETE /{line_id}/purge instead, which hard-deletes but only refuses "
        "rather than cascades."
    ),
)
async def deactivate_line(
    line_id: str,
    current_user: CurrentUser = Depends(require_permission("genetics.delete")),
) -> SuccessResponse[Line]:
    line = await LineService.deactivate_line(line_id)
    return SuccessResponse(data=line, message="Genetic line deactivated")


@router.get(
    "/{line_id}/dependents",
    response_model=SuccessResponse[dict],
    summary="What would block purging this line",
    description=(
        "Counts accessions, propagation events, observations, child lines and "
        "harvests referencing this line, so the UI can explain a refusal "
        "before offering the purge action."
    ),
)
async def line_dependents(
    line_id: str,
    current_user: CurrentUser = Depends(require_view),
) -> SuccessResponse[dict]:
    return SuccessResponse(data=await LineService.line_dependents(line_id))


@router.delete(
    "/{line_id}/purge",
    response_model=SuccessResponse[dict],
    summary="Hard-delete a line — zero-dependents by default, or a confirmed cascade",
    description=(
        "**Default (cascade omitted/false):** permanently removes a line, but "
        "only when nothing references it — no accessions, propagation events, "
        "observations, child lines or harvests. Refuses with 409 and names what "
        "is blocking otherwise; never cascades. Requires `genetics.delete` "
        "(curation tier). For a line that HAS material, use the deactivate "
        "endpoint (DELETE /{line_id}) instead.\n\n"
        "**`?cascade=true` (T-809):** the deliberate escalation for a "
        "cancelled test/demo line — removes the line AND every accession, "
        "propagation event and observation recorded against it. "
        '**super_admin only.** Body must be `{"confirm": "<the line\'s exact '
        'code>"}` — a mismatch is 400 and nothing is deleted, mirroring the '
        "GitHub repo-deletion confirmation pattern. Hard-refuses with 409, "
        "regardless of `confirm`, if the line has harvests (real production "
        "yield) or child lines (real downstream work) — neither is ever "
        "cascadable. Add `?dryRun=true` to preview exactly what would be "
        "deleted (counts, accession codes, and id lists) without deleting "
        "anything and without requiring `confirm`. A real cascade delete is "
        "written to `admin_audit_log` with the full pre-deletion snapshot."
    ),
)
async def purge_line(
    line_id: str,
    cascade: bool = Query(
        False,
        description="Escalate to a confirmed cascade delete. super_admin only.",
    ),
    dryRun: bool = Query(
        False,
        description=(
            "With cascade=true, preview what would be deleted without "
            "deleting anything. No effect without cascade=true."
        ),
    ),
    payload: CascadePurgeConfirm = Body(default_factory=CascadePurgeConfirm),
    current_user: CurrentUser = Depends(require_permission("genetics.delete")),
) -> SuccessResponse[dict]:
    if not cascade:
        result = await LineService.purge_line(line_id, current_user)
        return SuccessResponse(data=result, message=f"Line {result['code']} purged")

    # Reason: this one route serves two permission tiers selected by a query
    # parameter, which Depends() cannot branch on — see
    # require_super_admin_for's docstring for why this check lives here
    # instead of in the dependency list.
    require_super_admin_for("genetics.delete.cascade", current_user)

    result = await LineService.cascade_purge_line(
        line_id=line_id,
        confirm=payload.confirm,
        current_user=current_user,
        dry_run=dryRun,
    )

    if not dryRun:
        # Reason: audit the real cascade delete with the full pre-deletion
        # snapshot (accession codes + every deleted id), matching the
        # PATCH /organizations/{id}/modules precedent — so what was
        # destroyed is reconstructable later, not just "line X was deleted".
        db = genetics_db.get_database()
        audit_entry: Dict[str, Any] = {
            "action": "genetics.line.cascade_purged",
            "targetLineId": line_id,
            "performedBy": current_user.userId,
            "performedByEmail": getattr(current_user, "email", None),
            "performedByRole": current_user.role,
            "timestamp": datetime.now(tz=timezone.utc),
            "details": {"deleted": result},
        }
        await db.admin_audit_log.insert_one(audit_entry)

    message = (
        f"Cascade purge of line {result['code']} would remove "
        f"{result['accessionsRemoved']} accessions, "
        f"{result['propagationEventsRemoved']} propagation events, "
        f"{result['observationsRemoved']} observations (dry run)"
        if dryRun
        else (
            f"Line {result['code']} cascade-purged — removed "
            f"{result['accessionsRemoved']} accessions, "
            f"{result['propagationEventsRemoved']} propagation events, "
            f"{result['observationsRemoved']} observations"
        )
    )
    return SuccessResponse(data=result, message=message)
