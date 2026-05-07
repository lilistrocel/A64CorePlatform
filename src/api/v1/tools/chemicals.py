"""
Chemicals API

CRUD endpoints for the FertilizerChemical master catalog.
Mounted at /api/v1/farm/tools/chemicals.

All endpoints require authentication.  Write operations (POST, PATCH, DELETE)
require at least moderator / admin access (agronomist permission).
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.modules.farm_manager.middleware.auth import (
    get_current_active_user,
    CurrentUser,
    require_permission,
)
from src.modules.farm_manager.models.tools.fertilizer_chemical import (
    FertilizerChemical,
    ChemicalCreate,
    ChemicalUpdate,
)
from src.modules.farm_manager.services.tools.chemicals_repository import ChemicalsRepository
from src.modules.farm_manager.services.tools.chemicals_service import ChemicalsService
from src.modules.farm_manager.utils.responses import SuccessResponse

router = APIRouter(prefix="/chemicals", tags=["tools-chemicals"])


@router.get(
    "",
    response_model=SuccessResponse[List[FertilizerChemical]],
    summary="List chemicals",
    description="Return all chemicals for the current organisation. Pass ?archived=true to include soft-deleted ones.",
)
async def list_chemicals(
    archived: bool = Query(False, description="Include archived chemicals"),
    current_user: CurrentUser = Depends(get_current_active_user),
) -> SuccessResponse:
    """
    List all FertilizerChemical records for the authenticated user's organisation.

    Args:
        archived: When True, include archived (soft-deleted) chemicals.
        current_user: Authenticated user from JWT.

    Returns:
        SuccessResponse wrapping a list of FertilizerChemical objects.

    Raises:
        HTTPException: 400 if the user has no organisation.
    """
    org_id = _require_org(current_user)
    chemicals = await ChemicalsRepository.list_all(org_id, include_archived=archived)
    return SuccessResponse(data=chemicals, message=f"{len(chemicals)} chemical(s) found")


@router.post(
    "",
    response_model=SuccessResponse[FertilizerChemical],
    status_code=status.HTTP_201_CREATED,
    summary="Create a chemical",
)
async def create_chemical(
    body: ChemicalCreate,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Create a new FertilizerChemical in the catalog.

    Args:
        body: Chemical creation payload.
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse wrapping the created FertilizerChemical.

    Raises:
        HTTPException: 400 if user has no organisation.
        HTTPException: 409 if a non-archived chemical with the same name exists.
    """
    org_id = _require_org(current_user)
    try:
        chemical = await ChemicalsRepository.create(
            body,
            organization_id=org_id,
            created_by=UUID(current_user.userId),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    return SuccessResponse(data=chemical, message="Chemical created")


@router.patch(
    "/{chemical_id}",
    response_model=SuccessResponse[FertilizerChemical],
    summary="Update a chemical",
)
async def update_chemical(
    chemical_id: UUID,
    body: ChemicalUpdate,
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Partially update a FertilizerChemical.

    Args:
        chemical_id: Target chemical UUID.
        body: Fields to update (all optional).
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse wrapping the updated FertilizerChemical.

    Raises:
        HTTPException: 404 if not found.
        HTTPException: 409 if the new name conflicts with another chemical.
    """
    org_id = _require_org(current_user)
    try:
        updated = await ChemicalsRepository.update(chemical_id, org_id, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chemical not found",
        )
    return SuccessResponse(data=updated, message="Chemical updated")


@router.delete(
    "/{chemical_id}",
    response_model=SuccessResponse[FertilizerChemical],
    summary="Archive (soft-delete) a chemical",
)
async def archive_chemical(
    chemical_id: UUID,
    force: bool = Query(
        False,
        description=(
            "Set to true to archive even if plants reference this chemical. "
            "Without force=true, returns 409 with the list of dependent plants."
        ),
    ),
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Soft-delete a chemical by setting its archivedAt timestamp.

    If the chemical is referenced by fertigation schedules in plant_data_enhanced,
    the request will fail with 409 unless ?force=true is passed.

    Args:
        chemical_id: Target chemical UUID.
        force: Skip dependency check and archive unconditionally.
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse wrapping the archived FertilizerChemical.

    Raises:
        HTTPException: 404 if not found.
        HTTPException: 409 if chemical has dependents and force is not set.
    """
    org_id = _require_org(current_user)

    if not force:
        dependents = await ChemicalsRepository.check_dependents(chemical_id, org_id)
        if dependents:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": "Chemical referenced by plants",
                    "dependents": dependents,
                },
            )

    archived = await ChemicalsRepository.archive(chemical_id, org_id)
    if not archived:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Chemical not found",
        )
    return SuccessResponse(data=archived, message="Chemical archived")


@router.post(
    "/discover",
    response_model=SuccessResponse[List[FertilizerChemical]],
    summary="Discover chemicals from plant library",
    description=(
        "Scan all plant_data_enhanced documents and auto-create chemicals "
        "for any ingredient names not yet in the catalog."
    ),
)
async def discover_chemicals(
    current_user: CurrentUser = Depends(require_permission("agronomist")),
) -> SuccessResponse:
    """
    Auto-discover chemicals from the plant data library.

    Walks all active plant_data_enhanced documents' fertigationSchedule, collects
    unique ingredient names, and inserts FertilizerChemical entries for any that
    are not yet catalogued.

    Args:
        current_user: Authenticated user with agronomist permission.

    Returns:
        SuccessResponse wrapping a list of newly created FertilizerChemical objects.
    """
    org_id = _require_org(current_user)
    discovered = await ChemicalsService.discover_from_plant_library(
        organization_id=org_id,
        created_by=UUID(current_user.userId),
    )
    return SuccessResponse(
        data=discovered,
        message=f"Discovered {len(discovered)} new chemical(s)",
    )


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _require_org(user: CurrentUser) -> UUID:
    """
    Extract the organisation ID from the current user or raise 400.

    Args:
        user: Authenticated CurrentUser.

    Returns:
        organisation UUID.

    Raises:
        HTTPException: 400 if the user has no organisation.
    """
    if not user.organizationId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not belong to any organisation",
        )
    return UUID(user.organizationId)
